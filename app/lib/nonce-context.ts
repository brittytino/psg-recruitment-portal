import { createContext, useContext } from "react";

/**
 * CSP nonce for server rendering. entry.server provides it for every document, including 404s for
 * unknown addresses, where no route (and so no root loader) runs.
 */
export const NonceContext = createContext<string>("");
export const useNonce = () => useContext(NonceContext);
