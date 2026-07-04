import { Drawer } from "antd";
import SideBar, { type SideBarProps } from "@/components/sidebar/SideBar.tsx";
import type { ApiGroup } from "../utils.ts";
import type { ScrollRequest } from "../home.types.ts";
import type { AllServiceSearchGroup, SearchResultSelectContext } from "@/components/sidebar/ApiSearchDialog.tsx";

type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  scrollRequest?: ScrollRequest;
  apiGroups: ApiGroup[];
  onMenuSelect: (key: string) => void;
  handleGroupTitleClick: (groupItem: SideBarProps["apis"][number]) => void;
  handleToolbarSearchSelect: (key: string, context?: SearchResultSelectContext) => void;
  currentServiceLabel?: string;
  allServiceGroups?: AllServiceSearchGroup[];
  loadAllServiceGroups?: () => Promise<AllServiceSearchGroup[]>;
};

export default function MobileNavDrawer(props: MobileNavDrawerProps) {
  const {
    open,
    onClose,
    scrollRequest,
    apiGroups,
    onMenuSelect,
    handleGroupTitleClick,
    handleToolbarSearchSelect,
    currentServiceLabel,
    allServiceGroups,
    loadAllServiceGroups,
  } = props;

  return (
    <Drawer
      title="接口导航"
      placement="left"
      open={open}
      onClose={onClose}
      size={320}
      className="mobile-nav-drawer"
    >
      <SideBar
        scrollRequest={scrollRequest}
        apis={apiGroups}
        onSelectKeyChange={onMenuSelect}
        onGroupTitleClick={handleGroupTitleClick}
        onSearchSelectResult={handleToolbarSearchSelect}
        currentServiceLabel={currentServiceLabel}
        allServiceGroups={allServiceGroups}
        loadAllServiceGroups={loadAllServiceGroups}
      />
    </Drawer>
  );
}
