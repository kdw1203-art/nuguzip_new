import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Vite export(shadcn)과 동일 — `cn("px-2", "px-4")` → 뒤 wins */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
