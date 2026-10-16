import { createContext } from "react-router";
import type { SessionUser } from "~/modules/auth/session.server";

/** Signed-in user for this request (resolved once by the root middleware). */
export const userContext = createContext<SessionUser | null>(null);

/** Per-request CSP nonce shared by the root loader and entry.server. */
export const nonceContext = createContext<string>("");
