import { createBeadColor, hexToRgb, rgbToLab, type BeadColor, type DitherMode, type ImageAdjustments, type Pattern, type RGB } from "@/lib/pattern";

export type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PaletteSourceKind = "builtin" | "imported" | "missing";

export type SavedProject = {
  id: string;
  title: string;
  sourceName: string;
  savedAt: string;
  category?: string;
  remixSource?: {
    communityPostId: string;
    title: string;
    author: string;
  };
  pattern: Pattern;
  palette: BeadColor[];
  settings: {
    gridWidth: number;
    gridHeight: number;
    colorLimit: number;
    ditherMode: DitherMode;
    imageAdjustments?: ImageAdjustments;
    crop: Crop;
    selectedCode: string;
    paletteName?: string;
    paletteSourceKind?: PaletteSourceKind;
  };
  thumbnail: string;
};

type CompactPattern = {
  width: number;
  height: number;
  colors: Array<{ code: string; hex: string }>;
  cellColors: string;
  sourceRgb: string;
};

type CompactSavedProject = Omit<SavedProject, "pattern" | "palette"> & {
  pattern: CompactPattern;
  palette: Array<Pick<BeadColor, "code" | "name" | "hex">>;
};

type ProjectBackupEnvelopeV2 = {
  format: "bead-pattern-studio";
  version: 2;
  exportedAt: string;
  projects: CompactSavedProject[];
};

const BACKUP_FORMAT = "bead-pattern-studio";
const BACKUP_VERSION = 2;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_BACKUP_PROJECTS = 100;
const MAX_PATTERN_SIDE = 500;
const MAX_PATTERN_CELLS = MAX_PATTERN_SIDE * MAX_PATTERN_SIDE;
const MAX_PALETTE_COLORS = 1000;
const MAX_THUMBNAIL_LENGTH = 1_000_000;
export const MAX_PROJECT_BACKUP_BYTES = 96 * 1024 * 1024;
const PROJECT_CATEGORIES = new Set(["未分类", "人物", "动漫", "游戏", "动物", "花卉", "风景", "其他"]);

export function createProjectBackup(projects: SavedProject[], exportedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("备份导出时间无效。");
  const validProjects = parseSavedProjectCollection(projects);
  const envelope: ProjectBackupEnvelopeV2 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    projects: validProjects.map(compactSavedProject),
  };
  return JSON.stringify(envelope);
}

export function parseProjectBackup(text: string): SavedProject[] {
  if (text.length > MAX_PROJECT_BACKUP_BYTES) {
    throw new Error("备份文件过大，不能超过 96 MB。");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }

  if (
    !isRecord(parsed) ||
    parsed.format !== BACKUP_FORMAT ||
    typeof parsed.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.exportedAt))
  ) {
    throw new Error("无法识别这个备份文件或版本。");
  }
  if (parsed.version === 1) return parseSavedProjectCollection(parsed.projects);
  if (parsed.version === BACKUP_VERSION) return parseCompactProjectCollection(parsed.projects);
  throw new Error("无法识别这个备份文件或版本。");
}

function compactSavedProject(project: SavedProject): CompactSavedProject {
  const colors: CompactPattern["colors"] = [];
  const colorIndexes = new Map<string, number>();
  const colorHexByCode = new Map<string, string>();
  const cellColorBytes = new Uint8Array(project.pattern.cells.length * 2);
  const sourceBytes = new Uint8Array(project.pattern.cells.length * 3);

  project.pattern.cells.forEach((cell, index) => {
    const normalizedHex = cell.hex.toLowerCase();
    const existingHex = colorHexByCode.get(cell.code);
    if (existingHex !== undefined && existingHex !== normalizedHex) {
      throw new Error(`色号 ${cell.code} 在同一图纸中对应了多个颜色。`);
    }
    colorHexByCode.set(cell.code, normalizedHex);
    let colorIndex = colorIndexes.get(cell.code);
    if (colorIndex === undefined) {
      colorIndex = colors.length;
      if (colorIndex >= MAX_PALETTE_COLORS) throw new Error("图纸使用的色号数量超过备份限制。");
      colorIndexes.set(cell.code, colorIndex);
      colors.push({ code: cell.code, hex: normalizedHex });
    }
    cellColorBytes[index * 2] = colorIndex & 0xff;
    cellColorBytes[index * 2 + 1] = colorIndex >> 8;
    sourceBytes[index * 3] = Math.round(cell.source.r);
    sourceBytes[index * 3 + 1] = Math.round(cell.source.g);
    sourceBytes[index * 3 + 2] = Math.round(cell.source.b);
  });

  return {
    ...project,
    pattern: {
      width: project.pattern.width,
      height: project.pattern.height,
      colors,
      cellColors: bytesToBase64(cellColorBytes),
      sourceRgb: bytesToBase64(sourceBytes),
    },
    palette: project.palette.map(({ code, name, hex }) => ({ code, name, hex: hex.toLowerCase() })),
  };
}

