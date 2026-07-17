import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { Style, StatusBar } from "@capacitor/status-bar";
import { BeadPatternApp } from "../app/BeadPatternApp";
import "../app/globals.css";
import "./mobile.css";

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.platform = Capacitor.getPlatform();
  void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
}

const root = document.getElementById("root");

if (!root) throw new Error("Missing mobile app root");

createRoot(root).render(
  <React.StrictMode>
    <BeadPatternApp />
  </React.StrictMode>,
);
