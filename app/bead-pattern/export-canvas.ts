/**
 * Pure canvas drawing utilities for bead pattern export (PNG/PDF).
 * No React dependencies — independently testable.
 */

import { colorDistance, hexToRgb, rgbToLab, type BeadColor, type Pattern } from "@/lib/pattern";
import type { PdfImagePage } from "@/lib/export/pdf";

// ─── Constants ─────────────────────────────────────────────

export const A4_CANVAS = {
  width: 1240,
  height: 1754,
  margin: 72,
};

export const BUILTIN_MARD_221_NAME = "MARD 221 标准色卡";
export const BUILTIN_MARD_221_NOTE = "色卡：MARD 221 标准色卡（国内零售常见版本；HEX 为屏幕近似值，实物以豆子批次为准）";
export const BUILTIN_MARD_291_NAME = "MARD 291 全色色卡";
export const BUILTIN_MARD_291_NOTE = "色卡：MARD 291 全色色卡（含 P / Q / R / T / Y / ZG 扩展系列；HEX 为屏幕近似值，实物以豆子批次为准）";
export const MISSING_PALETTE_WARNING = "请选择内置色卡或导入店铺/品牌真实 CSV。";

export const MAX_SAVED_PROJECTS = 100;
export const MAX_IMAGE_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 80_000_000;
export const MAX_SOURCE_DIM = 2000;
export const MAX_PALETTE_FILE_BYTES = 2_000_000;

// ─── Utility functions ─────────────────────────────────────

export function stripFileExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, "");
}

export function makeSafeFilename(value: string) {
  const trimmed = value.trim() || "bead-pattern";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

export function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

// ─── Canvas drawing primitives ─────────────────────────────

export function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  radius: number,
  fillStyle: string | CanvasGradient,
) {
  ctx.fillStyle = fillStyle;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
}

export function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  radius: number,
  strokeStyle: string,
) {
  ctx.strokeStyle = strokeStyle;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
}

export function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 18) {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  fillRoundedRect(ctx, x, y, width, height, radius, "#ffffff");
  ctx.restore();
  strokeRoundedRect(ctx, x, y, width, height, radius, "#dbe5ea");
}

export function textColorForHex(hex: string) {
  return colorDistance(rgbToLab(hexToRgb(hex)), rgbToLab({ r: 255, g: 255, b: 255 })) < 45 ? "#111827" : "#ffffff";
}

export function drawFittedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(`${fitted}...`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  ctx.fillText(`${fitted}...`, x, y);
}

export function drawCenteredCellCode(
  ctx: CanvasRenderingContext2D,
  code: string,
  x: number, y: number,
  width: number, height: number,
  color: string,
  maxFontSize: number,
  minFontSize = 5,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = maxFontSize;
  do {
    ctx.font = `700 ${fontSize}px Arial, sans-serif`;
    if (ctx.measureText(code).width <= width - 3 || fontSize <= minFontSize) break;
    fontSize -= 1;
  } while (fontSize >= minFontSize);
  const measuredWidth = Math.max(1, ctx.measureText(code).width);
  const scaleX = Math.min(1, Math.max(0.58, (width - 3) / measuredWidth));
  ctx.translate(x + width / 2, y + height / 2 + 0.5);
  ctx.scale(scaleX, 1);
  ctx.fillText(code, 0, 0);
  ctx.restore();
}

// ─── A4 page helpers ───────────────────────────────────────

export function makeA4Canvas() {
  const canvas = document.createElement("canvas");
  canvas.width = A4_CANVAS.width;
  canvas.height = A4_CANVAS.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f7fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

export function canvasToPage(canvas: HTMLCanvasElement): PdfImagePage {
  const page: PdfImagePage = {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
  };
  canvas.width = 0;
  canvas.height = 0;
  return page;
}
