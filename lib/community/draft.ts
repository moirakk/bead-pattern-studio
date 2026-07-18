import type { SavedProject } from "@/lib/projects/backup";

export type CommunityRemixPolicy = "attribution" | "view-only";

export type CommunityPublishDraft = {
  version: 1;
  projectId: string;
  title: string;
  authorName: string;
  description: string;
  category: string;
  remixPolicy: CommunityRemixPolicy;
  updatedAt: string;
};

export function makeCommunityDraftStorageKey(projectId: string) {
  return `bead-pattern-studio.community-draft.v1.${projectId}`;
}

export function createCommunityPublishDraft(
  project: SavedProject,
  fields: Pick<CommunityPublishDraft, "authorName" | "description" | "remixPolicy">,
  updatedAt = new Date().toISOString(),
): CommunityPublishDraft {
  const authorName = fields.authorName.trim();
  const description = fields.description.trim();
  if (!authorName || authorName.length > 30) throw new Error("昵称需为 1 到 30 个字符。");
  if (!description || description.length > 140) throw new Error("作品说明需为 1 到 140 个字符。");

  return {
    version: 1,
    projectId: project.id,
    title: project.title,
    authorName,
    description,
    category: project.category ?? "未分类",
    remixPolicy: fields.remixPolicy,
    updatedAt,
  };
}

export function parseCommunityPublishDraft(text: string, projectId: string): CommunityPublishDraft | null {
  try {
    const value = JSON.parse(text) as Partial<CommunityPublishDraft>;
    if (
      value.version !== 1 ||
      value.projectId !== projectId ||
      typeof value.title !== "string" || !value.title || value.title.length > 200 ||
      typeof value.authorName !== "string" || !value.authorName || value.authorName.length > 30 ||
      typeof value.description !== "string" || !value.description || value.description.length > 140 ||
      typeof value.category !== "string" || !value.category || value.category.length > 40 ||
      (value.remixPolicy !== "attribution" && value.remixPolicy !== "view-only") ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
    ) {
      return null;
    }
    return value as CommunityPublishDraft;
  } catch {
    return null;
  }
}

export function communityRemixPolicyLabel(policy: CommunityRemixPolicy) {
  return policy === "attribution" ? "允许复刻，需标注原作者" : "仅展示，不开放复刻";
}
