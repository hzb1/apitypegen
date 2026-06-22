import type { SavedApiExport, SaveApiExportResult, TsSwaggerExport } from "./export.types.ts";

const DB_NAME = "ts-swagger-local";
const DB_VERSION = 1;
const STORE_NAME = "apiExports";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `export_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持本地接口库"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("fingerprint", "fingerprint", { unique: true });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开本地接口库失败"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    return await callback(store);
  } finally {
    db.close();
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function fallbackHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash).toString(16)}`;
}

export async function createExportFingerprint(payload: TsSwaggerExport) {
  const source = stableStringify({
    docUrl: payload.source.docUrl,
    serviceUrl: payload.source.serviceUrl,
    openapi: payload.openapi,
  });

  if (typeof crypto === "undefined" || !crypto.subtle) {
    return fallbackHash(source);
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createRecord(payload: TsSwaggerExport, fingerprint: string): SavedApiExport {
  const now = new Date().toISOString();
  const name = payload.source.title || "API Export";
  return {
    id: createId(),
    name,
    fingerprint,
    savedAt: now,
    updatedAt: now,
    apiCount: payload.apis.length,
    sourceTitle: payload.source.title,
    sourceDocUrl: payload.source.docUrl,
    payload,
  };
}

async function findByFingerprint(fingerprint: string) {
  return withStore("readonly", async (store) => {
    const index = store.index("fingerprint");
    return requestToPromise<SavedApiExport | undefined>(index.get(fingerprint));
  });
}

export async function saveApiExport(payload: TsSwaggerExport): Promise<SaveApiExportResult> {
  const fingerprint = await createExportFingerprint(payload);
  const existing = await findByFingerprint(fingerprint);
  const nextRecord: SavedApiExport = existing
    ? {
      ...existing,
      updatedAt: new Date().toISOString(),
      apiCount: payload.apis.length,
      sourceTitle: payload.source.title,
      sourceDocUrl: payload.source.docUrl,
      payload,
    }
    : createRecord(payload, fingerprint);

  await withStore("readwrite", (store) => requestToPromise(store.put(nextRecord)));
  return {
    record: nextRecord,
    created: !existing,
  };
}

export async function listApiExports(): Promise<SavedApiExport[]> {
  const records = await withStore("readonly", (store) => requestToPromise<SavedApiExport[]>(store.getAll()));
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getApiExport(id: string): Promise<SavedApiExport | undefined> {
  return withStore("readonly", (store) => requestToPromise<SavedApiExport | undefined>(store.get(id)));
}

export async function deleteApiExport(id: string): Promise<void> {
  await withStore("readwrite", (store) => requestToPromise(store.delete(id)));
}
