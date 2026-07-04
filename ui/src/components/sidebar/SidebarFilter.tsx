import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";

type SidebarFilterProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SidebarFilter(props: SidebarFilterProps) {
  return (
    <Input
      className="sidebar-filter-input"
      value={props.value}
      allowClear
      prefix={<SearchOutlined />}
      placeholder="过滤当前服务接口"
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}
