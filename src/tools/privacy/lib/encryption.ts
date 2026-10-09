/**
 * Lokal encrypted file container (".cbt"):
 *   magic "CBT1" (4) | salt (16) | iv (12) | iterations u32 BE (4) | ciphertext (AES-256-GCM, tag appended)
 * Key: PBKDF2-SHA-256 over the password, 310 000 iterations by default (OWASP 2023 guidance).
 */
export const MAGIC = new Uint8Array([0x43, 0x42, 0x54, 0x31]); // "CBT1"
export const DEFAULT_ITERATIONS = 310_000;
const HEADER_LEN = 4 + 16 + 12 + 4;

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(data: ArrayBuffer, password: string, iterations = DEFAULT_ITERATIONS): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data));
  const out = new Uint8Array(HEADER_LEN + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, 4);
  out.set(iv, 20);
  new DataView(out.buffer).setUint32(32, iterations);
  out.set(cipher, HEADER_LEN);
  return out;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong password or corrupted file.");
    this.name = "WrongPasswordError";
  }
}
export class NotEncryptedError extends Error {
  constructor() {
    super("This file was not encrypted with Lokal.");
    this.name = "NotEncryptedError";
  }
}

export function isEncryptedContainer(bytes: Uint8Array): boolean {
  return bytes.length >= HEADER_LEN && MAGIC.every((b, i) => bytes[i] === b);
}

export async function decryptBytes(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!isEncryptedContainer(bytes)) throw new NotEncryptedError();
  const salt = bytes.slice(4, 20);
  const iv = bytes.slice(20, 32);
  const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(32);
  if (iterations < 1000 || iterations > 10_000_000) throw new NotEncryptedError();
  const key = await deriveKey(password, salt, iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, bytes.subarray(HEADER_LEN) as BufferSource);
    return new Uint8Array(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
