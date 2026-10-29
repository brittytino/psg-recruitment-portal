// Diagnoses e-mail delivery from inside the app container: `./prod.sh mailtest [send-to@address]`.
// Tests the network path to the SMTP server on ports 587 and 465, then logs in with the
// configured account, and optionally sends a test e-mail. Prints the cause and the fix.
import { createRequire } from "node:module";
import net from "node:net";
import dns from "node:dns/promises";

const require = createRequire(`${process.cwd()}/`);
const nodemailer = require("nodemailer");

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASSWORD || "";
const to = process.argv[2];
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);

console.log(`\nE-mail check: ${host}, account ${user || "(none)"}\n`);
const devMail = process.env.EMAIL_PROVIDER === "mailpit";
if (devMail) ok("Development mode: e-mails go to Mailpit, not Gmail.");

try {
  const addrs = await dns.lookup(host, { all: true });
  ok(
    `DNS: ${host} -> ${addrs
      .map((a) => a.address)
      .slice(0, 2)
      .join(", ")}`,
  );
} catch (e) {
  bad(`DNS lookup of ${host} failed (${e.code}). The server cannot resolve names: check its DNS settings.`);
  process.exit(1);
}

const tcp = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 8000 });
    s.once("connect", () => (s.destroy(), resolve("open")));
    s.once("timeout", () => (s.destroy(), resolve("timeout")));
    s.once("error", (e) => resolve(e.code || "error"));
  });
const open = [];
for (const port of devMail ? [Number(process.env.SMTP_PORT || 1025)] : [587, 465]) {
  const r = await tcp(port);
  if (r === "open") {
    ok(`Port ${port} to ${host} is reachable`);
    open.push(port);
  }
  else bad(`Port ${port} to ${host} is NOT reachable (${r})`);
}
if (!open.length) {
  console.log(`
CAUSE: the college firewall blocks outgoing mail ports from this server.
FIX:   ask the network team to allow outbound TCP 587 (and 465) from this server to ${host}.
`);
  process.exit(1);
}
if (devMail) {
  console.log("\nMailpit is reachable. Development e-mail works.\n");
  process.exit(0);
}
if (!user || !pass) {
  bad("SMTP_USER or SMTP_PASSWORD is empty.");
  console.log("\nFIX: run  sudo ./prod.sh smtp-password  and paste the Gmail app password.\n");
  process.exit(1);
}

let working = null;
for (const port of open) {
  const t = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await t.verify();
    ok(`Signed in to ${host}:${port} as ${user}`);
    working = t;
    break;
  } catch (e) {
    if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) {
      bad(`Gmail rejected the login for ${user} (${e.responseCode ?? e.code}).`);
      console.log(`
CAUSE: wrong or revoked app password, or 2-Step Verification is off for ${user}.
FIX:   1. Sign in to ${user} at https://myaccount.google.com/security, turn on 2-Step Verification.
       2. Create an app password at https://myaccount.google.com/apppasswords (16 letters).
       3. On the server run:  sudo ./prod.sh smtp-password   and paste it.
       If the Workspace admin has disabled app passwords / SMTP, ask them to allow it for this account.
`);
      process.exit(1);
    }
    bad(`Port ${port}: ${e.code ?? ""} ${e.message}`);
  }
}
if (!working) process.exit(1);
if (to) {
  await working.sendMail({
    from: process.env.MAIL_FROM || `PSG Tech Recruitment <${process.env.SMTP_FROM_EMAIL || user}>`,
    to,
    subject: "PSG Tech recruitment portal: test e-mail",
    text: "This is a test e-mail from the recruitment portal server. E-mail delivery works.",
  });
  ok(`Test e-mail sent to ${to}. Check the inbox (and spam).`);
}
console.log("\nE-mail delivery is working.\n");
