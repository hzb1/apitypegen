import { Alert, Button, Empty, Popconfirm, Spin } from "antd";
import { DeleteOutlined, DownloadOutlined, FolderOpenOutlined } from "@ant-design/icons";
import type { SavedApiExport } from "../export/export.types.ts";

type LocalApiLibraryProps = {
  savedExports: SavedApiExport[];
  loading: boolean;
  error?: string | null;
  onOpen: (id: string) => void;
  onDownload: (record: SavedApiExport) => void;
  onDelete: (id: string) => void;
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
  const { savedExports, loading, error, onOpen, onDownload, onDelete } = props;

  return (
    <section className="local-library">
      <div className="local-library-header">
        <div>
          <h2>本地保存的接口文档</h2>
          <p>数据仅保存在当前浏览器当前站点中，清理站点数据后会丢失。</p>
        </div>
        <span>{savedExports.length} 份</span>
      </div>

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
              {savedExports.map((item) => (
                <article key={item.id} className="local-library-item">
                  <div className="local-library-item-main">
                    <h3 title={item.name}>{item.name}</h3>
                    <div className="local-library-meta">
                      <span>{item.apiCount} 个接口</span>
                      <span>更新于 {formatDate(item.updatedAt)}</span>
                    </div>
                    {item.sourceDocUrl ? (
                      <div className="local-library-source" title={item.sourceDocUrl}>
                        来源：{item.sourceDocUrl}
                      </div>
                    ) : null}
                  </div>
                  <div className="local-library-actions">
                    <Button
                      size="small"
                      type="primary"
                      icon={<FolderOpenOutlined />}
                      onClick={() => onOpen(item.id)}
                    >
                      打开
                    </Button>
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => onDownload(item)}
                    >
                      导出 JSON
                    </Button>
                    <Popconfirm
                      title="删除本地接口文档？"
                      description="删除后只能通过重新保存或导入文件恢复。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => onDelete(item.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty description="还没有保存到本地的接口文档" />
          )}
        </>
      )}
    </section>
  );
}
