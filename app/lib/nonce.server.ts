import { randomBytes } from "node:crypto";

export const newNonce = () => randomBytes(16).toString("base64");
