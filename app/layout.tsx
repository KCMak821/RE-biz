import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RE-Biz｜商務與帳務管理",
  description: "RE-Biz 商務與帳務管理系統：建立、列印及儲存收據。",
  icons: {
    icon: "/re-biz-mark.svg",
    shortcut: "/re-biz-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
