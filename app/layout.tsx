import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "簡易收據系統｜香港普通收據",
  description: "建立香港普通收據，並直接列印或儲存為 PDF。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
