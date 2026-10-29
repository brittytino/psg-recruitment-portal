// Internal DOCX -> PDF conversion service wrapping LibreOffice headless.
// Reachable only on the private Docker network; never published to the host in production.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 3100);
const MAX_BYTES = Number(process.env.CONVERTER_MAX_BYTES ?? 25 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.CONVERTER_TIMEOUT_MS ?? 120_000);
const TOKEN = process.env.CONVERTER_TOKEN ?? "";
const MAX_CONCURRENT = Number(process.env.CONVERTER_CONCURRENCY ?? 2);
let active = 0;

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, time: new Date().toISOString(), service: "converter", msg, ...extra }));

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    // Own process group, so a timeout kills LibreOffice's child (soffice.bin) too. stdout is not
    // read, so it is discarded (an unread pipe can fill up and hang the conversion).
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], detached: true });
    let err = "";
    p.stderr.on("data", (d) => {
      if (err.length < 4000) err += d;
    });
    const t = setTimeout(() => {
      try {
        process.kill(-p.pid, "SIGKILL");
      } catch {
        p.kill("SIGKILL");
      }
      reject(new Error("conversion timed out"));
    }, timeoutMs);
    p.on("close", (code) => {
      clearTimeout(t);
      code === 0 ? resolve() : reject(new Error(`soffice exited ${code}: ${err.slice(0, 500)}`));
    });
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function convert(input, ext) {
  const dir = await mkdtemp(join(tmpdir(), "conv-"));
  try {
    const src = join(dir, `input.${ext}`);
    await writeFile(src, input);
    // A per-request profile directory lets conversions run concurrently and isolates state.
    await run(
      "soffice",
      [
        `-env:UserInstallation=file://${join(dir, "profile")}`,
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nodefault",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        dir,
        src,
      ],
      TIMEOUT_MS,
    );
    return await readFile(join(dir, "input.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ALLOWED = new Set(["docx", "png", "jpg", "jpeg"]);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://converter");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok", active }));
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/convert") return void res.writeHead(404).end();
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return void res.writeHead(401).end();
  const ext = (url.searchParams.get("from") ?? "docx").toLowerCase();
  if (!ALLOWED.has(ext)) return void res.writeHead(400).end("unsupported type");
  if (active >= MAX_CONCURRENT) return void res.writeHead(503, { "retry-after": "5" }).end("busy");
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) return void res.writeHead(413).end("too large");
    chunks.push(c);
  }
  active++;
  const started = Date.now();
  try {
    const pdf = await convert(Buffer.concat(chunks), ext);
    log("info", "converted", { ext, inBytes: size, outBytes: pdf.length, ms: Date.now() - started });
    res.writeHead(200, { "content-type": "application/pdf", "content-length": pdf.length }).end(pdf);
  } catch (e) {
    log("error", "conversion failed", { ext, error: String(e?.message ?? e) });
    res.writeHead(422, { "content-type": "text/plain" }).end("conversion failed");
  } finally {
    active--;
  }
}).listen(PORT, () => log("info", `listening on ${PORT}`));

for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    log("info", `received ${sig}, exiting`);
    process.exit(0);
  });
