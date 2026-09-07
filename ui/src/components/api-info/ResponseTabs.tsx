import type { GeneratedTypes } from "@/utils/SwaggerParser.ts";
import "./ResponseTabs.css";

/** 左右代码区域共用的 HTTP 响应状态选择器。 */
type ResponseTabsProps = {
  /** 状态码、描述和各状态的生成结果。 */
  responses: GeneratedTypes["responses"];
  /** 当前选中的状态码；all 表示全部响应。 */
  value: string;
  /** 选择状态码后通知工作台同步左右两栏。 */
  onChange: (status: string) => void;
  /** 区分响应区域和模型区域的无障碍名称。 */
  label: string;
};

export default function ResponseTabs({ responses, value, onChange, label }: ResponseTabsProps) {
  return (
    <div className="response-tabs" role="group" aria-label={label}>
      <button
        type="button"
        className="response-tabs__button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        全部响应
      </button>
      {responses.map((response) => (
        <button
          type="button"
          key={response.status}
          className="response-tabs__button"
          aria-pressed={value === response.status}
          title={response.description}
          onClick={() => onChange(response.status)}
        >
          {response.status}{response.description ? ` · ${response.description}` : ""}
        </button>
      ))}
    </div>
  );
}
