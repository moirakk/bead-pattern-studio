import type { CommunityPost } from "@/lib/community/feed";
import type { SavedProject } from "@/lib/projects/backup";
import { buildPattern, hexToRgb, makeMard221Palette } from "@/lib/pattern";

export function createRemixedProject(
  post: CommunityPost,
  id = `remix-${post.id}-${Date.now()}`,
  savedAt = new Date().toISOString(),
): SavedProject {
  const palette = makeMard221Palette();
  const pattern = buildPattern(
    post.pattern.cells.map(hexToRgb),
    post.pattern.width,
    post.pattern.height,
    palette,
    Math.min(48, palette.length),
  );

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
      paletteName: "MARD 221 标准色卡",
      paletteSourceKind: "builtin",
    },
    thumbnail: "",
  };
}
