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

export function normalizeExportDocUrl(value?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const normalized = trimmed.startsWith("/")
      ? new URL(trimmed, window.location.origin)
      : new URL(/^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`);
    normalized.hash = "";
    return normalized.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

function isSyntheticImportDocUrl(value: string) {
  return value === "imported-openapi" || value === "imported-ts-swagger-export";
}

export function getExportSourceKey(payload: TsSwaggerExport) {
  const rawDocUrl = payload.source.docUrl.trim();
  const docUrl = normalizeExportDocUrl(payload.source.docUrl);
  if (docUrl && !isSyntheticImportDocUrl(rawDocUrl) && !isSyntheticImportDocUrl(docUrl)) {
    return `doc:${docUrl}`;
  }
  return `import:${stableStringify({
    docUrl,
    importedFileName: payload.source.importedFileName,
    openapi: payload.openapi,
  })}`;
}

export function isSameExportDocUrl(left?: string, right?: string) {
  const normalizedLeft = normalizeExportDocUrl(left);
  const normalizedRight = normalizeExportDocUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
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
  const source = getExportSourceKey(payload);

  if (typeof crypto === "undefined" || !crypto.subtle) {
    return fallbackHash(source);
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getApiCount(payload: TsSwaggerExport) {
  return payload.services?.reduce((total, service) => total + service.apis.length, 0)
    ?? payload.apis.length;
}

type SaveApiExportOptions = {
  name?: string;
};

function createRecord(payload: TsSwaggerExport, fingerprint: string): SavedApiExport {
  const now = new Date().toISOString();
  const name = payload.source.title || "API Export";
  return {
    id: createId(),
    name,
    fingerprint,
    savedAt: now,
    updatedAt: now,
    apiCount: getApiCount(payload),
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

async function findBySourceDocUrl(docUrl?: string) {
  if (!docUrl) return undefined;
  if (isSyntheticImportDocUrl(docUrl.trim())) return undefined;
  const records = await listApiExports();
  return records.find((record) =>
    isSameExportDocUrl(record.sourceDocUrl || record.payload.source.docUrl, docUrl),
  );
}

export async function saveApiExport(
  payload: TsSwaggerExport,
  options: SaveApiExportOptions = {},
): Promise<SaveApiExportResult> {
  const fingerprint = await createExportFingerprint(payload);
  const existing = await findByFingerprint(fingerprint)
    ?? await findBySourceDocUrl(payload.source.docUrl);
  const nextRecord: SavedApiExport = existing
    ? {
      ...existing,
      name: options.name?.trim() || existing.name,
      fingerprint,
      updatedAt: new Date().toISOString(),
      apiCount: getApiCount(payload),
      sourceTitle: payload.source.title,
      sourceDocUrl: payload.source.docUrl,
      payload,
    }
    : {
      ...createRecord(payload, fingerprint),
      name: options.name?.trim() || payload.source.title || "API Export",
    };

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

export async function renameApiExport(id: string, name: string): Promise<SavedApiExport> {
  const nextName = name.trim();
  if (!nextName) {
    throw new Error("名称不能为空");
  }
  const record = await getApiExport(id);
  if (!record) {
    throw new Error("未找到这份本地接口文档");
  }
  const nextRecord: SavedApiExport = {
    ...record,
    name: nextName,
    updatedAt: new Date().toISOString(),
  };
  await withStore("readwrite", (store) => requestToPromise(store.put(nextRecord)));
  return nextRecord;
}

export async function renameApiExportsByDocUrl(docUrl: string, name: string): Promise<SavedApiExport[]> {
  const nextName = name.trim();
  if (!nextName) return [];
  const records = await listApiExports();
  const matched = records.filter((record) =>
    isSameExportDocUrl(record.sourceDocUrl || record.payload.source.docUrl, docUrl),
  );
  if (!matched.length) return [];
  const updatedAt = new Date().toISOString();
  const nextRecords = matched.map((record): SavedApiExport => ({
    ...record,
    name: nextName,
    updatedAt,
  }));
  await withStore("readwrite", async (store) => {
    await Promise.all(nextRecords.map((record) => requestToPromise(store.put(record))));
  });
  return nextRecords;
}
