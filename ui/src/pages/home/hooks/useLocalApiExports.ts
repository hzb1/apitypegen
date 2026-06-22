import { useCallback, useEffect, useState } from "react";
import type { SavedApiExport } from "../export/export.types.ts";
import {
  deleteApiExport,
  getApiExport,
  listApiExports,
} from "../export/localApiExportStore.ts";

export function useLocalApiExports(localId?: string | null) {
  const [savedExports, setSavedExports] = useState<SavedApiExport[]>([]);
  const [activeLocalExport, setActiveLocalExport] = useState<SavedApiExport | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [activeLoading, setActiveLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);

  const refreshSavedExports = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const records = await listApiExports();
      setSavedExports(records);
      setLibraryError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLibraryError(`读取本地接口库失败：${message}`);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const removeSavedExport = useCallback(async (id: string) => {
    await deleteApiExport(id);
    if (activeLocalExport?.id === id) {
      setActiveLocalExport(null);
    }
    await refreshSavedExports();
  }, [activeLocalExport?.id, refreshSavedExports]);

  useEffect(() => {
    void refreshSavedExports();
  }, [refreshSavedExports]);

  useEffect(() => {
    if (!localId) {
      setActiveLocalExport(null);
      return;
    }

    let cancelled = false;
    setActiveLoading(true);
    setActiveError(null);

    const loadActiveExport = async () => {
      try {
        const record = await getApiExport(localId);
        if (cancelled) return;
        if (!record) {
          setActiveLocalExport(null);
          setActiveError("未找到这份本地保存的接口文档，可能已经被删除。");
          return;
        }
        setActiveLocalExport(record);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setActiveError(`打开本地接口文档失败：${message}`);
      } finally {
        if (!cancelled) {
          setActiveLoading(false);
        }
      }
    };

    void loadActiveExport();

    return () => {
      cancelled = true;
    };
  }, [localId]);

  return {
    savedExports,
    activeLocalExport,
    libraryLoading,
    activeLoading,
    libraryError,
    activeError,
    refreshSavedExports,
    removeSavedExport,
  };
}
