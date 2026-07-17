import { hexToRgb, rgbToLab } from "./color";
import type { BeadColor } from "./types";

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