function parseCompactProjectCollection(value: unknown): SavedProject[] {
  if (!Array.isArray(value) || value.length > MAX_BACKUP_PROJECTS) {
    throw new Error("作品数量无效。");
  }
  const projects = value.map(parseCompactSavedProject);
  if (projects.some((project) => project === null)) {
    throw new Error("作品数据有损坏或不完整。");
  }
  const validProjects = projects as SavedProject[];
  if (new Set(validProjects.map((project) => project.id)).size !== validProjects.length) {
    throw new Error("备份中存在重复的作品 ID。");
  }
  return validProjects;
}

function parseCompactSavedProject(value: unknown): SavedProject | null {
  if (!isRecord(value) || !Array.isArray(value.palette) || !isRecord(value.pattern)) return null;
  if (value.palette.length > MAX_PALETTE_COLORS) return null;

  const palette: BeadColor[] = [];
  try {
    for (const color of value.palette) {
      if (
        !isRecord(color) ||
        !isShortString(color.code, 80) ||
        !isShortString(color.name, 200) ||
        typeof color.hex !== "string" ||
        !HEX_COLOR.test(color.hex)
      ) return null;
      palette.push(createBeadColor(color.code, color.name, color.hex));
    }
  } catch {
    return null;
  }

  const pattern = expandCompactPattern(value.pattern);
  if (!pattern) return null;
  const candidate: Record<string, unknown> = {
    id: value.id,
    title: value.title,
    sourceName: value.sourceName,
    savedAt: value.savedAt,
    pattern,
    palette,
    settings: value.settings,
    thumbnail: value.thumbnail,
  };
  if (value.category !== undefined) candidate.category = value.category;
  if (value.remixSource !== undefined) candidate.remixSource = value.remixSource;
  return parseSavedProject(candidate);
}

function expandCompactPattern(value: Record<string, unknown>): Pattern | null {
  if (!isIntegerInRange(value.width, 1, MAX_PATTERN_SIDE) || !isIntegerInRange(value.height, 1, MAX_PATTERN_SIDE)) return null;
  if (!Array.isArray(value.colors) || !value.colors.length || value.colors.length > MAX_PALETTE_COLORS) return null;
  if (typeof value.cellColors !== "string" || typeof value.sourceRgb !== "string") return null;

  const colors: CompactPattern["colors"] = [];
  const seenCodes = new Set<string>();
  for (const color of value.colors) {
    if (
      !isRecord(color) ||
      !isShortString(color.code, 80) ||
      typeof color.hex !== "string" ||
      !HEX_COLOR.test(color.hex) ||
      seenCodes.has(color.code)
    ) return null;
    seenCodes.add(color.code);
    colors.push({ code: color.code, hex: color.hex.toLowerCase() });
  }

  const cellCount = value.width * value.height;
  if (value.cellColors.length !== base64LengthForBytes(cellCount * 2) || value.sourceRgb.length !== base64LengthForBytes(cellCount * 3)) {
    return null;
  }
  const cellColorBytes = base64ToBytes(value.cellColors);
  const sourceBytes = base64ToBytes(value.sourceRgb);
  if (!cellColorBytes || !sourceBytes || cellColorBytes.length !== cellCount * 2 || sourceBytes.length !== cellCount * 3) return null;

  const cells = new Array<Pattern["cells"][number]>(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    const colorIndex = cellColorBytes[index * 2] | (cellColorBytes[index * 2 + 1] << 8);
    const color = colors[colorIndex];
    if (!color) return null;
    cells[index] = {
      code: color.code,
      hex: color.hex,
      source: {
        r: sourceBytes[index * 3],
        g: sourceBytes[index * 3 + 1],
        b: sourceBytes[index * 3 + 2],
      },
    };
  }
  return { width: value.width, height: value.height, cells };
}

