import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeRoute(path: string | undefined | null, fallback = "/") {
  if (!path) {
    return fallback;
  }
  try {
    const url = new URL(path, "http://localhost");
    return url.pathname.startsWith("/") ? url.pathname : fallback;
  } catch {
    return fallback;
  }
}
