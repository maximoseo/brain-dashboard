/** Accept only a local absolute path with one leading slash. */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return fallback;

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return fallback;
    const url = new URL(value, "https://brain.invalid");
    if (url.origin !== "https://brain.invalid" || !url.pathname.startsWith("/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