export function parseSavedProjectCollection(value: unknown): SavedProject[] {
  if (!Array.isArray(value) || value.length > MAX_BACKUP_PROJECTS) {
    throw new Error("作品数量无效。");
  }

  const projects = value.map(parseSavedProject);
  if (projects.some((project) => project === null)) {
    throw new Error("作品数据有损坏或不完整。");
  }
  const validProjects = projects as SavedProject[];
  if (new Set(validProjects.map((project) => project.id)).size !== validProjects.length) {
    throw new Error("备份中存在重复的作品 ID。");
  }
  return validProjects;
}

export function recoverSavedProjectCollection(value: unknown): SavedProject[] {
  if (!Array.isArray(value)) return [];
  const recovered = value
    .slice(0, MAX_BACKUP_PROJECTS)
    .map(parseSavedProject)
    .filter((project): project is SavedProject => project !== null);
  return mergeSavedProjects([], recovered, MAX_BACKUP_PROJECTS);
}

export function mergeSavedProjects(current: SavedProject[], imported: SavedProject[], limit: number) {
  const byId = new Map<string, SavedProject>();
  [...current, ...imported].forEach((project) => {
    const existing = byId.get(project.id);
    if (!existing || Date.parse(project.savedAt) >= Date.parse(existing.savedAt)) {
      byId.set(project.id, project);
    }
  });

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, Math.max(0, limit));
}

function parseSavedProject(value: unknown): SavedProject | null {
  if (!isRecord(value)) return null;
  if (!isShortString(value.id, 200) || !isShortString(value.title, 200) || !isShortString(value.sourceName, 300)) return null;
  if (typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) return null;
  if (value.category !== undefined && (typeof value.category !== "string" || !PROJECT_CATEGORIES.has(value.category))) return null;
  if (value.remixSource !== undefined && !isRemixSource(value.remixSource)) return null;
  if (!isPattern(value.pattern) || !Array.isArray(value.palette) || value.palette.length > MAX_PALETTE_COLORS) return null;
  if (!value.palette.every(isBeadColor) || !isSettings(value.settings)) return null;
  if (typeof value.thumbnail !== "string" || value.thumbnail.length > MAX_THUMBNAIL_LENGTH) return null;

  const paletteCodes = new Set(value.palette.map((color) => color.code));
  if (paletteCodes.size !== value.palette.length) return null;
  if (value.settings.gridWidth !== value.pattern.width || value.settings.gridHeight !== value.pattern.height) return null;
  const hasPalette = value.settings.paletteSourceKind === "builtin" || value.settings.paletteSourceKind === "imported";
  if (hasPalette) {
    if (!value.palette.length || value.settings.colorLimit > value.palette.length || !paletteCodes.has(value.settings.selectedCode)) return null;
    const hexByCode = new Map(value.palette.map((color) => [color.code, color.hex.toLowerCase()]));
    if (!value.pattern.cells.every((cell) => hexByCode.get(cell.code) === cell.hex.toLowerCase())) return null;
  }

  return value as SavedProject;
}

function isRemixSource(value: unknown): value is NonNullable<SavedProject["remixSource"]> {
  return (
    isRecord(value) &&
    isShortString(value.communityPostId, 200) &&
    isShortString(value.title, 200) &&
    isShortString(value.author, 200)
  );
}

