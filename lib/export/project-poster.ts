import { summarizePattern } from "@/lib/pattern";
import type { SavedProject } from "@/lib/projects/backup";

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;

export function calculatePosterPatternRect(patternWidth: number, patternHeight: number) {
  const maxWidth = 860;
  const maxHeight = 650;
  const scale = Math.min(maxWidth / patternWidth, maxHeight / patternHeight);
  const width = Math.max(1, Math.round(patternWidth * scale));
  const height = Math.max(1, Math.round(patternHeight * scale));
  return {
    x: Math.round((POSTER_WIDTH - width) / 2),
    y: 300 + Math.round((maxHeight - height) / 2),
    width,
    height,
  };
}

export function createProjectPosterBlob(project: SavedProject) {
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("当前设备无法生成分享海报。"));

  ctx.fillStyle = "#f6f8fb";
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.fillStyle = "#146b70";
  ctx.fillRect(0, 0, POSTER_WIDTH, 18);

  ctx.fillStyle = "#146b70";
  ctx.font = '700 24px Arial, "PingFang SC", sans-serif';
  ctx.fillText("BEAD PATTERN STUDIO", 64, 80);
  drawPill(ctx, project.category ?? "未分类", 64, 108);
  drawFittedTitle(ctx, project.title, 64, 220, 952);

  drawCard(ctx, 60, 270, 960, 730);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = project.pattern.width;
  sourceCanvas.height = project.pattern.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return Promise.reject(new Error("当前设备无法生成作品预览。"));
  project.pattern.cells.forEach((cell, index) => {
    sourceCtx.fillStyle = cell.hex;
    sourceCtx.fillRect(index % project.pattern.width, Math.floor(index / project.pattern.width), 1, 1);
  });
  const rect = calculatePosterPatternRect(project.pattern.width, project.pattern.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(17, 24, 39, 0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  const stats = [...summarizePattern(project.pattern, project.palette)].sort((a, b) => b.count - a.count);
  const metrics = [
    ["成品尺寸", `${project.pattern.width} x ${project.pattern.height}`],
    ["总豆数", `${project.pattern.cells.length.toLocaleString("zh-CN")} 颗`],
    ["使用色号", `${stats.length} 色`],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 64 + index * 332;
    ctx.fillStyle = "#667085";
    ctx.font = '500 20px Arial, "PingFang SC", sans-serif';
    ctx.fillText(label, x, 1060);
    ctx.fillStyle = "#111827";
    ctx.font = '700 34px Arial, "PingFang SC", sans-serif';
    ctx.fillText(value, x, 1105);
  });

  ctx.fillStyle = "#111827";
  ctx.font = '700 22px Arial, "PingFang SC", sans-serif';
  ctx.fillText("主要色号", 64, 1170);
  stats.slice(0, 8).forEach((item, index) => {
    const x = 64 + (index % 4) * 248;
    const y = 1208 + Math.floor(index / 4) * 48;
    ctx.fillStyle = item.color?.hex ?? "#111827";
    roundedRect(ctx, x, y - 24, 32, 32, 7);
    ctx.fill();
    ctx.fillStyle = "#344054";
    ctx.font = '700 19px Arial, "PingFang SC", sans-serif';
    ctx.fillText(`${item.code}  ${item.count}`, x + 44, y);
  });

  ctx.fillStyle = "#667085";
  ctx.font = '500 18px Arial, "PingFang SC", sans-serif';
  ctx.fillText("由拼豆图纸转换器生成  ·  bead-pattern-studio.vercel.app", 64, 1320);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("分享海报生成失败。")), "image/png");
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.shadowColor = "rgba(17, 24, 39, 0.08)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, x, y, width, height, 18);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#d9e1e7";
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, width, height, 18);
  ctx.stroke();
}

function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '700 20px Arial, "PingFang SC", sans-serif';
  const width = Math.min(180, ctx.measureText(text).width + 40);
  ctx.fillStyle = "#e9f6f4";
  roundedRect(ctx, x, y, width, 42, 21);
  ctx.fill();
  ctx.fillStyle = "#146b70";
  ctx.fillText(text, x + 20, y + 28);
}

function drawFittedTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  let size = 66;
  do {
    ctx.font = `700 ${size}px Arial, "PingFang SC", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= 38) break;
    size -= 2;
  } while (size > 38);
  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(`${fitted}...`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  ctx.fillStyle = "#111827";
  ctx.fillText(fitted === text ? text : `${fitted}...`, x, y);
}
