/** UTF-8 safe Base64 helpers (btoa alone breaks on non-Latin1 text). */
export function base64Encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes, urlSafe);
}

export function base64Decode(b64: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(b64));
}

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const out = btoa(bin);
  return urlSafe ? out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface JwtDecoded {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  exp?: number;
  iat?: number;
  nbf?: number;
}

export function decodeJwt(token: string): JwtDecoded {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("A JWT has three dot-separated parts.");
  const parse = (s: string, what: string) => {
    try {
      return JSON.parse(base64Decode(s)) as Record<string, unknown>;
    } catch {
      throw new Error(`The ${what} is not valid Base64URL JSON.`);
    }
  };
  const header = parse(parts[0], "header");
  const payload = parse(parts[1], "payload");
  const num = (k: string) => (typeof payload[k] === "number" ? (payload[k] as number) : undefined);
  return { header, payload, signature: parts[2], exp: num("exp"), iat: num("iat"), nbf: num("nbf") };
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