function isPattern(value: unknown): value is Pattern {
  if (!isRecord(value) || !isIntegerInRange(value.width, 1, MAX_PATTERN_SIDE) || !isIntegerInRange(value.height, 1, MAX_PATTERN_SIDE)) {
    return false;
  }
  if (!Array.isArray(value.cells) || value.cells.length > MAX_PATTERN_CELLS || value.cells.length !== value.width * value.height) {
    return false;
  }
  return value.cells.every((cell) =>
    isRecord(cell) &&
    isShortString(cell.code, 80) &&
    typeof cell.hex === "string" &&
    HEX_COLOR.test(cell.hex) &&
    isRgb(cell.source),
  );
}

function isBeadColor(value: unknown): value is BeadColor {
  const structurallyValid = (
    isRecord(value) &&
    isShortString(value.code, 80) &&
    isShortString(value.name, 200) &&
    typeof value.hex === "string" &&
    HEX_COLOR.test(value.hex) &&
    isRgb(value.rgb) &&
    isRecord(value.lab) &&
    isFiniteNumber(value.lab.l) &&
    isFiniteNumber(value.lab.a) &&
    isFiniteNumber(value.lab.b)
  );
  if (!structurallyValid) return false;
  const color = value as unknown as BeadColor;
  const expectedRgb = hexToRgb(color.hex);
  const expectedLab = rgbToLab(expectedRgb);
  return (
    color.rgb.r === expectedRgb.r && color.rgb.g === expectedRgb.g && color.rgb.b === expectedRgb.b &&
    Math.abs(color.lab.l - expectedLab.l) < 0.001 &&
    Math.abs(color.lab.a - expectedLab.a) < 0.001 &&
    Math.abs(color.lab.b - expectedLab.b) < 0.001
  );
}

function isSettings(value: unknown): value is SavedProject["settings"] {
  if (!isRecord(value)) return false;
  if (!isIntegerInRange(value.gridWidth, 1, MAX_PATTERN_SIDE) || !isIntegerInRange(value.gridHeight, 1, MAX_PATTERN_SIDE)) return false;
  if (!isIntegerInRange(value.colorLimit, 1, MAX_PALETTE_COLORS)) return false;
  if (value.ditherMode !== "none" && value.ditherMode !== "soft" && value.ditherMode !== "strong") return false;
  if (value.imageAdjustments !== undefined && !isImageAdjustments(value.imageAdjustments)) return false;
  if (!isCrop(value.crop) || !isShortString(value.selectedCode, 80)) return false;
  if (value.paletteName !== undefined && !isShortString(value.paletteName, 300)) return false;
  return value.paletteSourceKind === undefined || value.paletteSourceKind === "builtin" || value.paletteSourceKind === "imported" || value.paletteSourceKind === "missing";
}

function isImageAdjustments(value: unknown): value is ImageAdjustments {
  return (
    isRecord(value) &&
    isFiniteNumber(value.brightness) && value.brightness >= -40 && value.brightness <= 40 &&
    isFiniteNumber(value.contrast) && value.contrast >= -40 && value.contrast <= 40 &&
    isFiniteNumber(value.saturation) && value.saturation >= -60 && value.saturation <= 60 &&
    (value.backgroundRemoval === "none" || value.backgroundRemoval === "soft" || value.backgroundRemoval === "strong")
  );
}

function isCrop(value: unknown): value is Crop {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 100 &&
    value.y + value.height <= 100
  );
}

function isRgb(value: unknown): value is RGB {
  return (
    isRecord(value) &&
    isFiniteNumber(value.r) && value.r >= 0 && value.r <= 255 &&
    isFiniteNumber(value.g) && value.g >= 0 && value.g <= 255 &&
    isFiniteNumber(value.b) && value.b >= 0 && value.b <= 255
  );
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return globalThis.btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64LengthForBytes(byteLength: number) {
  return 4 * Math.ceil(byteLength / 3);
}

function base64ToBytes(value: string): Uint8Array | null {
  if (!/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/i.test(value)) return null;
  try {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}
