"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMUNITY_SAMPLE_POSTS,
  selectCommunityPosts,
  type CommunityPreviewPattern,
  type CommunityView,
} from "@/lib/community/feed";
import type { SavedProject } from "@/lib/projects/backup";
import { PROJECT_CATEGORIES, type ProjectCategoryFilter } from "@/lib/projects/library";

type ReactionState = { liked: string[]; saved: string[] };

const REACTIONS_KEY = "bead-pattern-studio.community-reactions.v1";

export function CommunityDiscover({ previewProject, onClearPreview }: { previewProject: SavedProject | null; onClearPreview: () => void }) {
  const [view, setView] = useState<CommunityView>("popular");
  const [category, setCategory] = useState<ProjectCategoryFilter>("全部分类");
  const [reactions, setReactions] = useState<ReactionState>({ liked: [], saved: [] });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredReactions();
      if (stored) setReactions(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const posts = useMemo(
    () => selectCommunityPosts(COMMUNITY_SAMPLE_POSTS, view, category, new Set(reactions.saved)),
    [view, category, reactions.saved],
  );

  function toggleReaction(kind: keyof ReactionState, postId: string) {
    setReactions((current) => {
      const values = new Set(current[kind]);
      if (values.has(postId)) values.delete(postId);
      else values.add(postId);
      const next = { ...current, [kind]: [...values] };
      try {
        window.localStorage.setItem(REACTIONS_KEY, JSON.stringify(next));
      } catch {
        // Keep the in-memory state when persistent storage is unavailable.
      }
      return next;
    });
  }

  const previewPattern = previewProject
    ? { width: previewProject.pattern.width, height: previewProject.pattern.height, cells: previewProject.pattern.cells.map((cell) => cell.hex) }
    : null;

  return (
    <>
      <div className="community-header">
        <div>
          <span>社区预览</span>
          <h2>发现拼豆灵感</h2>
        </div>
        <small>示例内容 · 暂未公开发布</small>
      </div>

      {previewProject && previewPattern ? (
        <section className="community-draft" aria-label="我的社区发布预览">
          <CommunityPatternCanvas pattern={previewPattern} label={`${previewProject.title} 社区预览`} />
          <div>
            <span>仅本机预览</span>
            <h3>{previewProject.title}</h3>
            <p>{previewProject.pattern.width} x {previewProject.pattern.height} · {previewProject.pattern.cells.length.toLocaleString("zh-CN")} 颗 · {previewProject.category ?? "未分类"}</p>
            <div>
              <button type="button" disabled>发布准备中</button>
              <button type="button" onClick={onClearPreview}>关闭预览</button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="community-toolbar">
        <div className="community-view-tabs" role="group" aria-label="社区作品排序">
          {([[
            "popular", "热门",
          ], ["latest", "最新"], ["saved", "已收藏"]] as [CommunityView, string][]).map(([value, label]) => (
            <button key={value} type="button" className={view === value ? "active" : ""} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
          ))}
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value as ProjectCategoryFilter)} aria-label="社区作品分类">
          <option value="全部分类">全部分类</option>
          {PROJECT_CATEGORIES.filter((item) => item !== "未分类").map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="community-grid">
        {posts.length ? posts.map((post) => {
          const liked = reactions.liked.includes(post.id);
          const saved = reactions.saved.includes(post.id);
          return (
            <article className="community-post" key={post.id}>
              <CommunityPatternCanvas pattern={post.pattern} label={`${post.title} 示例拼豆作品`} />
              <div className="community-post-body">
                <div className="community-post-meta"><span>{post.category}</span><small>{post.author}</small></div>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <div className="community-post-actions">
                  <button type="button" className={liked ? "active" : ""} aria-pressed={liked} onClick={() => toggleReaction("liked", post.id)}>喜欢 {post.likes + (liked ? 1 : 0)}</button>
                  <button type="button" className={saved ? "active" : ""} aria-pressed={saved} onClick={() => toggleReaction("saved", post.id)}>收藏 {post.saves + (saved ? 1 : 0)}</button>
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="community-empty"><strong>还没有收藏的示例作品</strong><button type="button" onClick={() => setView("popular")}>浏览热门</button></div>
        )}
      </div>
    </>
  );
}

function readStoredReactions(): ReactionState | null {
  try {
    const raw = window.localStorage.getItem(REACTIONS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ReactionState>;
    if (!Array.isArray(value.liked) || !value.liked.every((item) => typeof item === "string")) return null;
    if (!Array.isArray(value.saved) || !value.saved.every((item) => typeof item === "string")) return null;
    return { liked: value.liked, saved: value.saved };
  } catch {
    return null;
  }
}

function CommunityPatternCanvas({ pattern, label }: { pattern: CommunityPreviewPattern; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = pattern.width;
    canvas.height = pattern.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    pattern.cells.forEach((hex, index) => {
      ctx.fillStyle = hex;
      ctx.fillRect(index % pattern.width, Math.floor(index / pattern.width), 1, 1);
    });
  }, [pattern]);
  return <canvas ref={ref} className="community-pattern" aria-label={label} />;
}
