"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  communityRemixPolicyLabel,
  createCommunityPublishDraft,
  makeCommunityDraftStorageKey,
  parseCommunityPublishDraft,
  type CommunityPublishDraft,
  type CommunityRemixPolicy,
} from "@/lib/community/draft";
import type { CommunityPreviewPattern } from "@/lib/community/feed";
import type { SavedProject } from "@/lib/projects/backup";

type CommunityPublishDraftProps = {
  project: SavedProject;
  pattern: CommunityPreviewPattern;
  onClear: () => void;
  renderPattern: (pattern: CommunityPreviewPattern, label: string) => React.ReactNode;
};

export function CommunityPublishDraftCard({ project, pattern, onClear, renderPattern }: CommunityPublishDraftProps) {
  const [authorName, setAuthorName] = useState("");
  const [description, setDescription] = useState("");
  const [remixPolicy, setRemixPolicy] = useState<CommunityRemixPolicy>("attribution");
  const [savedDraft, setSavedDraft] = useState<CommunityPublishDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(makeCommunityDraftStorageKey(project.id));
        if (!raw) return;
        const stored = parseCommunityPublishDraft(raw, project.id);
        if (!stored) return;
        setSavedDraft(stored);
        setAuthorName(stored.authorName);
        setDescription(stored.description);
        setRemixPolicy(stored.remixPolicy);
      } catch {
        // Start with an empty form when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [project.id]);

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const draft = createCommunityPublishDraft(project, { authorName, description, remixPolicy });
      window.localStorage.setItem(makeCommunityDraftStorageKey(project.id), JSON.stringify(draft));
      setSavedDraft(draft);
      setEditing(false);
      setNotice("发布草稿已保存在当前设备。");
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "发布草稿保存失败。");
    }
  }

  return (
    <section className="community-draft" aria-label="我的社区发布草稿">
      {renderPattern(pattern, `${project.title} 社区预览`)}
      <div className="community-draft-overview">
        <span>{savedDraft ? "发布草稿" : "仅本机预览"}</span>
        <h3>{project.title}</h3>
        <p>{project.pattern.width} x {project.pattern.height} · {project.pattern.cells.length.toLocaleString("zh-CN")} 颗 · {project.category ?? "未分类"}</p>
        <div>
          <button type="button" onClick={() => { setEditing((current) => !current); setNotice(""); }}>
            {editing ? "收起资料" : savedDraft ? "编辑发布资料" : "完善发布资料"}
          </button>
          <button type="button" onClick={onClear}>关闭预览</button>
        </div>
      </div>

      {savedDraft && !editing ? (
        <dl className="community-draft-summary">
          <div><dt>创作者</dt><dd>{savedDraft.authorName}</dd></div>
          <div><dt>作品说明</dt><dd>{savedDraft.description}</dd></div>
          <div><dt>复刻权限</dt><dd>{communityRemixPolicyLabel(savedDraft.remixPolicy)}</dd></div>
        </dl>
      ) : null}

      {editing ? (
        <form className="community-draft-editor" onSubmit={saveDraft}>
          <label>
            <span>创作者昵称</span>
            <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={30} required placeholder="你的社区昵称" />
          </label>
          <label>
            <span>作品说明</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={140} required placeholder="介绍作品、用途或制作提示" />
            <small>{description.length}/140</small>
          </label>
          <fieldset>
            <legend>复刻权限</legend>
            <div className="community-policy-toggle">
              {([[
                "attribution", "允许复刻",
              ], ["view-only", "仅展示"]] as [CommunityRemixPolicy, string][]).map(([value, label]) => (
                <button type="button" key={value} className={remixPolicy === value ? "active" : ""} aria-pressed={remixPolicy === value} onClick={() => setRemixPolicy(value)}>{label}</button>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="community-save-draft">保存发布草稿</button>
        </form>
      ) : null}

      {notice ? <p className="community-draft-notice" role="status">{notice}</p> : null}
    </section>
  );
}
