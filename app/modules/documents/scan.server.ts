import { Socket } from "node:net";
import { env } from "~/modules/core/env.server";

export type ScanResult =
  { status: "CLEAN" } | { status: "INFECTED"; signature: string } | { status: "FAILED"; detail: string };

/**
 * Scans bytes with clamd using the INSTREAM protocol (zINSTREAM, 4-byte big-endian chunk sizes,
 * zero-length terminator). When scanning is disabled (development only) the result is FAILED with
 * an explicit detail, so unscanned files can never be treated as clean.
 */
export async function scanBytes(data: Uint8Array, timeoutMs = 60_000): Promise<ScanResult> {
  const e = env();
  if (e.MALWARE_SCAN === "disabled")
    return { status: "FAILED", detail: "Malware scanning is disabled in this environment" };
  return new Promise((resolve) => {
    const sock = new Socket();
    let reply = "";
    const done = (r: ScanResult) => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs, () => done({ status: "FAILED", detail: "clamd timed out" }));
    sock.on("error", (err) => done({ status: "FAILED", detail: `clamd unavailable: ${err.message}` }));
    sock.on("data", (d) => (reply += d.toString("utf8")));
    sock.on("end", () => {
      const r = reply.replace(/\0/g, "").trim();
      if (/: OK$/.test(r)) return done({ status: "CLEAN" });
      const m = /: (.+) FOUND$/.exec(r);
      if (m) return done({ status: "INFECTED", signature: m[1]! });
      done({ status: "FAILED", detail: `unexpected clamd reply: ${r.slice(0, 200)}` });
    });
    sock.connect(e.CLAMAV_PORT, e.CLAMAV_HOST, () => {
      sock.write("zINSTREAM\0");
      const CHUNK = 64 * 1024;
      for (let o = 0; o < data.length; o += CHUNK) {
        const part = data.subarray(o, Math.min(o + CHUNK, data.length));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        sock.write(len);
        sock.write(part);
      }
      sock.write(Buffer.alloc(4));
    });
  });
}

export async function clamdPing(): Promise<boolean> {
  const e = env();
  if (e.MALWARE_SCAN === "disabled") return true;
  return new Promise((resolve) => {
    const sock = new Socket();
    let reply = "";
    sock.setTimeout(3000, () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => resolve(false));
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => resolve(reply.includes("PONG")));
    sock.connect(e.CLAMAV_PORT, e.CLAMAV_HOST, () => sock.end("zPING\0"));
  });
}
