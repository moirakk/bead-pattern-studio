"use client";

import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { CommunityDiscover } from "@/app/CommunityDiscover";
import type { CommunityPost } from "@/lib/community/feed";
import { createRemixedProject } from "@/lib/community/remix";
import { makePdfFromJpegPages } from "@/lib/export/pdf";
import { createProjectPosterBlob } from "@/lib/export/project-poster";
import { deliverExportFile, selectionHaptic } from "@/lib/native/share";
import {
  createProjectBackup,
  MAX_PROJECT_BACKUP_BYTES,
  mergeSavedProjects,
  parseProjectBackup,
  type Crop,
  type PaletteSourceKind,
  type SavedProject,
} from "@/lib/projects/backup";
import { loadSavedProjects, saveSavedProjects } from "@/lib/projects/storage";
import {
  duplicateSavedProject,
  createSavedProjectId,
  filterAndSortProjects,
  PROJECT_CATEGORIES,
  renameSavedProject,
  setSavedProjectCategory,
  type ProjectCategory,
  type ProjectCategoryFilter,
  type ProjectSort,
} from "@/lib/projects/library";
import {
  canRedoPattern,
  canUndoPattern,
  colorDistance,
  commitPattern,
  createPatternHistory,
  DEFAULT_IMAGE_ADJUSTMENTS,
  generatePatternAsync,
  hexToRgb,
  makeMard221Palette,
  makeMard291Palette,
  paintPatternCell,
  paintPatternArea,
  packCanvasPixels,
  parsePaletteCsv,
  redoPattern,
  rgbToLab,
  resetPatternHistory,
  summarizePattern,
  undoPattern,
  type BeadColor,
  type DitherMode,
  type ImageAdjustments,
  type Pattern,
  type PatternHistory,
} from "@/lib/pattern";

type EditMode = "paint" | "select";

type MobilePanel = "setup" | "pattern" | "palette" | "discover" | "works";

type SelectionDraft = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

const BUILTIN_MARD_221_NAME = "MARD 221 标准色卡";
const BUILTIN_MARD_221_NOTE = "色卡：MARD 221 标准色卡（国内零售常见版本；HEX 为屏幕近似值，实物以豆子批次为准）";
const BUILTIN_MARD_291_NAME = "MARD 291 全色色卡";
const BUILTIN_MARD_291_NOTE = "色卡：MARD 291 全色色卡（含 P / Q / R / T / Y / ZG 扩展系列；HEX 为屏幕近似值，实物以豆子批次为准）";
const MISSING_PALETTE_WARNING = "请选择内置色卡或导入店铺/品牌真实 CSV。";

const A4_CANVAS = {
  width: 1240,
  height: 1754,
  margin: 72,
};

const MAX_SAVED_PROJECTS = 100;
const MAX_IMAGE_FILE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const MAX_PALETTE_FILE_BYTES = 2_000_000;

function stripFileExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, "");
}

function makeSafeFilename(value: string) {
  const trimmed = value.trim() || "bead-pattern";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient,
) {
  ctx.fillStyle = fillStyle;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string,
) {
  ctx.strokeStyle = strokeStyle;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 18) {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  fillRoundedRect(ctx, x, y, width, height, radius, "#ffffff");
  ctx.restore();
  strokeRoundedRect(ctx, x, y, width, height, radius, "#dbe5ea");
}

function textColorForHex(hex: string) {
  return colorDistance(rgbToLab(hexToRgb(hex)), rgbToLab({ r: 255, g: 255, b: 255 })) < 45 ? "#111827" : "#ffffff";
}

function drawFittedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
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

