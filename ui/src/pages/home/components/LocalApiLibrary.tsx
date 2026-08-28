import { type ChangeEvent, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Popconfirm, Spin } from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  EditOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { SavedApiExport } from "../export/export.types.ts";
import { SHOW_JSON_IO } from "../home.constants.ts";

type LocalApiLibraryProps = {
  savedExports: SavedApiExport[];
  loading: boolean;
  error?: string | null;
  importing?: boolean;
  onOpen: (id: string) => void;
  onDownload: (record: SavedApiExport) => void;
  onDelete: (id: string) => void;
  onRename: (record: SavedApiExport, name: string) => Promise<void> | void;
  onImportFile: (file: File) => Promise<void> | void;
};

function formatDate(value: string) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function LocalApiLibrary(props: LocalApiLibraryProps) {
  const {
    savedExports,
    loading,
    error,
    importing,
    onOpen,
    onDownload,
    onDelete,
    onRename,
    onImportFile,
  } = props;
  const [open, setOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedApiExport | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void Promise.resolve()
      .then(() => onImportFile(file))
      .then(() => setOpen(false))
      .catch(() => undefined);
  };

  const handleOpenRecord = (id: string) => {
    setOpen(false);
    onOpen(id);
  };

  const handleStartRename = (record: SavedApiExport) => {
    setRenameTarget(record);
    setRenameValue(record.name);
  };

  const handleConfirmRename = async () => {
    if (!renameTarget) return;
    setRenaming(true);
    try {
      await onRename(renameTarget, renameValue);
      setRenameTarget(null);
    } catch {
      // error message is handled by the caller
    } finally {
      setRenaming(false);
    }
  };

  return (
    <>
      <div className="local-library-launcher">
        <Button
          type="primary"
          size="large"
          icon={<FolderOpenOutlined />}
          loading={loading && !open}
          onClick={() => setOpen(true)}
        >
          本地接口库
          <span className="local-library-launcher-count">{savedExports.length}</span>
        </Button>
      </div>

      <Modal
        title="本地接口库"
        open={open}
        width={860}
        onCancel={() => setOpen(false)}
        footer={null}
      >
        {SHOW_JSON_IO ? (
          <div className="local-library-modal-toolbar">
            <div>
              <p>可以导入 APITypeGen 导出的 JSON，也可以导入普通 OpenAPI/Swagger JSON。</p>
            </div>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={importing}
              onClick={handleChooseFile}
            >
              导入 JSON
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="local-library-file-input"
              onChange={handleFileChange}
            />
          </div>
        ) : null}

        {loading ? (
          <div className="local-library-loading">
            <Spin />
            <span>正在读取本地接口库...</span>
          </div>
        ) : (
          <>
            {error ? (
              <Alert
                className="local-library-error"
                type="warning"
                showIcon
                message={error}
              />
            ) : null}
            {savedExports.length ? (
              <div className="local-library-list">
                {savedExports.map((item) => {
                  const sourceText = item.payload.source.importedFileName || item.sourceDocUrl;
                  return (
                    <article key={item.id} className="local-library-item">
                      <div className="local-library-item-main">
                        <h3 title={item.name}>{item.name}</h3>
                        <div className="local-library-meta">
                          <span>{item.apiCount} 个接口</span>
                          <span>更新于 {formatDate(item.updatedAt)}</span>
                        </div>
                        {sourceText ? (
                          <div className="local-library-source" title={sourceText}>
                            来源：{sourceText}
                          </div>
                        ) : null}
                      </div>
                      <div className="local-library-actions">
                        <Button
                          size="small"
                          type="primary"
                          icon={<FolderOpenOutlined />}
                          onClick={() => handleOpenRecord(item.id)}
                        >
                          打开
                        </Button>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleStartRename(item)}
                        >
                          重命名
                        </Button>
                        {SHOW_JSON_IO ? (
                          <Button
                            className="local-library-muted-action"
                            size="small"
                            type="text"
                            icon={<DownloadOutlined />}
                            onClick={() => onDownload(item)}
                          >
                            导出 JSON
                          </Button>
                        ) : null}
                        <Popconfirm
                          title="删除本地接口文档？"
                          description="删除后只能通过重新保存或导入文件恢复。"
                          okText="删除"
                          cancelText="取消"
                          onConfirm={() => onDelete(item.id)}
                        >
                          <Button
                            className="local-library-muted-action"
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty description="还没有保存到本地的接口文档" />
            )}
          </>
        )}
      </Modal>

      <Modal
        title="重命名本地接口文档"
        open={!!renameTarget}
        okText="保存"
        cancelText="取消"
        confirmLoading={renaming}
        onOk={() => void handleConfirmRename()}
        onCancel={() => setRenameTarget(null)}
      >
        <Input
          value={renameValue}
          autoFocus
          maxLength={80}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={() => void handleConfirmRename()}
        />
      </Modal>
    </>
  );
}
