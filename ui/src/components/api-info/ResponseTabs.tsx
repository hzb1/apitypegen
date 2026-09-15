import type { GeneratedTypes } from "@/utils/SwaggerParser.ts";
import "./ResponseTabs.css";

/** HTTP 响应状态选择器的输入。 */
type ResponseTabsProps = {
  /** 状态码、描述和各状态的生成结果。 */
  responses: GeneratedTypes["responses"];
  /** 当前选中的状态码；all 表示全部响应。 */
  value: string;
  /** 选择状态码后通知工作台切换响应代码。 */
  onChange: (status: string) => void;
  /** 响应状态按钮组的无障碍名称。 */
  label: string;
};

export default function ResponseTabs({ responses, value, onChange, label }: ResponseTabsProps) {
  const selectedDescription = value === "all"
    ? "合并展示全部响应类型"
    : responses.find((response) => response.status === value)?.description || `HTTP ${value}`;

  return (
    <div className="response-tabs">
      <div className="response-tabs__list" role="group" aria-label={label}>
        {responses.map((response) => (
          <button
            type="button"
            key={response.status}
            className="response-tabs__button"
            data-status={response.status}
            aria-label={response.description ? `${response.status}：${response.description}` : response.status}
            aria-pressed={value === response.status}
            title={response.description}
            onClick={() => onChange(response.status)}
          >
            {response.status}
          </button>
        ))}
        <button
          type="button"
          className="response-tabs__button"
          data-status="all"
          aria-pressed={value === "all"}
          onClick={() => onChange("all")}
        >
          全部响应
        </button>
      </div>
      <span className="response-tabs__description" title={selectedDescription}>{selectedDescription}</span>
    </div>
  );
}
