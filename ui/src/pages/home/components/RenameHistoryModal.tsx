import { Input, Modal } from "antd";

type RenameHistoryModalProps = {
  open: boolean;
  renameValue: string;
  setRenameValue: (value: string) => void;
  confirmRename: () => void;
  onCancel: () => void;
};

export default function RenameHistoryModal(props: RenameHistoryModalProps) {
  const { open, renameValue, setRenameValue, confirmRename, onCancel } = props;

  return (
    <Modal
      open={open}
      title="重命名记录"
      onOk={confirmRename}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
    >
      <Input
        value={renameValue}
        onChange={(event) => setRenameValue(event.target.value)}
        onPressEnter={confirmRename}
        placeholder="输入新的名称"
      />
    </Modal>
  );
}
