/* ═══════════════════════════════════════════════════════════════
   AZ-TØNE WAVE MACHINE — libraryDB.js                  v0.1.0

   IndexedDB wrapper for persisting:
     - FileSystemDirectoryHandle objects (folder references)
     - Sample metadata per folder (name, size, type)

   Why IndexedDB and not localStorage?
     localStorage is synchronous, limited to ~5MB, and can't
     store complex objects like FileSystemDirectoryHandle.
     IndexedDB handles structured data and binary objects with
     no practical size limit on device storage.

   Stores:
     "folders"  — { id, name, handle, addedAt }
     (Audio buffers are NOT stored — they are re-decoded from
      device files on each session to avoid memory bloat)
═══════════════════════════════════════════════════════════════ */

const LibraryDB = (() => {

  const DB_NAME    = 'aztone-wave-machine';
  const DB_VERSION = 1;
  const STORE_FOLDERS = 'folders';

  let db = null;

  // ── Open / init DB ─────────────────────────────────────────────
  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_FOLDERS)) {
          const store = database.createObjectStore(STORE_FOLDERS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('name', 'name', { unique: false });
        }
      };

      req.onsuccess = e => {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = e => reject(e.target.error);
    });
  }

  // ── Generic helpers ─────────────────────────────────────────────
  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── Folders CRUD ────────────────────────────────────────────────

  /** Save a new folder handle. Returns the generated id. */
  async function saveFolder(name, handle) {
    await open();
    const id = await promisify(
      tx(STORE_FOLDERS, 'readwrite').add({
        name,
        handle,
        addedAt: Date.now(),
      })
    );
    return id;
  }

  /** Load all saved folder records. */
  async function getFolders() {
    await open();
    return promisify(tx(STORE_FOLDERS).getAll());
  }

  /** Delete a folder record by id. */
  async function deleteFolder(id) {
    await open();
    return promisify(tx(STORE_FOLDERS, 'readwrite').delete(id));
  }

  /** Clear everything (full reset). */
  async function clearAll() {
    await open();
    return promisify(tx(STORE_FOLDERS, 'readwrite').clear());
  }

  // ── Permission helper ───────────────────────────────────────────
  /**
   * Verify we still have read permission for a directory handle.
   * On mobile Chrome, permission may be revoked between sessions.
   * Returns true if permission is granted, false otherwise.
   */
  async function verifyPermission(handle) {
    try {
      const opts = { mode: 'read' };
      const state = await handle.queryPermission(opts);
      if (state === 'granted') return true;
      const requested = await handle.requestPermission(opts);
      return requested === 'granted';
    } catch {
      return false;
    }
  }

  return {
    open,
    saveFolder,
    getFolders,
    deleteFolder,
    clearAll,
    verifyPermission,
  };
})();
