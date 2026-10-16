import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended minimum parameters (19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A fixed hash used to equalise timing when the account does not exist. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("timing-equaliser-not-a-real-password"));

/** Password policy: 10-128 chars, no trivial patterns. Deliberately simple (NIST SP 800-63B). */
export function passwordProblems(pw: string, email?: string): string[] {
  const p: string[] = [];
  if (pw.length < 10) p.push("Use at least 10 characters");
  if (pw.length > 128) p.push("Use at most 128 characters");
  if (/^(.)\1+$/.test(pw)) p.push("Do not repeat a single character");
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) p.push("Do not include your e-mail name");
  if (["password123", "1234567890", "qwertyuiop", "psgtech123", "password1234"].includes(pw.toLowerCase()))
    p.push("This password is too common");
  return p;
}
