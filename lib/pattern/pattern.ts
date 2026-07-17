import { colorDistance, rgbToLab } from "./color";
import type { BeadColor, Pattern, PatternSummaryItem, RGB } from "./types";

export function nearestColor(rgb: RGB, palette: BeadColor[]) {
  if (!palette.length) {
    throw new Error("nearestColor requires at least one palette color.");
  }

  const lab = rgbToLab(rgb);
  let winner = palette[0];
  let best = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const score = colorDistance(lab, color.lab);
    if (score < best) {
      best = score;
      winner = color;
    }
  }
  return winner;
}

export function buildPattern(sourcePixels: RGB[], width: number, height: number, palette: BeadColor[], colorLimit: number): Pattern {
  if (sourcePixels.length !== width * height) {
    throw new Error(`Expected ${width * height} source pixels, received ${sourcePixels.length}.`);
  }
  if (!palette.length) {
    throw new Error("buildPattern requires at least one palette color.");
  }

  const initialCodes = sourcePixels.map((pixel) => nearestColor(pixel, palette).code);
  const counts = new Map<string, number>();
  for (const code of initialCodes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const allowedCodes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Math.min(colorLimit, palette.length)))
    .map(([code]) => code);
  const allowedPalette = palette.filter((color) => allowedCodes.includes(color.code));

  return {
    width,
    height,
    cells: sourcePixels.map((pixel) => {
      const color = nearestColor(pixel, allowedPalette.length ? allowedPalette : palette);
      return { code: color.code, hex: color.hex, source: pixel };
    }),
  };
}

export function paintPatternCell(pattern: Pattern, index: number, color: BeadColor): Pattern {
  if (index < 0 || index >= pattern.cells.length) {
    return pattern;
  }

  return {
    ...pattern,
    cells: pattern.cells.map((cell, cellIndex) =>
      cellIndex === index ? { ...cell, code: color.code, hex: color.hex } : cell,
    ),
  };
}

export function summarizePattern(pattern: Pattern | null, palette: BeadColor[]): PatternSummaryItem[] {
  if (!pattern) return [];
  const colorByCode = new Map(palette.map((color) => [color.code, color]));
  const counts = new Map<string, number>();
  for (const cell of pattern.cells) {
    counts.set(cell.code, (counts.get(cell.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({
      code,
      count,
      color: colorByCode.get(code),
      percent: count / pattern.cells.length,
    }))
    .sort((a, b) => b.count - a.count);
}