function drawCenteredCellCode(
  ctx: CanvasRenderingContext2D,
  code: string,
  x: number,
  y: number,
  width: number,
  height: number,
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

export function BeadPatternApp() {
  const [palette, setPalette] = useState<BeadColor[]>(makeMard291Palette);
  const [paletteName, setPaletteName] = useState(BUILTIN_MARD_291_NAME);
  const [paletteSourceKind, setPaletteSourceKind] = useState<PaletteSourceKind>("builtin");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState("未上传图片");
  const [projectTitle, setProjectTitle] = useState("未命名拼豆图纸");
  const [gridWidth, setGridWidth] = useState(48);
  const [gridHeight, setGridHeight] = useState(48);
  const [keepRatio, setKeepRatio] = useState(true);
  const [colorLimit, setColorLimit] = useState(48);
  const [ditherMode, setDitherMode] = useState<DitherMode>("none");
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 100, height: 100 });
  const [imageAdjustments, setImageAdjustments] = useState<ImageAdjustments>(DEFAULT_IMAGE_ADJUSTMENTS);
  const [patternHistory, setPatternHistory] = useState<PatternHistory>(() => createPatternHistory(null));
  const [selectedCode, setSelectedCode] = useState("H7");
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("paint");
  const [selection, setSelection] = useState<SelectionDraft | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectsReady, setProjectsReady] = useState(false);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectSort, setProjectSort] = useState<ProjectSort>("latest");
  const [projectCategoryFilter, setProjectCategoryFilter] = useState<ProjectCategoryFilter>("全部分类");
  const [sharingProjectId, setSharingProjectId] = useState<string | null>(null);
  const [communityPreviewProjectId, setCommunityPreviewProjectId] = useState<string | null>(null);
  const [portfolioNotice, setPortfolioNotice] = useState("正在读取当前设备的作品库...");
  const [activeMobilePanel, setActiveMobilePanel] = useState<MobilePanel>("setup");
  const [status, setStatus] = useState("上传图片后会自动生成图纸。");
  const sourcePreviewRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedColor = useMemo(
    () => palette.find((color) => color.code === selectedCode) ?? palette[0],
    [palette, selectedCode],
  );
  const pattern = patternHistory.present;
  const stats = useMemo(() => summarizePattern(pattern, palette), [pattern, palette]);
  const exportTitle = projectTitle.trim() || stripFileExtension(imageName) || "未命名拼豆图纸";
  const exportFilename = makeSafeFilename(exportTitle);
  const hasUsablePalette = palette.length > 0 && paletteSourceKind !== "missing";
  const paletteSourceText =
    paletteSourceKind === "builtin"
      ? paletteName === BUILTIN_MARD_221_NAME ? BUILTIN_MARD_221_NOTE : BUILTIN_MARD_291_NOTE
      : paletteSourceKind === "imported"
        ? `色卡来源：${paletteName}（用户导入，请以店铺/品牌原始色卡为准）`
        : MISSING_PALETTE_WARNING;
  const totalBeans = pattern ? pattern.width * pattern.height : gridWidth * gridHeight;
  const savedBeanTotal = useMemo(
    () => savedProjects.reduce((total, project) => total + project.pattern.cells.length, 0),
    [savedProjects],
  );
  const visibleProjects = useMemo(
    () => filterAndSortProjects(savedProjects, projectQuery, projectSort, projectCategoryFilter),
    [savedProjects, projectQuery, projectSort, projectCategoryFilter],
  );
  const communityPreviewProject = useMemo(
    () => savedProjects.find((project) => project.id === communityPreviewProjectId) ?? null,
    [savedProjects, communityPreviewProjectId],
  );
  const canUndo = canUndoPattern(patternHistory);
  const canRedo = canRedoPattern(patternHistory);
  const selectedArea = useMemo(() => {
    if (!selection) return null;
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const endX = Math.max(selection.startX, selection.endX);
    const endY = Math.max(selection.startY, selection.endY);
    return { x, y, width: endX - x + 1, height: endY - y + 1 };
  }, [selection]);
  const selectedAreaCount = selectedArea ? selectedArea.width * selectedArea.height : 0;

  useEffect(() => {
    let cancelled = false;
    void loadSavedProjects(MAX_SAVED_PROJECTS)
      .then(({ projects, backend, migrated }) => {
        if (cancelled) return;
        setSavedProjects(projects);
        setProjectsReady(true);
        if (migrated) {
          setPortfolioNotice(`已将 ${projects.length} 个旧作品迁移到新版作品库。`);
        } else if (backend === "localstorage") {
          setPortfolioNotice("作品已从当前设备载入；建议定期导出备份。");
        } else {
          setPortfolioNotice("作品保存在当前设备；建议定期导出备份。");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProjectsReady(true);
        setPortfolioNotice("作品库读取失败，可通过备份文件恢复作品。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sourceImage) return;
    const abortController = new AbortController();
    const timer = window.setTimeout(() => {
      if (!hasUsablePalette) {
        setPatternHistory((current) => resetPatternHistory(current, null));
        setActiveCell(null);
        setSelection(null);
        setIsSelecting(false);
        setStatus("图片已载入。请选择内置色卡或导入店铺/品牌 CSV 后再生成图纸。");
        return;
      }
      const canvas = workCanvasRef.current ?? document.createElement("canvas");
      workCanvasRef.current = canvas;
      canvas.width = gridWidth;
      canvas.height = gridHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const sourceW = sourceImage.naturalWidth;
      const sourceH = sourceImage.naturalHeight;
      const cropX = (crop.x / 100) * sourceW;
      const cropY = (crop.y / 100) * sourceH;
      const cropW = (crop.width / 100) * sourceW;
      const cropH = (crop.height / 100) * sourceH;

      ctx.clearRect(0, 0, gridWidth, gridHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceImage, cropX, cropY, cropW, cropH, 0, 0, gridWidth, gridHeight);
      const data = ctx.getImageData(0, 0, gridWidth, gridHeight).data;
      const pixels = packCanvasPixels(data, gridWidth, gridHeight);
      setStatus("正在后台计算颜色与图纸...");
      void generatePatternAsync({
        pixels,
        width: gridWidth,
        height: gridHeight,
        palette,
        colorLimit,
        ditherMode,
        imageAdjustments,
      }, { signal: abortController.signal })
        .then((nextPattern) => {
          if (abortController.signal.aborted) return;
          setPatternHistory((current) => resetPatternHistory(current, nextPattern));
          setActiveCell(null);
          setSelection(null);
          setIsSelecting(false);
          const ditherLabel = ditherMode === "none" ? "未使用抖动" : `已使用${ditherMode === "soft" ? "柔和" : "强化"}抖动`;
          setStatus(`已生成 ${gridWidth} x ${gridHeight}，共 ${gridWidth * gridHeight} 颗豆，${ditherLabel}。`);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setStatus(error instanceof Error ? `图纸生成失败：${error.message}` : "图纸生成失败，请重试。");
        });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [sourceImage, gridWidth, gridHeight, palette, colorLimit, ditherMode, crop, imageAdjustments, hasUsablePalette]);

  useEffect(() => {
    const canvas = sourcePreviewRef.current;
    if (!canvas) return;
    if (!sourceImage) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const maxWidth = 520;
    const ratio = sourceImage.naturalWidth / sourceImage.naturalHeight;
    canvas.width = maxWidth;
    canvas.height = Math.round(maxWidth / ratio);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    const x = (crop.x / 100) * canvas.width;
    const y = (crop.y / 100) * canvas.height;
    const w = (crop.width / 100) * canvas.width;
    const h = (crop.height / 100) * canvas.height;
    ctx.fillStyle = "rgba(14, 22, 35, 0.48)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.strokeStyle = "#ff6b4a";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }, [sourceImage, crop]);

  useEffect(() => {
    const canvas = patternCanvasRef.current;
    if (!canvas || !pattern) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cellSize = Math.max(5, Math.min(28, Math.floor(1180 / Math.max(pattern.width, pattern.height))));
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pattern.cells.forEach((cell, index) => {
      const x = index % pattern.width;
      const y = Math.floor(index / pattern.width);
      ctx.fillStyle = cell.hex;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      if (cellSize >= 16) {
        drawCenteredCellCode(ctx, cell.code, x * cellSize, y * cellSize, cellSize, cellSize, textColorForHex(cell.hex), cellSize >= 22 ? 9 : 7);
      }
    });
    ctx.strokeStyle = cellSize >= 10 ? "rgba(15, 23, 42, 0.28)" : "rgba(15, 23, 42, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(canvas.width, y * cellSize + 0.5);
      ctx.stroke();
    }
    if (activeCell !== null) {
      const x = activeCell % pattern.width;
      const y = Math.floor(activeCell / pattern.width);
      ctx.strokeStyle = "#ff6b4a";
      ctx.lineWidth = Math.max(2, cellSize / 5);
      ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
    if (selectedArea) {
      ctx.fillStyle = "rgba(255, 107, 74, 0.16)";
      ctx.fillRect(selectedArea.x * cellSize, selectedArea.y * cellSize, selectedArea.width * cellSize, selectedArea.height * cellSize);
      ctx.strokeStyle = "#ff6b4a";
      ctx.lineWidth = Math.max(2, cellSize / 5);
      ctx.strokeRect(
        selectedArea.x * cellSize + 1,
        selectedArea.y * cellSize + 1,
        selectedArea.width * cellSize - 2,
        selectedArea.height * cellSize - 2,
      );
    }
  }, [pattern, activeCell, selectedArea]);

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("请选择有效的图片文件。");
      input.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      setStatus("图片不能超过 30 MB，请先压缩后再上传。");
      input.value = "";
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
        setStatus("图片像素过大，请缩小到 8000 万像素以内。");
        input.value = "";
        return;
      }
      setSourceImage(image);
      setActiveProjectId(null);
      setImageName(file.name);
      setProjectTitle((current) => {
        const shouldAutoName = !current.trim() || current === "未命名拼豆图纸" || current === stripFileExtension(imageName);
        return shouldAutoName ? stripFileExtension(file.name) : current;
      });
      if (keepRatio) {
        setGridHeight(Math.max(8, Math.round(gridWidth * (image.naturalHeight / image.naturalWidth))));
      }
      setActiveMobilePanel("pattern");
      setStatus("图片已载入，正在生成图纸。");
      input.value = "";
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setStatus("图片无法解码，请转换为 JPEG、PNG 或 WebP 后重试。");
      input.value = "";
    };
    image.src = objectUrl;
  }

  function updateGridWidth(value: number) {
    const next = Math.max(8, Math.min(180, value));
    setGridWidth(next);
    if (keepRatio && sourceImage) {
      setGridHeight(Math.max(8, Math.min(180, Math.round(next * (sourceImage.naturalHeight / sourceImage.naturalWidth)))));
    }
  }

  function updateGridHeight(value: number) {
    setGridHeight(Math.max(8, Math.min(180, value)));
  }

  function updateCrop(key: keyof Crop, value: number) {
    setCrop((current) => {
      const next = { ...current, [key]: value };
      next.width = Math.max(10, Math.min(100, next.width));
      next.height = Math.max(10, Math.min(100, next.height));
      next.x = Math.max(0, Math.min(100 - next.width, next.x));
      next.y = Math.max(0, Math.min(100 - next.height, next.y));
      return next;
    });
  }

  function updateImageAdjustment<K extends keyof ImageAdjustments>(key: K, value: ImageAdjustments[K]) {
    setImageAdjustments((current) => ({ ...current, [key]: value }));
  }

  function handlePaletteUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PALETTE_FILE_BYTES) {
      setStatus("色卡 CSV 不能超过 2 MB。");
      input.value = "";
      return;
    }
    file.text().then((text) => {
      const parsed = parsePaletteCsv(text);
      if (parsed.length) {
        setPalette(parsed);
        setPaletteName(stripFileExtension(file.name) || file.name);
        setPaletteSourceKind("imported");
        setSelectedCode(parsed[0].code);
        setColorLimit(Math.min(Math.max(1, colorLimit), parsed.length));
        setStatus(`已导入 ${parsed.length} 个店铺色号。请确认 CSV 来自实际可购买色卡。`);
      } else {
        setStatus("色卡 CSV 未识别：请使用 code,name,hex 或 code,hex。");
      }
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "色卡 CSV 读取失败。");
    }).finally(() => {
      input.value = "";
    });
  }

  function useBuiltinMard221Palette() {
    const nextPalette = makeMard221Palette();
    setPalette(nextPalette);
    setPaletteName(BUILTIN_MARD_221_NAME);
    setPaletteSourceKind("builtin");
    setSelectedCode("H7");
    setColorLimit(Math.min(colorLimit, nextPalette.length));
    setStatus("已切换到 MARD 221 标准色卡。");
  }

  function useBuiltinMard291Palette() {
    const nextPalette = makeMard291Palette();
    setPalette(nextPalette);
    setPaletteName(BUILTIN_MARD_291_NAME);
    setPaletteSourceKind("builtin");
    setSelectedCode("H7");
    setColorLimit(Math.min(colorLimit, nextPalette.length));
    setStatus("已切换到 MARD 291 全色色卡。新增 70 个扩展色号。");
  }

  function makeSavedProjectThumbnail(targetPattern: Pattern) {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 132;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#f7fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cellSize = Math.max(1, Math.floor(Math.min(148 / targetPattern.width, 100 / targetPattern.height)));
    const previewW = targetPattern.width * cellSize;
    const previewH = targetPattern.height * cellSize;
    const startX = Math.floor((canvas.width - previewW) / 2);
    const startY = Math.floor((canvas.height - previewH) / 2);
    targetPattern.cells.forEach((cell, index) => {
      const x = index % targetPattern.width;
      const y = Math.floor(index / targetPattern.width);
      ctx.fillStyle = cell.hex;
      ctx.fillRect(startX + x * cellSize, startY + y * cellSize, cellSize, cellSize);
    });
    ctx.strokeStyle = "rgba(17, 24, 39, 0.22)";
    ctx.strokeRect(startX, startY, previewW, previewH);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function saveCurrentProject() {
    if (!pattern) {
      setStatus("请先生成图纸，再保存作品。");
      return;
    }
    if (!hasUsablePalette) {
      setStatus("请选择内置色卡或导入店铺/品牌 CSV，再保存正式图纸。");
      return;
    }
    const title = exportTitle;
    const now = new Date().toISOString();
    const previousProject = activeProjectId
      ? savedProjects.find((project) => project.id === activeProjectId)
      : undefined;
    const savedProject: SavedProject = {
      id: previousProject?.id ?? createSavedProjectId(),
      title,
      sourceName: imageName,
      savedAt: now,
      category: previousProject?.category ?? "未分类",
      remixSource: previousProject?.remixSource,
      pattern,
      palette,
      settings: {
        gridWidth,
        gridHeight,
        colorLimit,
        ditherMode,
        imageAdjustments,
        crop,
        selectedCode,
        paletteName,
        paletteSourceKind,
      },
      thumbnail: makeSavedProjectThumbnail(pattern),
    };
    const existing = savedProjects.filter((project) => project.id !== savedProject.id);
    const nextProjects = [savedProject, ...existing].slice(0, MAX_SAVED_PROJECTS);
    try {
      await saveSavedProjects(nextProjects);
    } catch {
      setPortfolioNotice("设备无法保存作品，请先导出备份并释放存储空间。");
      setStatus("保存失败：设备存储不可用。");
      return;
    }
    setSavedProjects(nextProjects);
    setActiveProjectId(savedProject.id);
    setPortfolioNotice(`已保存作品「${title}」。`);
    setStatus(`已保存作品「${title}」。`);
  }

  function restoreProject(project: SavedProject) {
    const projectHasUsablePalette =
      (project.settings.paletteSourceKind === "builtin" || project.settings.paletteSourceKind === "imported") && project.palette.length > 0;
    setSourceImage(null);
    setActiveProjectId(project.id);
    setProjectTitle(project.title);
    setImageName(project.sourceName);
    setPalette(projectHasUsablePalette ? project.palette : makeMard291Palette());
    setPaletteName(projectHasUsablePalette ? project.settings.paletteName ?? BUILTIN_MARD_291_NAME : BUILTIN_MARD_291_NAME);
    setPaletteSourceKind(projectHasUsablePalette ? project.settings.paletteSourceKind ?? "builtin" : "builtin");
    setGridWidth(project.settings.gridWidth);
    setGridHeight(project.settings.gridHeight);
    setColorLimit(project.settings.colorLimit);
    setDitherMode(project.settings.ditherMode);
    setImageAdjustments(project.settings.imageAdjustments ?? DEFAULT_IMAGE_ADJUSTMENTS);
    setCrop(project.settings.crop);
    setSelectedCode(projectHasUsablePalette ? project.settings.selectedCode : "H7");
    setPatternHistory((current) => resetPatternHistory(current, projectHasUsablePalette ? project.pattern : null));
    setActiveCell(null);
    setSelection(null);
    setIsSelecting(false);
    setPendingDeleteProjectId(null);
    setActiveMobilePanel("pattern");
    setStatus(projectHasUsablePalette ? `已恢复作品「${project.title}」，可继续编辑或导出。` : "这个旧项目没有可验证色卡，已切换到 MARD 291，请重新上传图片生成。");
  }

  function drawPaletteSourceNotice(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
    const fill = hasUsablePalette ? "#eef8f6" : "#fff1e8";
    const stroke = hasUsablePalette ? "#91d7d1" : "#ff9b74";
    const text = hasUsablePalette ? "#146b70" : "#8a2d13";
    fillRoundedRect(ctx, x, y, width, 42, 12, fill);
    strokeRoundedRect(ctx, x, y, width, 42, 12, stroke);
    ctx.fillStyle = text;
    ctx.font = "700 13px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    drawFittedText(ctx, paletteSourceText, x + 16, y + 23, width - 32);
  }

  function drawA4PaletteSourceLine(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = hasUsablePalette ? "#146b70" : "#9a3412";
    ctx.font = "700 12px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    drawFittedText(ctx, paletteSourceText, A4_CANVAS.margin, 174, A4_CANVAS.width - A4_CANVAS.margin * 2);
  }

  async function deleteSavedProject(projectId: string) {
    const nextProjects = savedProjects.filter((project) => project.id !== projectId);
    try {
      await saveSavedProjects(nextProjects);
      setSavedProjects(nextProjects);
      setPendingDeleteProjectId(null);
      if (editingProjectId === projectId) setEditingProjectId(null);
      if (communityPreviewProjectId === projectId) setCommunityPreviewProjectId(null);
      if (activeProjectId === projectId) setActiveProjectId(null);
      setPortfolioNotice("已删除本地保存的作品。");
      setStatus("已删除本地保存的作品。");
    } catch {
      setPortfolioNotice("删除失败，请稍后重试。");
    }
  }

  function startProjectRename(project: SavedProject) {
    setEditingProjectId(project.id);
    setRenameDraft(project.title);
    setPendingDeleteProjectId(null);
  }

  async function confirmProjectRename(event: FormEvent<HTMLFormElement>, project: SavedProject) {
    event.preventDefault();
    try {
      const renamed = renameSavedProject(project, renameDraft);
      const nextProjects = mergeSavedProjects(
        [],
        savedProjects.map((item) => item.id === project.id ? renamed : item),
        MAX_SAVED_PROJECTS,
      );
      await saveSavedProjects(nextProjects);
      setSavedProjects(nextProjects);
      setEditingProjectId(null);
      setPortfolioNotice(`已重命名为「${renamed.title}」。`);
    } catch (error: unknown) {
      setPortfolioNotice(error instanceof Error ? error.message : "重命名失败，请重试。");
    }
  }

  async function copySavedProject(project: SavedProject) {
    const copy = duplicateSavedProject(project, createSavedProjectId());
    const nextProjects = [copy, ...savedProjects].slice(0, MAX_SAVED_PROJECTS);
    try {
      await saveSavedProjects(nextProjects);
      setSavedProjects(nextProjects);
      setPendingDeleteProjectId(null);
      setPortfolioNotice(`已创建「${copy.title}」。`);
      void selectionHaptic();
    } catch {
      setPortfolioNotice("复制作品失败，请检查设备存储空间。");
    }
  }

  async function changeProjectCategory(project: SavedProject, category: ProjectCategory) {
    const nextProjects = savedProjects.map((item) =>
      item.id === project.id ? setSavedProjectCategory(item, category) : item,
    );
    try {
      await saveSavedProjects(nextProjects);
      setSavedProjects(nextProjects);
      setPortfolioNotice(`已将「${project.title}」归入${category}。`);
    } catch {
      setPortfolioNotice("分类保存失败，请稍后重试。");
    }
  }

  async function shareSavedProject(project: SavedProject) {
    setSharingProjectId(project.id);
    try {
      const blob = await createProjectPosterBlob(project);
      const delivery = await deliverExportFile(blob, `${makeSafeFilename(project.title)}-分享海报.png`, `${project.title} 分享海报`);
      setPortfolioNotice(delivery === "shared" ? "作品海报已打开分享菜单。" : "作品海报已导出。");
      void selectionHaptic();
    } catch {
      setPortfolioNotice("作品海报生成失败，请稍后重试。");
    } finally {
      setSharingProjectId(null);
    }
  }

  function openCommunityPreview(project: SavedProject) {
    setCommunityPreviewProjectId(project.id);
    setActiveMobilePanel("discover");
    setPendingDeleteProjectId(null);
  }

  async function remixCommunityPost(post: CommunityPost) {
    const remixed = createRemixedProject(post, createSavedProjectId());
    remixed.thumbnail = makeSavedProjectThumbnail(remixed.pattern);
    const nextProjects = [remixed, ...savedProjects].slice(0, MAX_SAVED_PROJECTS);
    await saveSavedProjects(nextProjects);
    setSavedProjects(nextProjects);
    setPortfolioNotice(`已将「${post.title}」复刻到我的作品。`);
    setStatus(`已创建「${remixed.title}」，可在作品页继续编辑。`);
    void selectionHaptic();
  }

  function exportProjectsBackup() {
    if (!savedProjects.length) {
      setPortfolioNotice("还没有可备份的作品。");
      return;
    }
    const backup = createProjectBackup(savedProjects);
    const filename = `拼豆作品备份-${new Date().toISOString().slice(0, 10)}.beadproject`;
    const blob = new Blob([backup], { type: "application/json;charset=utf-8" });
    void deliverExportFile(blob, filename, "拼豆作品备份")
      .then((delivery) => {
        setPortfolioNotice(delivery === "shared" ? "备份文件已打开分享菜单。" : "作品备份已导出。");
        void selectionHaptic();
      })
      .catch(() => setPortfolioNotice("备份导出失败，请重试。"));
  }

  async function importProjectsBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (file.size > MAX_PROJECT_BACKUP_BYTES) {
        throw new Error("备份文件过大，不能超过 96 MB。");
      }
      const imported = parseProjectBackup(await file.text());
      const nextProjects = mergeSavedProjects(savedProjects, imported, MAX_SAVED_PROJECTS);
      await saveSavedProjects(nextProjects);
      setSavedProjects(nextProjects);
      setPendingDeleteProjectId(null);
      setPortfolioNotice(`已导入 ${imported.length} 个作品，当前共有 ${nextProjects.length} 个。`);
      void selectionHaptic();
    } catch (error: unknown) {
      setPortfolioNotice(error instanceof Error ? error.message : "备份导入失败，请检查文件。");
    } finally {
      input.value = "";
    }
  }

  function showSetupPanel() {
    setActiveMobilePanel("setup");
    window.setTimeout(() => {
      document.getElementById("setup-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function paintCell(index: number) {
    if (!pattern || !selectedColor) return;
    setPatternHistory((current) => {
      if (!current.present || current.present.cells[index]?.code === selectedColor.code) return current;
      return commitPattern(current, paintPatternCell(current.present, index, selectedColor));
    });
    setActiveCell(index);
    setSelection(null);
  }

  function fillSelection() {
    if (!selectedArea || !selectedColor) return;
    setPatternHistory((current) => {
      if (!current.present) return current;
      const nextPattern = paintPatternArea(current.present, selectedArea, selectedColor);
      return nextPattern === current.present ? current : commitPattern(current, nextPattern);
    });
    setStatus(`已将选区 ${selectedArea.width} x ${selectedArea.height} 替换为 ${selectedColor.code}。`);
  }

  function undoEdit() {
    if (!canUndo) return;
    setPatternHistory((current) => undoPattern(current));
    setActiveCell(null);
  }

  function redoEdit() {
    if (!canRedo) return;
    setPatternHistory((current) => redoPattern(current));
    setActiveCell(null);
  }

  function getCanvasCell(event: PointerEvent<HTMLCanvasElement>) {
    if (!pattern) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * pattern.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * pattern.height);
    if (x < 0 || x >= pattern.width || y < 0 || y >= pattern.height) return null;
    return { x, y };
  }

  function handlePatternPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!pattern) return;
    const cell = getCanvasCell(event);
    if (!cell) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (editMode === "paint") {
      paintCell(cell.y * pattern.width + cell.x);
      return;
    }
    setActiveCell(null);
    setSelection({ startX: cell.x, startY: cell.y, endX: cell.x, endY: cell.y });
    setIsSelecting(true);
  }

  function handlePatternPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (editMode !== "select" || !isSelecting) return;
    const cell = getCanvasCell(event);
    if (!cell) return;
    setSelection((current) => (current ? { ...current, endX: cell.x, endY: cell.y } : current));
  }

  function handlePatternPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (editMode !== "select" || !isSelecting) return;
    const cell = getCanvasCell(event);
    if (cell) {
      setSelection((current) => (current ? { ...current, endX: cell.x, endY: cell.y } : current));
    }
    setIsSelecting(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function makeExportCanvas() {
    if (!pattern) return null;
    const legend = summarizePattern(pattern, palette);
    const margin = 72;
    const label = 46;
    const cellSize = Math.max(18, Math.min(28, Math.floor(2600 / Math.max(pattern.width, pattern.height))));
    const gridW = pattern.width * cellSize;
    const gridH = pattern.height * cellSize;
    const legendW = 430;
    const headerH = 240;
    const footerH = 80;
    const legendRows = Math.max(legend.length, Math.ceil((gridH - 60) / 42));
    const canvasW = margin + label + gridW + 54 + legendW + margin;
    const canvasH = Math.max(headerH + label + gridH + footerH, headerH + 90 + legendRows * 42 + footerH);
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    background.addColorStop(0, "#eef8f6");
    background.addColorStop(0.52, "#fff9ef");
    background.addColorStop(1, "#f7fafc");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    fillRoundedRect(ctx, margin, 46, canvas.width - margin * 2, 116, 26, "#12343a");
    ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
    ctx.font = "700 16px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("BEAD PATTERN STUDIO / PNG PATTERN SHEET", margin + 28, 90);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 38px Arial, PingFang SC, sans-serif";
    drawFittedText(ctx, exportTitle, margin + 28, 136, 980);
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.font = "700 15px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${pattern.width} x ${pattern.height} / ${formatCount(pattern.cells.length)} 颗 / ${legend.length} 色`, canvas.width - margin - 28, 90);
    drawPaletteSourceNotice(ctx, margin, 176, canvas.width - margin * 2);

    const gridX = margin + label;
    const gridY = headerH + label;
    drawCard(ctx, margin, headerH, label + gridW + 28, label + gridH + 28, 24);
    fillRoundedRect(ctx, gridX - 8, gridY - 38, gridW + 16, 30, 10, "#eef5f4");
    fillRoundedRect(ctx, gridX - 40, gridY - 8, 30, gridH + 16, 10, "#eef5f4");

    ctx.font = "700 11px Arial, PingFang SC, sans-serif";
    ctx.fillStyle = "#344054";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < pattern.width; x += 1) {
      if (x % 5 === 0 || cellSize >= 22) {
        ctx.fillText(String(x + 1), gridX + x * cellSize + cellSize / 2, gridY - 22);
      }
    }
    ctx.textAlign = "right";
    for (let y = 0; y < pattern.height; y += 1) {
      if (y % 5 === 0 || cellSize >= 22) {
        ctx.fillText(String(y + 1), gridX - 10, gridY + y * cellSize + cellSize / 2);
      }
    }

    pattern.cells.forEach((cell, index) => {
      const x = index % pattern.width;
      const y = Math.floor(index / pattern.width);
      const cellX = gridX + x * cellSize;
      const cellY = gridY + y * cellSize;
      ctx.fillStyle = cell.hex;
      ctx.fillRect(cellX, cellY, cellSize, cellSize);
      drawCenteredCellCode(ctx, cell.code, cellX, cellY, cellSize, cellSize, textColorForHex(cell.hex), cellSize >= 22 ? 9 : 7);
    });

    ctx.strokeStyle = "rgba(17, 24, 39, 0.34)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(gridX + x * cellSize + 0.5, gridY);
      ctx.lineTo(gridX + x * cellSize + 0.5, gridY + gridH);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + y * cellSize + 0.5);
      ctx.lineTo(gridX + gridW, gridY + y * cellSize + 0.5);
      ctx.stroke();
    }

    const legendX = gridX + gridW + 54;
    const legendY = headerH;
    drawCard(ctx, legendX, legendY, legendW, Math.max(300, canvas.height - headerH - footerH), 24);
    ctx.fillStyle = "#111827";
    ctx.font = "800 24px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("完整色号图例", legendX + 28, legendY + 50);
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "13px Arial, PingFang SC, sans-serif";
    ctx.fillText("每格文字对应左侧色号。", legendX + 28, legendY + 76);
    legend.forEach((item, index) => {
      drawLegendItem(ctx, legendX + 28, legendY + 104 + index * 42, legendW - 56, item);
    });

    ctx.fillStyle = "#81909d";
    ctx.font = "13px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Generated by Bead Pattern Studio", canvas.width / 2, canvas.height - 36);
    return canvas;
  }

  function makeA4Canvas() {
    const canvas = document.createElement("canvas");
    canvas.width = A4_CANVAS.width;
    canvas.height = A4_CANVAS.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#f7fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  }

  function drawA4Header(ctx: CanvasRenderingContext2D, title: string, subtitle: string, pageLabel: string, accent = "#146b70") {
    const gradient = ctx.createLinearGradient(0, 0, A4_CANVAS.width, 132);
    gradient.addColorStop(0, "#12343a");
    gradient.addColorStop(0.56, accent);
    gradient.addColorStop(1, "#ff6b4a");
    fillRoundedRect(ctx, A4_CANVAS.margin, 44, A4_CANVAS.width - A4_CANVAS.margin * 2, 104, 22, gradient);
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = "700 13px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("BEAD PATTERN STUDIO", A4_CANVAS.margin + 28, 84);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 31px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(title, A4_CANVAS.margin + 28, 122);
    ctx.font = "13px Arial, PingFang SC, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    drawFittedText(ctx, subtitle, A4_CANVAS.margin + 380, 122, 460);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 14px Arial, PingFang SC, sans-serif";
    ctx.fillText(pageLabel, A4_CANVAS.width - A4_CANVAS.margin - 28, 84);
  }

  function drawPatternPreview(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    maxWidth: number,
    maxHeight: number,
    showFrame = true,
  ) {
    if (!pattern) return;
    const previewCell = Math.max(1, Math.floor(Math.min(maxWidth / pattern.width, maxHeight / pattern.height)));
    const previewW = pattern.width * previewCell;
    const previewH = pattern.height * previewCell;
    const offsetX = startX + Math.floor((maxWidth - previewW) / 2);
    const offsetY = startY + Math.floor((maxHeight - previewH) / 2);
    pattern.cells.forEach((cell, index) => {
      const x = index % pattern.width;
      const y = Math.floor(index / pattern.width);
      ctx.fillStyle = cell.hex;
      ctx.fillRect(offsetX + x * previewCell, offsetY + y * previewCell, previewCell, previewCell);
    });
    if (showFrame) {
      ctx.strokeStyle = "rgba(17, 24, 39, 0.28)";
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX, offsetY, previewW, previewH);
    }
  }

  function getA4GridLayout() {
    const cellSize = 24;
    const label = 42;
    const header = 168;
    const footer = 118;
    const gridX = A4_CANVAS.margin + label;
    const gridY = A4_CANVAS.margin + header + label;
    const colsPerPage = Math.max(1, Math.floor((A4_CANVAS.width - A4_CANVAS.margin * 2 - label) / cellSize));
    const rowsPerPage = Math.max(1, Math.floor((A4_CANVAS.height - A4_CANVAS.margin * 2 - header - footer - label) / cellSize));
    return { cellSize, label, header, footer, gridX, gridY, colsPerPage, rowsPerPage };
  }

  function getA4LegendPageCount() {
    const columns = 2;
    const rowsPerPage = 22;
    return Math.max(1, Math.ceil(stats.length / (columns * rowsPerPage)));
  }

  function drawMetricCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, value: string, tint: string) {
    fillRoundedRect(ctx, x, y, width, 112, 18, tint);
    strokeRoundedRect(ctx, x, y, width, 112, 18, "rgba(17, 24, 39, 0.08)");
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "700 13px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 22, y + 36);
    ctx.fillStyle = "#111827";
    ctx.font = "800 28px Arial, PingFang SC, sans-serif";
    ctx.fillText(value, x + 22, y + 76);
  }

  function drawLegendItem(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, item: (typeof stats)[number]) {
    fillRoundedRect(ctx, x, y, width, 44, 12, "#ffffff");
    strokeRoundedRect(ctx, x, y, width, 44, 12, "#e3ebef");
    ctx.fillStyle = item.color?.hex ?? "#111827";
    fillRoundedRect(ctx, x + 12, y + 10, 24, 24, 6, ctx.fillStyle);
    ctx.strokeStyle = "rgba(17, 24, 39, 0.2)";
    ctx.strokeRect(x + 12, y + 10, 24, 24);
    ctx.fillStyle = "#111827";
    ctx.font = "700 12px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(item.code, x + 46, y + 27);
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "12px Arial, PingFang SC, sans-serif";
    ctx.fillText(item.color?.name ?? "", x + 92, y + 27);
    ctx.textAlign = "right";
    ctx.fillStyle = "#146b70";
    ctx.font = "700 12px Arial, PingFang SC, sans-serif";
    ctx.fillText(`${formatCount(item.count)} 颗`, x + width - 14, y + 27);
  }

  function getTileStats(startCol: number, startRow: number, cols: number, rows: number) {
    if (!pattern) return [];
    const counts = new Map<string, number>();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = pattern.cells[(startRow + row) * pattern.width + startCol + col];
        counts.set(cell.code, (counts.get(cell.code) ?? 0) + 1);
      }
    }
    const colorByCode = new Map(palette.map((color) => [color.code, color]));
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, color: colorByCode.get(code), percent: count / (cols * rows) }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }));
  }

  function makeA4SummaryPage() {
    if (!pattern) return null;
    const page = makeA4Canvas();
    if (!page) return null;
    const { canvas, ctx } = page;
    const gridLayout = getA4GridLayout();
    const totalGridPages =
      Math.ceil(pattern.width / gridLayout.colsPerPage) * Math.ceil(pattern.height / gridLayout.rowsPerPage);
    const totalLegendPages = getA4LegendPageCount();
    drawA4Header(ctx, exportTitle, `源图 ${imageName}`, "封面 / 总览", "#1f9a94");
    drawA4PaletteSourceLine(ctx);

    drawCard(ctx, 72, 184, 700, 860, 24);
    ctx.fillStyle = "#111827";
    ctx.font = "800 24px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("作品预览", 106, 232);
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "13px Arial, PingFang SC, sans-serif";
    ctx.fillText("用于确认整体配色与构图，后续分页为实际制作网格。", 106, 260);
    fillRoundedRect(ctx, 106, 292, 632, 704, 18, "#f2f7f7");
    drawPatternPreview(ctx, 136, 326, 572, 636);

    drawCard(ctx, 806, 184, 362, 420, 24);
    ctx.fillStyle = "#111827";
    ctx.font = "800 23px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("制作信息", 838, 232);
    drawMetricCard(ctx, 838, 270, 142, "尺寸", `${pattern.width} x ${pattern.height}`, "#eef8f6");
    drawMetricCard(ctx, 994, 270, 142, "豆数", formatCount(pattern.cells.length), "#fff4ec");
    drawMetricCard(ctx, 838, 404, 142, "色号", `${stats.length} 色`, "#f4f1ff");
    drawMetricCard(ctx, 994, 404, 142, "页数", `${totalGridPages + totalLegendPages + 1} 页`, "#fff9de");

    drawCard(ctx, 806, 638, 362, 406, 24);
    ctx.fillStyle = "#111827";
    ctx.font = "800 23px Arial, PingFang SC, sans-serif";
    ctx.fillText("打印说明", 838, 688);
    ctx.fillStyle = "#445464";
    ctx.font = "15px Arial, PingFang SC, sans-serif";
    [
      "1. 按 A4 纵向打印。",
      "2. 分页网格按列号和行号对齐。",
      "3. 每格内的文字为完整色号。",
      "4. 完整图例页用于备豆和补货。",
      "5. 建议先打印封面核对配色。",
    ].forEach((line, index) => {
      ctx.fillText(line, 838, 734 + index * 42);
    });

    drawCard(ctx, 72, 1096, 1096, 500, 24);
    ctx.fillStyle = "#111827";
    ctx.font = "800 24px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("色号图例 / 用量预览", 106, 1148);
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "13px Arial, PingFang SC, sans-serif";
    ctx.fillText("完整图例见后续图例页；按使用量排序，便于购买和核对库存。", 106, 1174);
    const columns = 2;
    const rowHeight = 54;
    const columnWidth = 510;
    stats.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 106 + column * columnWidth;
      const y = 1210 + row * rowHeight;
      if (y < 1542) drawLegendItem(ctx, x, y, 480, item);
    });
    ctx.fillStyle = "#81909d";
    ctx.font = "12px Arial, PingFang SC, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Generated by Bead Pattern Studio", A4_CANVAS.width / 2, 1654);
    return canvas;
  }

  function makeA4LegendPages() {
    if (!pattern) return [];
    const pages: HTMLCanvasElement[] = [];
    const columns = 2;
    const rowsPerPage = 22;
    const itemsPerPage = columns * rowsPerPage;
    const totalPages = getA4LegendPageCount();
    const columnWidth = 510;
    const rowHeight = 56;

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const page = makeA4Canvas();
      if (!page) continue;
      const { canvas, ctx } = page;
      drawA4Header(ctx, exportTitle, "完整色号图例与用量", `图例 ${pageIndex + 1} / ${totalPages}`, "#1f9a94");
      drawA4PaletteSourceLine(ctx);
      drawCard(ctx, 72, 196, 1096, 1348, 24);
      ctx.fillStyle = "#111827";
      ctx.font = "800 24px Arial, PingFang SC, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("完整色号图例 / 用量", 106, 248);
      ctx.fillStyle = "#5f6b7a";
      ctx.font = "13px Arial, PingFang SC, sans-serif";
      ctx.fillText("请按这里核对色号、名称和所需颗数。", 106, 276);

      stats.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage).forEach((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = 106 + column * columnWidth;
        const y = 314 + row * rowHeight;
        drawLegendItem(ctx, x, y, 480, item);
      });

      ctx.fillStyle = "#81909d";
      ctx.font = "12px Arial, PingFang SC, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${pattern.width} x ${pattern.height} / ${formatCount(pattern.cells.length)} 颗 / ${stats.length} 色`, A4_CANVAS.margin, A4_CANVAS.height - 58);
      ctx.textAlign = "right";
      ctx.fillText("Bead Pattern Studio", A4_CANVAS.width - A4_CANVAS.margin, A4_CANVAS.height - 58);
      pages.push(canvas);
    }
    return pages;
  }

  function makeA4GridPages() {
    if (!pattern) return [];
    const pages: HTMLCanvasElement[] = [];
    const { cellSize, gridX, gridY, colsPerPage, rowsPerPage } = getA4GridLayout();
    const xPages = Math.ceil(pattern.width / colsPerPage);
    const yPages = Math.ceil(pattern.height / rowsPerPage);
    const totalPages = xPages * yPages;

    for (let tileY = 0; tileY < yPages; tileY += 1) {
      for (let tileX = 0; tileX < xPages; tileX += 1) {
        const page = makeA4Canvas();
        if (!page) continue;
        const { canvas, ctx } = page;
        const startCol = tileX * colsPerPage;
        const startRow = tileY * rowsPerPage;
        const cols = Math.min(colsPerPage, pattern.width - startCol);
        const rows = Math.min(rowsPerPage, pattern.height - startRow);
        const pageNumber = tileY * xPages + tileX + 1;

        drawA4Header(
          ctx,
          exportTitle,
          `列 ${startCol + 1}-${startCol + cols} / 行 ${startRow + 1}-${startRow + rows}`,
          `网格 ${pageNumber} / ${totalPages}`,
          "#146b70",
        );
        drawA4PaletteSourceLine(ctx);

        const gridCardX = A4_CANVAS.margin;
        const gridCardY = 196;
        const gridCardW = A4_CANVAS.width - A4_CANVAS.margin * 2;
        const gridCardH = rows * cellSize + 92;
        drawCard(ctx, gridCardX, gridCardY, gridCardW, gridCardH, 22);
        fillRoundedRect(ctx, gridX - 8, gridY - 38, cols * cellSize + 16, 30, 10, "#eef5f4");

        ctx.font = "10px Arial, PingFang SC, sans-serif";
        ctx.fillStyle = "#344054";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let col = 0; col < cols; col += 1) {
          ctx.fillText(String(startCol + col + 1), gridX + col * cellSize + cellSize / 2, gridY - 22);
        }
        fillRoundedRect(ctx, gridX - 40, gridY - 8, 30, rows * cellSize + 16, 10, "#eef5f4");
        ctx.textAlign = "right";
        for (let row = 0; row < rows; row += 1) {
          ctx.fillText(String(startRow + row + 1), gridX - 10, gridY + row * cellSize + cellSize / 2);
        }

        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const cell = pattern.cells[(startRow + row) * pattern.width + startCol + col];
            const x = gridX + col * cellSize;
            const y = gridY + row * cellSize;
            ctx.fillStyle = cell.hex;
            ctx.fillRect(x, y, cellSize, cellSize);
            drawCenteredCellCode(ctx, cell.code, x, y, cellSize, cellSize, textColorForHex(cell.hex), 8);
          }
        }

        ctx.strokeStyle = "rgba(17, 24, 39, 0.32)";
        ctx.lineWidth = 1;
        for (let col = 0; col <= cols; col += 1) {
          ctx.beginPath();
          ctx.moveTo(gridX + col * cellSize + 0.5, gridY);
          ctx.lineTo(gridX + col * cellSize + 0.5, gridY + rows * cellSize);
          ctx.stroke();
        }
        for (let row = 0; row <= rows; row += 1) {
          ctx.beginPath();
          ctx.moveTo(gridX, gridY + row * cellSize + 0.5);
          ctx.lineTo(gridX + cols * cellSize, gridY + row * cellSize + 0.5);
          ctx.stroke();
        }

        const tileStats = getTileStats(startCol, startRow, cols, rows).slice(0, 8);
        const legendY = Math.min(gridY + rows * cellSize + 48, A4_CANVAS.height - 170);
        ctx.textAlign = "left";
        ctx.fillStyle = "#111827";
        ctx.font = "800 15px Arial, PingFang SC, sans-serif";
        ctx.fillText("本页主要色号", A4_CANVAS.margin, legendY);
        tileStats.forEach((item, index) => {
          const x = A4_CANVAS.margin + 128 + index * 120;
          ctx.fillStyle = item.color?.hex ?? "#111827";
          fillRoundedRect(ctx, x, legendY - 18, 22, 22, 5, ctx.fillStyle);
          ctx.strokeStyle = "rgba(17, 24, 39, 0.2)";
          ctx.strokeRect(x, legendY - 18, 22, 22);
          ctx.fillStyle = "#344054";
          ctx.font = "700 11px Arial, PingFang SC, sans-serif";
          ctx.fillText(item.code, x + 30, legendY);
        });

        ctx.textAlign = "left";
        ctx.fillStyle = "#5f6b7a";
        ctx.font = "12px Arial, PingFang SC, sans-serif";
        ctx.fillText(`${pattern.width} x ${pattern.height} / ${formatCount(pattern.cells.length)} 颗`, A4_CANVAS.margin, A4_CANVAS.height - 58);
        ctx.textAlign = "right";
        ctx.fillText("Bead Pattern Studio", A4_CANVAS.width - A4_CANVAS.margin, A4_CANVAS.height - 58);
        pages.push(canvas);
      }
    }
    return pages;
  }

  function exportPng() {
    if (!hasUsablePalette) {
      setStatus("请选择内置色卡或导入店铺/品牌 CSV，再导出 PNG 图纸。");
      return;
    }
    const canvas = makeExportCanvas();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      void deliverExportFile(blob, `${exportFilename}-pattern.png`, `${projectTitle} PNG 图纸`)
        .then((delivery) => {
          setStatus(delivery === "shared" ? "PNG 图纸已打开分享菜单。" : "PNG 图纸已导出。");
          void selectionHaptic();
        })
        .catch(() => setStatus("PNG 导出失败，请重试。"));
    }, "image/png");
  }

  function exportPdf() {
    if (!hasUsablePalette) {
      setStatus("请选择内置色卡或导入店铺/品牌 CSV，再导出 PDF 图纸。");
      return;
    }
    const summaryPage = makeA4SummaryPage();
    const legendPages = makeA4LegendPages();
    const gridPages = makeA4GridPages();
    const pages = [summaryPage, ...legendPages, ...gridPages].filter((page): page is HTMLCanvasElement => Boolean(page));
    if (!pages.length) return;
    const pdf = makePdfFromJpegPages(
      pages.map((page) => ({
        dataUrl: page.toDataURL("image/jpeg", 0.92),
        imageWidth: page.width,
        imageHeight: page.height,
      })),
    );
    void deliverExportFile(pdf, `${exportFilename}-a4.pdf`, `${projectTitle} PDF 图纸`)
      .then((delivery) => {
        setStatus(delivery === "shared" ? "PDF 图纸已打开分享菜单。" : "PDF 图纸已导出。");
        void selectionHaptic();
      })
      .catch(() => setStatus("PDF 导出失败，请重试。"));
  }

  return (
    <main className="bead-app">
      <header className="hero">
        <div>
          <p className="eyebrow">Bead Pattern Studio</p>
          <h1>把<em>任何图片</em>变成拼豆图纸</h1>
          <p className="hero-copy">
            选一张照片，选好色卡和尺寸，剩下的交给像素魔法。
          </p>
        </div>
        <div className="hero-meter">
          <span>{palette.length}</span>
          <small>可用色号</small>
          <span>{totalBeans.toLocaleString("zh-CN")}</span>
          <small>预计豆数</small>
        </div>
      </header>

      <nav className="mobile-tabbar" aria-label="移动端功能分区">
        <button
          type="button"
          className={activeMobilePanel === "setup" ? "active" : ""}
          aria-pressed={activeMobilePanel === "setup"}
          onClick={() => setActiveMobilePanel("setup")}
        >
          <span>🏠</span>
          <small>首页</small>
        </button>
        <button
          type="button"
          className={activeMobilePanel === "pattern" ? "active" : ""}
          aria-pressed={activeMobilePanel === "pattern"}
          onClick={() => setActiveMobilePanel("pattern")}
        >
          <span>⊞</span>
          <small>图纸</small>
        </button>
        <button
          type="button"
          className={activeMobilePanel === "palette" ? "active" : ""}
          aria-pressed={activeMobilePanel === "palette"}
          onClick={() => setActiveMobilePanel("palette")}
        >
          <span>◎</span>
          <small>色号</small>
        </button>
        <button
          type="button"
          className={activeMobilePanel === "discover" ? "active" : ""}
          aria-pressed={activeMobilePanel === "discover"}
          onClick={() => setActiveMobilePanel("discover")}
        >
          <span>🔍</span>
          <small>发现</small>
        </button>
        <button
          type="button"
          className={activeMobilePanel === "works" ? "active" : ""}
          aria-pressed={activeMobilePanel === "works"}
          onClick={() => setActiveMobilePanel("works")}
        >
          <span>♡</span>
          <small>作品</small>
        </button>
      </nav>

      <section className="workspace" aria-label="拼豆图纸工具">
        <aside id="setup-panel" className={`panel controls mobile-panel ${activeMobilePanel === "setup" ? "mobile-panel-active" : ""}`}>
          <div className="panel-title">
            <span>1</span>
            <h2>图片与裁剪</h2>
          </div>
          <label className="file-drop">
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            <strong>上传图片</strong>
            <small>{imageName}</small>
          </label>

          <label className="project-name-field">
            作品名称
            <input
              type="text"
              value={projectTitle}
              maxLength={80}
              onChange={(event) => setProjectTitle(event.target.value)}
              placeholder="例如：圣诞挂画 01"
            />
          </label>

          <canvas ref={sourcePreviewRef} className="source-preview" aria-label="裁剪预览" />
          {!sourceImage && <div className="empty-preview">等待图片上传</div>}

          <div className="field-grid">
            <label>
              裁剪 X
              <input type="range" min="0" max="90" value={crop.x} onChange={(event) => updateCrop("x", Number(event.target.value))} />
            </label>
            <label>
              裁剪 Y
              <input type="range" min="0" max="90" value={crop.y} onChange={(event) => updateCrop("y", Number(event.target.value))} />
            </label>
            <label>
              宽度 %
              <input type="range" min="10" max="100" value={crop.width} onChange={(event) => updateCrop("width", Number(event.target.value))} />
            </label>
            <label>
              高度 %
              <input type="range" min="10" max="100" value={crop.height} onChange={(event) => updateCrop("height", Number(event.target.value))} />
            </label>
          </div>

          <div className="image-adjustment-header">
            <strong>图片优化</strong>
            <button type="button" onClick={() => setImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS)} disabled={
              imageAdjustments.brightness === 0 &&
              imageAdjustments.contrast === 0 &&
              imageAdjustments.saturation === 0 &&
              imageAdjustments.backgroundRemoval === "none"
            }>重置</button>
          </div>
          <div className="image-adjustment-grid">
            <label>
              <span>亮度</span><b>{imageAdjustments.brightness > 0 ? "+" : ""}{imageAdjustments.brightness}</b>
              <input type="range" min="-40" max="40" value={imageAdjustments.brightness} onChange={(event) => updateImageAdjustment("brightness", Number(event.target.value))} />
            </label>
            <label>
              <span>对比度</span><b>{imageAdjustments.contrast > 0 ? "+" : ""}{imageAdjustments.contrast}</b>
              <input type="range" min="-40" max="40" value={imageAdjustments.contrast} onChange={(event) => updateImageAdjustment("contrast", Number(event.target.value))} />
            </label>
            <label>
              <span>饱和度</span><b>{imageAdjustments.saturation > 0 ? "+" : ""}{imageAdjustments.saturation}</b>
              <input type="range" min="-60" max="60" value={imageAdjustments.saturation} onChange={(event) => updateImageAdjustment("saturation", Number(event.target.value))} />
            </label>
          </div>
          <div className="mode-field image-background-mode">
            <span>去背景</span>
            <div className="mode-toggle" role="group" aria-label="去背景强度">
              {([[
                "none", "关闭",
              ], ["soft", "柔和"], ["strong", "强力"]] as [ImageAdjustments["backgroundRemoval"], string][]).map(([mode, label]) => (
                <button key={mode} type="button" className={imageAdjustments.backgroundRemoval === mode ? "active" : ""} aria-pressed={imageAdjustments.backgroundRemoval === mode} onClick={() => updateImageAdjustment("backgroundRemoval", mode)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="panel-title compact">
            <span>2</span>
            <h2>成品尺寸</h2>
          </div>
          <div className="number-row">
            <label>
              宽
              <input type="number" min="8" max="180" value={gridWidth} onChange={(event) => updateGridWidth(Number(event.target.value))} />
            </label>
            <label>
              高
              <input type="number" min="8" max="180" value={gridHeight} disabled={keepRatio} onChange={(event) => updateGridHeight(Number(event.target.value))} />
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={keepRatio} onChange={(event) => setKeepRatio(event.target.checked)} />
            按源图比例自动高度
          </label>
          <div className="local-processing-note" role="note">
            <strong>图片仅在本机处理</strong>
            <span>无需登录，不上传原图；作品保存在当前设备。</span>
          </div>
          <label className="slider-label">
            色数上限：{colorLimit}
            <input
              type="range"
              min="1"
              max={Math.max(1, palette.length)}
              value={Math.min(colorLimit, Math.max(1, palette.length))}
              disabled={!hasUsablePalette}
              onChange={(event) => setColorLimit(Number(event.target.value))}
            />
          </label>
          <div className="mode-field">
            <span>抖动</span>
            <div className="mode-toggle" role="group" aria-label="抖动模式">
              {[
                ["none", "关闭"],
                ["soft", "柔和"],
                ["strong", "强化"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={ditherMode === mode ? "active" : ""}
                  aria-pressed={ditherMode === mode}
                  onClick={() => setDitherMode(mode as DitherMode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className={`pattern-stage mobile-panel ${activeMobilePanel === "pattern" ? "mobile-panel-active" : ""}`}>
          <div className="stage-toolbar">
            <div>
              <h2>图纸编辑</h2>
              <p>{status}</p>
            </div>
            <div className="export-actions">
              <button type="button" onClick={saveCurrentProject} disabled={!projectsReady || !pattern || !hasUsablePalette}>保存</button>
              <button type="button" onClick={exportPng} disabled={!pattern || !hasUsablePalette}>PNG 图纸</button>
              <button type="button" onClick={exportPdf} disabled={!pattern || !hasUsablePalette}>PDF 图纸</button>
            </div>
          </div>

          <div className="canvas-wrap">
            {pattern ? (
              <canvas
                ref={patternCanvasRef}
                onPointerDown={handlePatternPointerDown}
                onPointerMove={handlePatternPointerMove}
                onPointerUp={handlePatternPointerUp}
                className={editMode === "select" ? "pattern-canvas selecting" : "pattern-canvas"}
                aria-label="拼豆图纸，可点击单格或拖拽框选区域"
              />
            ) : (
              <div className="pattern-empty">
                <strong>{hasUsablePalette ? "上传图片开始生成" : "先选择色卡"}</strong>
                <span>{hasUsablePalette ? "这里会显示可点击编辑的拼豆网格。" : "默认可使用 MARD 291，也可以切换 221 或导入店铺自己的 CSV。"}</span>
              </div>
            )}
          </div>

          <div className="paint-bar">
            <div>
              <strong>{editMode === "paint" ? "手工替换单格" : "区域批量换色"}</strong>
              <span>{editMode === "paint" ? "选择色号后点击任意格子即可替换。" : selectedArea ? `已选 ${selectedArea.width} x ${selectedArea.height}，共 ${selectedAreaCount} 格。` : "拖拽图纸框选要替换的区域。"}</span>
            </div>
            <div className="edit-mode-toggle" role="group" aria-label="编辑模式">
              <button type="button" className={editMode === "paint" ? "active" : ""} aria-pressed={editMode === "paint"} onClick={() => setEditMode("paint")}>
                单格
              </button>
              <button type="button" className={editMode === "select" ? "active" : ""} aria-pressed={editMode === "select"} onClick={() => setEditMode("select")}>
                选区
              </button>
            </div>
            <div className="history-actions">
              <button type="button" onClick={undoEdit} disabled={!canUndo} title="撤销上一次改单格">
                撤销
              </button>
              <button type="button" onClick={redoEdit} disabled={!canRedo} title="重做上一次改单格">
                重做
              </button>
            </div>
            <select value={selectedCode} disabled={!hasUsablePalette} onChange={(event) => setSelectedCode(event.target.value)}>
              {hasUsablePalette ? (
                palette.map((color) => (
                  <option key={color.code} value={color.code}>{color.code} · {color.name}</option>
                ))
              ) : (
                <option value="">请先选择色卡</option>
              )}
            </select>
            <span className="swatch-large" style={{ background: selectedColor?.hex }} />
            <div className="selection-actions">
              <button type="button" onClick={fillSelection} disabled={!selectedArea || !pattern}>
                填充选区
              </button>
              <button type="button" onClick={() => setSelection(null)} disabled={!selectedArea}>
                清除
              </button>
            </div>
          </div>
        </section>

        <aside className={`panel stats-panel mobile-panel ${activeMobilePanel === "palette" ? "mobile-panel-active" : ""}`}>
          <div className="panel-title">
            <span>3</span>
            <h2>色卡与用量</h2>
          </div>
          <label className="file-drop compact-drop">
            <input type="file" accept=".csv,text/csv" onChange={handlePaletteUpload} />
            <strong>可选：导入店铺色卡 CSV</strong>
            <small>默认使用 MARD 291 全色；CSV 支持 code,name,hex 或 code,hex</small>
          </label>
          <div className="palette-preset-switch" role="group" aria-label="内置色卡选择">
            <button type="button" className={paletteSourceKind === "builtin" && paletteName === BUILTIN_MARD_291_NAME ? "active" : ""} onClick={useBuiltinMard291Palette}>
              291 全色
            </button>
            <button type="button" className={paletteSourceKind === "builtin" && paletteName === BUILTIN_MARD_221_NAME ? "active" : ""} onClick={useBuiltinMard221Palette}>
              221 常用
            </button>
          </div>
          <div className={hasUsablePalette ? "palette-source" : "palette-source warning"}>
            <strong>{paletteName}</strong>
            <span>{paletteSourceText}</span>
          </div>

          <div className="palette-grid" aria-label="色号表">
            {hasUsablePalette ? (
              palette.map((color) => (
                <button
                  key={color.code}
                  type="button"
                  className={selectedCode === color.code ? "color-chip selected" : "color-chip"}
                  onClick={() => setSelectedCode(color.code)}
                  title={`${color.code} ${color.name}`}
                >
                  <span style={{ background: color.hex }} />
                  {color.code}
                </button>
              ))
            ) : (
              <p className="muted palette-placeholder">请选择内置色卡或导入 CSV。</p>
            )}
          </div>

          <div className="kit-summary" aria-label="制作清单汇总">
            <div>
              <span>总豆数</span>
              <strong>{pattern ? formatCount(pattern.cells.length) : "--"}</strong>
            </div>
            <div>
              <span>使用色号</span>
              <strong>{stats.length ? `${stats.length} 色` : "--"}</strong>
            </div>
            <div>
              <span>当前色卡</span>
              <strong>{paletteName}</strong>
            </div>
          </div>

          <div className="stats-list">
            {stats.length ? (
              stats.map((item) => (
                <div className="stat-row" key={item.code}>
                  <span className="swatch" style={{ background: item.color?.hex ?? "#111827" }} />
                  <strong>{item.code}</strong>
                  <small>{item.color?.name}</small>
                  <b>{item.count}</b>
                </div>
              ))
            ) : (
              <p className="muted">生成图纸后会统计每个色号的用量。</p>
            )}
          </div>

        </aside>

        <section className={`panel discover-panel mobile-panel ${activeMobilePanel === "discover" ? "mobile-panel-active" : ""}`}>
          <CommunityDiscover
            previewProject={communityPreviewProject}
            onClearPreview={() => setCommunityPreviewProjectId(null)}
            onRemix={remixCommunityPost}
          />
        </section>

        <section className={`panel projects-panel mobile-panel ${activeMobilePanel === "works" ? "mobile-panel-active" : ""}`}>
          <div className="portfolio-header">
            <div className="panel-title">
              <span>4</span>
              <div>
                <h2>我的拼豆作品</h2>
                <p>保存在当前设备，可随时恢复编辑和导出。</p>
              </div>
            </div>
            <div className="portfolio-actions">
              <label aria-disabled={!projectsReady}>
                导入备份
                <input type="file" accept=".beadproject,application/json" onChange={importProjectsBackup} disabled={!projectsReady} />
              </label>
              <button type="button" onClick={exportProjectsBackup} disabled={!projectsReady || !savedProjects.length}>备份作品</button>
              <button type="button" onClick={showSetupPanel}>添加作品</button>
            </div>
          </div>

          <p className="portfolio-notice" aria-live="polite">{portfolioNotice}</p>

          <div className="portfolio-summary" aria-label="本地作品汇总">
            <div>
              <span>作品数量</span>
              <strong>{savedProjects.length} / {MAX_SAVED_PROJECTS}</strong>
            </div>
            <div>
              <span>累计豆数</span>
              <strong>{formatCount(savedBeanTotal)} 颗</strong>
            </div>
            <div>
              <span>最近保存</span>
              <strong>
                {savedProjects[0]
                  ? new Date(savedProjects[0].savedAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })
                  : "--"}
              </strong>
            </div>
          </div>

          <div className="portfolio-library-tools">
            <input
              type="search"
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder="搜索作品名称"
              aria-label="搜索作品名称"
            />
            <select
              value={projectCategoryFilter}
              onChange={(event) => setProjectCategoryFilter(event.target.value as ProjectCategoryFilter)}
              aria-label="作品分类筛选"
            >
              <option value="全部分类">全部分类</option>
              {PROJECT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select
              value={projectSort}
              onChange={(event) => setProjectSort(event.target.value as ProjectSort)}
              aria-label="作品排序"
            >
              <option value="latest">按最近保存</option>
              <option value="name">按名称</option>
              <option value="beads">按豆数</option>
            </select>
            <small>{visibleProjects.length === savedProjects.length ? `${savedProjects.length} 个作品` : `找到 ${visibleProjects.length} 个`}</small>
          </div>

          <div className="saved-projects" aria-label="本地保存作品">
            {visibleProjects.length ? (
              visibleProjects.map((project) => (
                <article className="saved-project" key={project.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {project.thumbnail ? <img src={project.thumbnail} alt={`${project.title} 拼豆图纸缩略图`} /> : <div className="saved-thumb-placeholder" />}
                  <div className="saved-project-details">
                    {editingProjectId === project.id ? (
                      <form className="project-rename-form" onSubmit={(event) => void confirmProjectRename(event, project)}>
                        <input
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          maxLength={200}
                          aria-label="新作品名称"
                          autoFocus
                        />
                        <div>
                          <button type="submit">保存名称</button>
                          <button type="button" onClick={() => setEditingProjectId(null)}>取消</button>
                        </div>
                      </form>
                    ) : (
                      <strong>{project.title}</strong>
                    )}
                    <small>
                      {project.pattern.width} x {project.pattern.height} · {formatCount(project.pattern.cells.length)} 颗
                    </small>
                    <small>{project.palette.length} 个可用色号 · 使用 {summarizePattern(project.pattern, project.palette).length} 色</small>
                    {project.remixSource ? <small className="saved-project-origin">复刻自 {project.remixSource.author} · {project.remixSource.title}</small> : null}
                    <small>{new Date(project.savedAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}</small>
                    <select
                      className="saved-project-category"
                      value={(project.category ?? "未分类") as ProjectCategory}
                      onChange={(event) => void changeProjectCategory(project, event.target.value as ProjectCategory)}
                      aria-label={`${project.title} 分类`}
                    >
                      {PROJECT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                  <div className="saved-project-actions">
                    <button type="button" onClick={() => restoreProject(project)}>
                      打开编辑
                    </button>
                    <button type="button" onClick={() => void shareSavedProject(project)} disabled={sharingProjectId === project.id}>
                      {sharingProjectId === project.id ? "生成中" : "分享海报"}
                    </button>
                    <button type="button" onClick={() => openCommunityPreview(project)}>
                      准备发布
                    </button>
                    <button type="button" onClick={() => startProjectRename(project)}>
                      重命名
                    </button>
                    <button type="button" onClick={() => void copySavedProject(project)}>
                      复制
                    </button>
                    <button
                      type="button"
                      className={pendingDeleteProjectId === project.id ? "danger-confirm" : ""}
                      onClick={() => {
                        if (pendingDeleteProjectId === project.id) {
                          deleteSavedProject(project.id);
                        } else {
                          setPendingDeleteProjectId(project.id);
                        }
                      }}
                    >
                      {pendingDeleteProjectId === project.id ? "确认删除" : "删除"}
                    </button>
                  </div>
                </article>
              ))
            ) : savedProjects.length ? (
              <div className="portfolio-empty">
                <strong>没有找到相关作品</strong>
                <span>调整搜索内容或作品分类。</span>
                <button type="button" onClick={() => { setProjectQuery(""); setProjectCategoryFilter("全部分类"); }}>清除筛选</button>
              </div>
            ) : (
              <div className="portfolio-empty">
                <strong>还没有保存的作品</strong>
                <span>生成图纸后点击“保存”，它就会出现在这里。</span>
                <button type="button" onClick={showSetupPanel}>上传第一张图片</button>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
