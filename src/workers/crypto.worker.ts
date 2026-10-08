/// <reference lib="webworker" />
import { expose } from "comlink";
import { encryptBytes, decryptBytes, NotEncryptedError, WrongPasswordError } from "@/tools/privacy/lib/encryption";

/** Off-main-thread hashing and file encryption so big files never freeze the UI. */
const api = {
  async hashFile(file: File, algorithm: "SHA-1" | "SHA-256" | "SHA-512", onProgress?: (done: number) => void): Promise<string> {
    // SubtleCrypto has no streaming digest; read in chunks to keep memory bounded, then hash once.
    const chunk = 8 * 1024 * 1024;
    const parts: Uint8Array[] = [];
    let done = 0;
    for (let offset = 0; offset < file.size; offset += chunk) {
      const buf = new Uint8Array(await file.slice(offset, offset + chunk).arrayBuffer());
      parts.push(buf);
      done += buf.length;
      onProgress?.(done);
    }
    const all = new Uint8Array(file.size);
    let pos = 0;
    for (const p of parts) {
      all.set(p, pos);
      pos += p.length;
    }
    const digest = await crypto.subtle.digest(algorithm, all);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  },

  async encrypt(file: File, password: string): Promise<Uint8Array> {
    return encryptBytes(await file.arrayBuffer(), password);
  },

  async decrypt(file: File, password: string): Promise<{ ok: true; data: Uint8Array } | { ok: false; reason: "wrong-password" | "not-encrypted" }> {
    try {
      const data = await decryptBytes(new Uint8Array(await file.arrayBuffer()), password);
      return { ok: true, data };
    } catch (e) {
      if (e instanceof WrongPasswordError) return { ok: false, reason: "wrong-password" };
      if (e instanceof NotEncryptedError) return { ok: false, reason: "not-encrypted" };
      throw e;
    }
  },
};

export type CryptoWorkerApi = typeof api;
expose(api);
