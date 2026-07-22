import type { Metadata, Viewport } from "next";
import { Noto_Serif_SC, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { PwaInstaller } from "./pwa-installer";

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["200", "300", "500", "700"],
  display: "swap",
  variable: "--font-serif-sc",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif-display",
});

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
    <html lang="zh-CN" className={`${notoSerifSC.variable} ${dmSerifDisplay.variable}`}>
      <body>
        <PwaInstaller />
        {children}
      </body>
    </html>
  );
}
