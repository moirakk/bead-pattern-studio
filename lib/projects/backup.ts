import { hexToRgb, rgbToLab, type BeadColor, type DitherMode, type ImageAdjustments, type Pattern, type RGB } from "@/lib/pattern";

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

type ProjectBackupEnvelope = {
  format: "bead-pattern-studio";
  version: 1;
  exportedAt: string;
  projects: SavedProject[];
};

const BACKUP_FORMAT = "bead-pattern-studio";
const BACKUP_VERSION = 1;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_BACKUP_PROJECTS = 100;
const MAX_PATTERN_SIDE = 500;
const MAX_PATTERN_CELLS = MAX_PATTERN_SIDE * MAX_PATTERN_SIDE;
const MAX_PALETTE_COLORS = 1000;
const MAX_THUMBNAIL_LENGTH = 1_000_000;
export const MAX_PROJECT_BACKUP_BYTES = 96 * 1024 * 1024;
const PROJECT_CATEGORIES = new Set(["未分类", "人物", "动漫", "游戏", "动物", "花卉", "风景", "其他"]);

export function createProjectBackup(projects: SavedProject[], exportedAt = new Date().toISOString()) {
  const envelope: ProjectBackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    projects,
  };
  return JSON.stringify(envelope, null, 2);
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

  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION) {
    throw new Error("无法识别这个备份文件或版本。");
  }
  return parseSavedProjectCollection(parsed.projects);
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
