import type { SavedProject } from "@/lib/projects/backup";

export type ProjectSort = "latest" | "name" | "beads";

export const PROJECT_CATEGORIES = ["未分类", "人物", "动漫", "游戏", "动物", "花卉", "风景", "其他"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type ProjectCategoryFilter = "全部分类" | ProjectCategory;

export function filterAndSortProjects(
  projects: SavedProject[],
  query: string,
  sort: ProjectSort,
  category: ProjectCategoryFilter = "全部分类",
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = projects.filter((project) => {
    const matchesQuery = !normalizedQuery ||
      `${project.title} ${project.sourceName}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    const matchesCategory = category === "全部分类" || (project.category ?? "未分类") === category;
    return matchesQuery && matchesCategory;
  });

  return filtered.sort((a, b) => {
    if (sort === "name") {
      return a.title.localeCompare(b.title, "zh-CN", { numeric: true, sensitivity: "base" });
    }
    if (sort === "beads") {
      return b.pattern.cells.length - a.pattern.cells.length || Date.parse(b.savedAt) - Date.parse(a.savedAt);
    }
    return Date.parse(b.savedAt) - Date.parse(a.savedAt);
  });
}

export function setSavedProjectCategory(project: SavedProject, category: ProjectCategory): SavedProject {
  return { ...project, category };
}

export function renameSavedProject(project: SavedProject, title: string, savedAt = new Date().toISOString()) {
  const normalizedTitle = title.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!normalizedTitle) throw new Error("作品名称不能为空。");
  return { ...project, title: normalizedTitle, savedAt };
}

export function duplicateSavedProject(
  project: SavedProject,
  id: string,
  savedAt = new Date().toISOString(),
): SavedProject {
  return {
    ...project,
    id,
    title: `${project.title} 副本`.slice(0, 200),
    savedAt,
    pattern: { ...project.pattern, cells: [...project.pattern.cells] },
    palette: [...project.palette],
    settings: { ...project.settings, crop: { ...project.settings.crop } },
  };
}
