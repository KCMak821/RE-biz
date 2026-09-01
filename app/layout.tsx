import type { Metadata } from "next";

import { ToastHost } from "@/components/app/toast";

import "./globals.css";

export const metadata: Metadata = {
  title: "RE-Biz｜商務與帳務管理",
  description: "RE-Biz 商務與帳務管理：開立收據、記錄收支、建立報價單與請款單。",
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
      <body>
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
