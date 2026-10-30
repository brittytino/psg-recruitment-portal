import { clsx, type ClassValue } from "clsx";

/** Joins class names (shadcn's `cn`). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
