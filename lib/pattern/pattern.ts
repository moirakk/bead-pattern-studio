import { colorDistance, rgbToLab } from "./color";
import type { BeadColor, BuildPatternOptions, DitherMode, Pattern, PatternRect, PatternSummaryItem, RGB } from "./types";

const DITHER_STRENGTH: Record<DitherMode, number> = {
  none: 0,
  soft: 0.55,
  strong: 1,
};

const MAX_PATTERN_SIDE = 500;

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

function selectAllowedPalette(sourcePixels: RGB[], palette: BeadColor[], colorLimit: number) {
  const initialCodes = sourcePixels.map((pixel) => nearestColor(pixel, palette).code);
  const counts = new Map<string, number>();
  const limit = Math.max(1, Math.min(colorLimit, palette.length));
  for (const code of initialCodes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const allowedCodes = new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([code]) => code),
  );

  if (allowedCodes.size < limit) {
    const sourceLabs = sourcePixels.map(rgbToLab);
    const fillColors = palette
      .filter((color) => !allowedCodes.has(color.code))
      .map((color) => ({
        code: color.code,
        score: sourceLabs.reduce(
          (best, lab) => Math.min(best, colorDistance(lab, color.lab)),
          Number.POSITIVE_INFINITY,
        ),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit - allowedCodes.size);

    for (const color of fillColors) {
      allowedCodes.add(color.code);
    }
  }

  const allowedPalette = palette.filter((color) => allowedCodes.has(color.code));
  return allowedPalette.length ? allowedPalette : palette;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value));
}

function quantizeWithDither(sourcePixels: RGB[], width: number, allowedPalette: BeadColor[], strength: number) {
  const workPixels = sourcePixels.map((pixel) => ({ ...pixel }));
  const cells = new Array<{ code: string; hex: string; source: RGB }>(sourcePixels.length);

  function addError(index: number, error: RGB, weight: number) {
    const pixel = workPixels[index];
    if (!pixel) return;
    pixel.r = clampChannel(pixel.r + error.r * weight * strength);
    pixel.g = clampChannel(pixel.g + error.g * weight * strength);
    pixel.b = clampChannel(pixel.b + error.b * weight * strength);
  }

  for (let index = 0; index < workPixels.length; index += 1) {
    const x = index % width;
    const pixel = workPixels[index];
    const color = nearestColor(pixel, allowedPalette);
    cells[index] = { code: color.code, hex: color.hex, source: sourcePixels[index] };

    const error = {
      r: pixel.r - color.rgb.r,
      g: pixel.g - color.rgb.g,
      b: pixel.b - color.rgb.b,
    };

    if (x + 1 < width) addError(index + 1, error, 7 / 16);
    if (index + width < workPixels.length) addError(index + width, error, 5 / 16);
    if (x > 0 && index + width - 1 < workPixels.length) addError(index + width - 1, error, 3 / 16);
    if (x + 1 < width && index + width + 1 < workPixels.length) addError(index + width + 1, error, 1 / 16);
  }

  return cells;
}

export function buildPattern(
  sourcePixels: RGB[],
  width: number,
  height: number,
  palette: BeadColor[],
  colorLimit: number,
  options: BuildPatternOptions = {},
): Pattern {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_PATTERN_SIDE || height > MAX_PATTERN_SIDE) {
    throw new Error(`Pattern dimensions must be integers between 1 and ${MAX_PATTERN_SIDE}.`);
  }
  if (sourcePixels.length !== width * height) {
    throw new Error(`Expected ${width * height} source pixels, received ${sourcePixels.length}.`);
  }
  if (!palette.length) {
    throw new Error("buildPattern requires at least one palette color.");
  }
  if (!Number.isInteger(colorLimit) || colorLimit < 1) {
    throw new Error("Color limit must be a positive integer.");
  }
  const paletteCodes = new Set(palette.map((color) => color.code));
  if (paletteCodes.size !== palette.length) {
    throw new Error("Palette color codes must be unique.");
  }
  if (options.ditherMode !== undefined && !(options.ditherMode in DITHER_STRENGTH)) {
    throw new Error("Unsupported dithering mode.");
  }

  const allowedPalette = selectAllowedPalette(sourcePixels, palette, colorLimit);
  const ditherMode = options.ditherMode ?? "none";
  const strength = DITHER_STRENGTH[ditherMode] ?? 0;

  return {
    width,
    height,
    cells:
      strength > 0
        ? quantizeWithDither(sourcePixels, width, allowedPalette, strength)
        : sourcePixels.map((pixel) => {
            const color = nearestColor(pixel, allowedPalette);
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

export function paintPatternArea(pattern: Pattern, rect: PatternRect, color: BeadColor): Pattern {
  const startX = Math.max(0, Math.min(pattern.width - 1, Math.floor(rect.x)));
  const startY = Math.max(0, Math.min(pattern.height - 1, Math.floor(rect.y)));
  const endX = Math.max(startX, Math.min(pattern.width - 1, Math.floor(rect.x + rect.width - 1)));
  const endY = Math.max(startY, Math.min(pattern.height - 1, Math.floor(rect.y + rect.height - 1)));
  let changed = false;

  const cells = pattern.cells.map((cell, index) => {
    const x = index % pattern.width;
    const y = Math.floor(index / pattern.width);
    if (x < startX || x > endX || y < startY || y > endY || cell.code === color.code) {
      return cell;
    }
    changed = true;
    return { ...cell, code: color.code, hex: color.hex };
  });

  return changed ? { ...pattern, cells } : pattern;
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
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }));
}
