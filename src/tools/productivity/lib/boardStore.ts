/**
 * Whiteboard persistence in IndexedDB (localStorage's ~5 MB cap is too small once images are pasted).
 * One record holds the whole scene; nothing leaves the browser.
 */

const DB_NAME = "toolbox-whiteboard";
const STORE = "scenes";
const KEY = "current";

export interface SavedBoard {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadBoard(): Promise<SavedBoard | null> {
  try {
    return (await run<SavedBoard | undefined>("readonly", (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export function saveBoard(board: SavedBoard): Promise<unknown> {
  return run("readwrite", (s) => s.put(board, KEY));
}
