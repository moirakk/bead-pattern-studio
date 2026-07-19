import type { CommunityPost } from "@/lib/community/feed";
import type { SavedProject } from "@/lib/projects/backup";
import { hexToRgb, makeMard291Palette, nearestColor } from "@/lib/pattern";

export function createRemixedProject(
  post: CommunityPost,
  id = `remix-${post.id}-${Date.now()}`,
  savedAt = new Date().toISOString(),
): SavedProject {
  const palette = makeMard291Palette();
  if (
    !Number.isInteger(post.pattern.width) || !Number.isInteger(post.pattern.height) ||
    post.pattern.width < 1 || post.pattern.height < 1 ||
    post.pattern.cells.length !== post.pattern.width * post.pattern.height ||
    (post.pattern.codes !== undefined && post.pattern.codes.length !== post.pattern.cells.length)
  ) {
    throw new Error("社区图纸数据不完整，无法复刻。");
  }
  const colorByCode = new Map(palette.map((color) => [color.code, color]));
  const pattern = {
    width: post.pattern.width,
    height: post.pattern.height,
    cells: post.pattern.cells.map((hex, index) => {
      const source = hexToRgb(hex);
      const declaredCode = post.pattern.codes?.[index];
      const color = (declaredCode ? colorByCode.get(declaredCode) : undefined) ?? nearestColor(source, palette);
      return { code: color.code, hex: color.hex, source };
    }),
  };

  return {
    id,
    title: `${post.title} 复刻`,
    sourceName: `社区原作 · ${post.author}`,
    savedAt,
    category: post.category,
    remixSource: {
      communityPostId: post.id,
      title: post.title,
      author: post.author,
    },
    pattern,
    palette,
    settings: {
      gridWidth: pattern.width,
      gridHeight: pattern.height,
      colorLimit: new Set(pattern.cells.map((cell) => cell.code)).size,
      ditherMode: "none",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      selectedCode: pattern.cells[0]?.code ?? "H7",
      paletteName: "MARD 291 全色色卡",
      paletteSourceKind: "builtin",
    },
    thumbnail: "",
  };
}
