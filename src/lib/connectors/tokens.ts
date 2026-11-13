/**
 * Static connector tokens: `mm_` + 43 base64url chars (32 random bytes).
 * Only the sha256 hex digest is stored; the plain token is shown to the owner once.
 * Web Crypto only, so this runs in Node, edge runtimes and tests alike.
 */
export const TOKEN_PREFIX = "mm_";

function base64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateConnectorToken(): { token: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = `${TOKEN_PREFIX}${base64url(bytes)}`;
  return { token, prefix: token.slice(0, 10) };
}

export async function hashConnectorToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pull an `mm_` bearer token out of an Authorization header, or null. */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return null;
  const token = match[1]!;
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20 || token.length > 200) return null;
  return token;
}
