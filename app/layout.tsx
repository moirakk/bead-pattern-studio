import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaInstaller } from "./pwa-installer";

export const metadata: Metadata = {
  title: "拼豆图纸转换器",
  description: "把任意图片转换成可编辑、可导出的拼豆色号图纸。",
  applicationName: "拼豆图纸",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "拼豆图纸",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/app-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#146b70",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaInstaller />
        {children}
      </body>
    </html>
  );
}
