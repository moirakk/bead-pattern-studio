import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.moirahou1.beadpatternstudio",
  appName: "拼豆图纸",
  webDir: "mobile-dist",
  ios: {
    backgroundColor: "#f7f8fb",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
  plugins: {
    StatusBar: {
      style: "LIGHT",
    },
  },
};

export default config;
