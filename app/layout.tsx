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
  themeColor: "#FDFAF5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@200;300;500;700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      </head>
      <body>
        <PwaInstaller />
        {children}
      </body>
    </html>
  );
}
