import type { SavedProject } from "@/lib/projects/backup";

export type ProjectSort = "latest" | "name" | "beads";

export function filterAndSortProjects(projects: SavedProject[], query: string, sort: ProjectSort) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = normalizedQuery
    ? projects.filter((project) =>
        `${project.title} ${project.sourceName}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
      )
    : [...projects];

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
