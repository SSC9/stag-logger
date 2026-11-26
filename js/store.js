// Append-only event log in IndexedDB. Every user action is one record; state is
// derived by folding the log (logic.js). Nothing is ever overwritten.
const DB_NAME = 'stag', STORE = 'log';
let db = null;

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

export function loadAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves only after the write is durable (transaction complete).
export function append(type, data) {
  const rec = { t: new Date().toISOString(), type, data };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(rec);
    req.onsuccess = () => { rec.id = req.result; };
    tx.oncomplete = () => resolve(rec);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try { return await navigator.storage.persist(); } catch (_) { return false; }
  }
  return false;
}
export async function isPersisted() {
  if (navigator.storage && navigator.storage.persisted) {
    try { return await navigator.storage.persisted(); } catch (_) { return false; }
  }
  return null;
}

// Erase everything stored on this phone (used by Data & settings after a confirmation).
export function wipe() {
  return new Promise(resolve => {
    if (db) { db.close(); db = null; }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// Permanently delete every event matching pred. Only used by the user-confirmed "Delete permanently".
export function deleteWhere(pred) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), req = tx.objectStore(STORE).openCursor(); let n = 0;
    req.onsuccess = () => { const c = req.result; if (c) { if (pred(c.value)) { c.delete(); n++; } c.continue(); } };
    tx.oncomplete = () => resolve(n); tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
