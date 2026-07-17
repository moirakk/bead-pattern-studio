import type { ProjectCategory } from "@/lib/projects/library";

export type CommunityView = "popular" | "latest" | "saved";

export type CommunityPreviewPattern = {
  width: number;
  height: number;
  cells: string[];
};

export type CommunityPost = {
  id: string;
  title: string;
  author: string;
  category: ProjectCategory;
  description: string;
  pattern: CommunityPreviewPattern;
  likes: number;
  saves: number;
  publishedAt: string;
};

export function selectCommunityPosts(
  posts: CommunityPost[],
  view: CommunityView,
  category: "全部分类" | ProjectCategory,
  savedIds: ReadonlySet<string>,
) {
  const filtered = posts.filter((post) =>
    (category === "全部分类" || post.category === category) &&
    (view !== "saved" || savedIds.has(post.id)),
  );
  return filtered.sort((a, b) =>
    view === "latest"
      ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
      : b.likes + b.saves * 2 - (a.likes + a.saves * 2),
  );
}

export function createPreviewPattern(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => string,
): CommunityPreviewPattern {
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, (_, index) => colorAt(index % width, Math.floor(index / width))),
  };
}

const cherryPattern = createPreviewPattern(18, 18, (x, y) => {
  if ((x === 8 || x === 9) && y >= 2 && y <= 8) return "#356f46";
  if (y >= 3 && y <= 7 && x === 10 + Math.floor((y - 3) / 2)) return "#356f46";
  const left = (x - 6) ** 2 + (y - 12) ** 2 <= 17;
  const right = (x - 12) ** 2 + (y - 11) ** 2 <= 17;
  if (left || right) return x + y < 16 ? "#ff6b63" : "#c92f45";
  return "#fff5d7";
});

const flowerPattern = createPreviewPattern(18, 18, (x, y) => {
  if ((x === 8 || x === 9) && y >= 8) return "#398a5a";
  if (y === 13 && x >= 4 && x <= 8) return "#62a96d";
  if (y === 11 && x >= 9 && x <= 14) return "#62a96d";
  const petalCenters = [[9, 4], [5, 7], [13, 7], [7, 9], [11, 9]];
  if (petalCenters.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= 5)) return "#f184b7";
  if ((x - 9) ** 2 + (y - 7) ** 2 <= 5) return "#f3c94b";
  return "#dff3f5";
});

const duckPattern = createPreviewPattern(18, 18, (x, y) => {
  if ((x - 9) ** 2 / 32 + (y - 11) ** 2 / 18 <= 1) return "#ffd84f";
  if ((x - 7) ** 2 + (y - 6) ** 2 <= 14) return "#ffe36e";
  if (x >= 10 && x <= 14 && y >= 6 && y <= 8) return "#f38b3c";
  if (x === 7 && y === 5) return "#1f2937";
  if (y >= 15 && (x + y) % 3 === 0) return "#87c8dc";
  return "#cfeaf2";
});

const mountainPattern = createPreviewPattern(18, 18, (x, y) => {
  if ((x - 14) ** 2 + (y - 4) ** 2 <= 8) return "#f4c84d";
  if (y >= 8 + Math.abs(x - 5) / 2) return x < 10 ? "#547e78" : "#426968";
  if (y >= 12 + Math.abs(x - 13) / 2) return "#355757";
  if (y >= 15) return "#8db36d";
  return "#bfe1e7";
});

export const COMMUNITY_SAMPLE_POSTS: CommunityPost[] = [
  {
    id: "sample-cherry",
    title: "樱桃杯垫",
    author: "社区示例",
    category: "花卉",
    description: "18 x 18 小尺寸配色练习",
    pattern: cherryPattern,
    likes: 128,
    saves: 46,
    publishedAt: "2026-07-16T08:00:00.000Z",
  },
  {
    id: "sample-flower",
    title: "粉色小花",
    author: "社区示例",
    category: "花卉",
    description: "适合胸针和冰箱贴",
    pattern: flowerPattern,
    likes: 96,
    saves: 38,
    publishedAt: "2026-07-17T03:30:00.000Z",
  },
  {
    id: "sample-duck",
    title: "池塘小鸭",
    author: "社区示例",
    category: "动物",
    description: "低色数迷你豆图案",
    pattern: duckPattern,
    likes: 174,
    saves: 62,
    publishedAt: "2026-07-15T11:00:00.000Z",
  },
  {
    id: "sample-mountain",
    title: "日落山野",
    author: "社区示例",
    category: "风景",
    description: "自然色系方形挂画",
    pattern: mountainPattern,
    likes: 82,
    saves: 31,
    publishedAt: "2026-07-17T06:45:00.000Z",
  },
];
