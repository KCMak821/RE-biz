import type { WorkspaceFeatureKey, WorkspaceFeatures } from "@/lib/workspace-features";
import {
  BookOpenText,
  Building2,
  FileSignature,
  FileText,
  KeyRound,
  LayoutDashboard,
  Package,
  Palette,
  ReceiptText,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for the sidebar, the mobile drawer and every
 * breadcrumb. Grouped by the job the user is doing — quoting, getting paid,
 * keeping records — rather than by database table.
 */
export type NavItem = {
  /** Only visible to owner/admin. */
  adminOnly?: boolean;
  description: string;
  external?: boolean;
  /** Hidden when a platform admin has switched this feature off. */
  feature?: WorkspaceFeatureKey;
  href: string;
  icon: LucideIcon;
  label: string;
};

export type NavGroup = { items: NavItem[]; label: string };

export const navigation: NavGroup[] = [
  {
    label: "總覽",
    items: [
      {
        description: "今天要處理的事、最近的紀錄與常用操作。",
        href: "/dashboard",
        icon: LayoutDashboard,
        label: "總覽",
      },
    ],
  },
  {
    label: "收款與帳務",
    items: [
      {
        description: "開立、輸出並追蹤每一張收據的收款狀態。",
        feature: "receipts",
        href: "/receipts",
        icon: ReceiptText,
        label: "收據",
      },
      {
        description: "查看現金流，補記沒有開收據的收入與所有支出。",
        feature: "accounting",
        href: "/ledger",
        icon: BookOpenText,
        label: "收支記帳",
      },
    ],
  },
  {
    label: "銷售文件",
    items: [
      {
        description: "成交前給客戶的報價；客戶接受後可轉為請款單或收據。",
        feature: "quotations",
        href: "/quotes",
        icon: FileSignature,
        label: "報價單",
      },
      {
        description: "向客戶請款的付款通知，可追蹤到期與付款狀態。",
        feature: "invoices",
        href: "/invoices",
        icon: FileText,
        label: "請款單",
      },
    ],
  },
  {
    label: "基本資料",
    items: [
      {
        description: "客戶聯絡與開票資料，報價單和請款單都會帶入。",
        feature: "quotations",
        href: "/customers",
        icon: Users,
        label: "客戶",
      },
      {
        description: "常用的商品與服務及預設單價，加快報價速度。",
        feature: "quotations",
        href: "/items",
        icon: Package,
        label: "商品與服務",
      },
    ],
  },
  {
    label: "設定",
    items: [
      {
        adminOnly: true,
        description: "公司抬頭、聯絡方式與收款銀行資料。",
        href: "/settings/company",
        icon: Building2,
        label: "公司資料",
      },
      {
        adminOnly: true,
        description: "收據的版型、主色、印章與顯示欄位。",
        href: "/settings/receipt-template",
        icon: Palette,
        label: "收據樣式",
      },
      {
        adminOnly: true,
        description: "新增同事帳號並設定他們可以做什麼。",
        href: "/settings/members",
        icon: UsersRound,
        label: "成員與權限",
      },
      {
        description: "變更你自己的登入密碼。",
        href: "/settings/account",
        icon: KeyRound,
        label: "我的帳號",
      },
    ],
  },
];

/** Flat lookup for titles and breadcrumbs. */
const navItems = navigation.flatMap((group) => group.items);

export function navItemFor(pathname: string) {
  return (
    navItems.find((item) => item.href === pathname) ??
    navItems
      .filter((item) => item.href !== "/" && pathname.startsWith(`${item.href}/`))
      .sort((left, right) => right.href.length - left.href.length)[0]
  );
}

export function visibleNavigation({
  canManageSettings,
  features,
}: {
  canManageSettings: boolean;
  features: WorkspaceFeatures;
}) {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.adminOnly || canManageSettings) &&
          // Hiding a switched-off feature is presentation only; the API keeps
          // rejecting it for anyone who types the URL directly.
          (!item.feature || features[item.feature]),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
