/* Minimal IndexedDB stub for direct-node tests of the vault-upgrade local
   work queue. Implements exactly the API surface lib/vault-upgrade/
   indexedDb.ts uses: open → onupgradeneeded/onsuccess, transaction →
   objectStore → getAll/get/put/delete requests, objectStoreNames, close.

   Databases persist in a backing map per factory instance, so closing and
   reopening the same factory proves refresh/restart resume with the exact
   production wrapper code. Values are structuredClone'd on write and read,
   mimicking real IndexedDB isolation. */

function makeRequest(execute) {
  const request = { onsuccess: null, onerror: null, result: undefined, error: null };
  queueMicrotask(() => {
    try {
      request.result = execute();
      if (request.onsuccess) request.onsuccess();
    } catch (err) {
      request.error = err;
      if (request.onerror) request.onerror();
    }
  });
  return request;
}

class StubObjectStore {
  constructor(records) {
    this.records = records;
  }
  getAll() {
    return makeRequest(() => [...this.records.values()].map((v) => structuredClone(v)));
  }
  get(key) {
    return makeRequest(() => {
      const value = this.records.get(key);
      return value === undefined ? undefined : structuredClone(value);
    });
  }
  put(value) {
    return makeRequest(() => {
      const key = value.sourceSha256;
      this.records.set(key, structuredClone(value));
      return key;
    });
  }
  delete(key) {
    return makeRequest(() => {
      this.records.delete(key);
      return undefined;
    });
  }
}

class StubDatabase {
  constructor(backing) {
    this.backing = backing;
    this.closed = false;
  }
  get objectStoreNames() {
    const stores = this.backing.stores;
    return { contains: (name) => stores.has(name) };
  }
  createObjectStore(name) {
    if (!this.backing.stores.has(name)) {
      this.backing.stores.set(name, new Map());
    }
    return new StubObjectStore(this.backing.stores.get(name));
  }
  transaction(storeName) {
    if (this.closed) throw new Error("Database connection is closed.");
    const records = this.backing.stores.get(storeName);
    if (!records) throw new Error(`No object store named ${storeName}.`);
    return { objectStore: () => new StubObjectStore(records) };
  }
  close() {
    this.closed = true;
  }
}

export function createStubIndexedDb() {
  const databases = new Map(); // name -> { stores: Map<string, Map<key, value>> }
  return {
    open(name /* , version */) {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
      queueMicrotask(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, { stores: new Map() });
        const db = new StubDatabase(databases.get(name));
        request.result = db;
        if (isNew && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
  };
}
