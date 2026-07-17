import { hexToRgb, rgbToLab } from "./color";
import type { BeadColor } from "./types";

const DEMO_PALETTE_RAW = [
  ["A01", "Snow White", "#f7f5ef"],
  ["A02", "Ivory", "#f2dfbf"],
  ["A03", "Cream", "#e8c78c"],
  ["A04", "Warm Sand", "#c89d62"],
  ["A05", "Caramel", "#9f6438"],
  ["A06", "Cocoa", "#5d3a2c"],
  ["A07", "Black", "#171717"],
  ["A08", "Ash Gray", "#7f8588"],
  ["A09", "Silver", "#b9c0c4"],
  ["A10", "Blush", "#f4b5aa"],
  ["A11", "Peach", "#f18e71"],
  ["A12", "Coral", "#e7584f"],
  ["A13", "Cherry", "#b82335"],
  ["A14", "Wine", "#6e1f34"],
  ["A15", "Apricot", "#f6b25c"],
  ["A16", "Orange", "#ed7624"],
  ["A17", "Sun Yellow", "#f4d34f"],
  ["A18", "Lemon", "#f2ec78"],
  ["A19", "Olive", "#888a3d"],
  ["A20", "Leaf", "#5da85b"],
  ["A21", "Mint", "#83cfa5"],
  ["A22", "Teal", "#2d9c98"],
  ["A23", "Deep Teal", "#156b70"],
  ["A24", "Sky", "#79bee9"],
  ["A25", "Azure", "#2f8dcc"],
  ["A26", "Cobalt", "#2454a6"],
  ["A27", "Navy", "#172d64"],
  ["A28", "Lavender", "#b3a0dc"],
  ["A29", "Violet", "#7656b6"],
  ["A30", "Plum", "#54306d"],
  ["A31", "Rose", "#df7aa6"],
  ["A32", "Hot Pink", "#cf3e7b"],
  ["A33", "Skin Light", "#f1c6a5"],
  ["A34", "Skin Mid", "#d99a76"],
  ["A35", "Skin Deep", "#9b5d45"],
  ["A36", "Transparent Blue", "#a9d9f4"],
] as const;

export function createBeadColor(code: string, name: string, hex: string): BeadColor {
  const normalizedHex = hex.startsWith("#") ? hex : `#${hex}`;
  const rgb = hexToRgb(normalizedHex);
  return {
    code: code.trim(),
    name: name.trim() || code.trim(),
    hex: normalizedHex.toLowerCase(),
    rgb,
    lab: rgbToLab(rgb),
  };
}

export function makeDemoPalette() {
  return DEMO_PALETTE_RAW.map(([code, name, hex]) => createBeadColor(code, name, hex));
}

export function parsePaletteCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed: BeadColor[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length < 2) continue;
    const [first, second, third] = parts;
    if (/^code$/i.test(first) || /^色号$/.test(first)) continue;
    const code = first;
    const maybeHex = third ?? second;
    const name = third ? second : first;
    if (!/^#?[0-9a-f]{6}$/i.test(maybeHex)) continue;
    parsed.push(createBeadColor(code, name, maybeHex));
  }
  return parsed;
}
