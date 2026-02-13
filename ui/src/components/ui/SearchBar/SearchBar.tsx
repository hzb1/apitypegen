import { SearchOutlined } from "@ant-design/icons";
import "./SearchBar.css";
import { Input } from "antd";

const SearchBar = ({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) => {
  return (
    <>
      <div className={"search-bar-wrapper"}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={"search-input"}
          placeholder={placeholder ?? "输入路径或方法"}
          autoFocus={autoFocus}
          prefix={<SearchOutlined size={14} className={"search-icon"} />}
          allowClear
          size={'large'}
        />
        {/*<span className="search-shortcut">⌘ K</span>*/}
      </div>
    </>
  );
};

export default SearchBar;
