"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CommunityPublishDraftCard } from "@/app/CommunityPublishDraft";
import {
  COMMUNITY_SAMPLE_POSTS,
  countPreviewPatternColors,
  selectCommunityPosts,
  summarizePreviewPatternColors,
  type CommunityPost,
  type CommunityPreviewPattern,
  type CommunityView,
} from "@/lib/community/feed";
import type { SavedProject } from "@/lib/projects/backup";
import { PROJECT_CATEGORIES, type ProjectCategoryFilter } from "@/lib/projects/library";

type ReactionState = { liked: string[]; saved: string[] };

type CommunityDiscoverProps = {
  previewProject: SavedProject | null;
  onClearPreview: () => void;
  onRemix: (post: CommunityPost) => Promise<void>;
};

const REACTIONS_KEY = "bead-pattern-studio.community-reactions.v1";

export function CommunityDiscover({ previewProject, onClearPreview, onRemix }: CommunityDiscoverProps) {
  const [view, setView] = useState<CommunityView>("popular");
  const [category, setCategory] = useState<ProjectCategoryFilter>("全部分类");
  const [reactions, setReactions] = useState<ReactionState>({ liked: [], saved: [] });
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [remixingPostId, setRemixingPostId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

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
  const selectedPost = selectedPostId
    ? COMMUNITY_SAMPLE_POSTS.find((post) => post.id === selectedPostId) ?? null
    : null;

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

  async function remixPost(post: CommunityPost) {
    setRemixingPostId(post.id);
    setNotice("");
    try {
      await onRemix(post);
      setNotice(`已将「${post.title}」复刻到我的作品，可继续改色和编辑。`);
    } catch {
      setNotice("复刻保存失败，请检查设备存储空间后重试。");
    } finally {
      setRemixingPostId(null);
    }
  }

  const previewPattern = previewProject
    ? { width: previewProject.pattern.width, height: previewProject.pattern.height, cells: previewProject.pattern.cells.map((cell) => cell.hex) }
    : null;

  if (selectedPost) {
    const liked = reactions.liked.includes(selectedPost.id);
    const saved = reactions.saved.includes(selectedPost.id);
    const colorUsage = summarizePreviewPatternColors(selectedPost.pattern);
    return (
      <div className="community-detail">
        <button type="button" className="community-back" onClick={() => { setSelectedPostId(null); setNotice(""); }} aria-label="返回社区作品列表">
          <span aria-hidden="true">←</span> 返回发现
        </button>

        <div className="community-detail-heading">
          <div>
            <span>{selectedPost.category}</span>
            <h2>{selectedPost.title}</h2>
            <p>原作：{selectedPost.author}</p>
          </div>
          <small>社区示例</small>
        </div>

        <CommunityPatternCanvas pattern={selectedPost.pattern} label={`${selectedPost.title} 拼豆图纸`} className="community-pattern-detail" />

        <div className="community-detail-actions">
          <button type="button" className={saved ? "active" : ""} aria-pressed={saved} onClick={() => toggleReaction("saved", selectedPost.id)}>
            {saved ? "已收藏" : "收藏图纸"}
          </button>
          <button type="button" className="primary" onClick={() => void remixPost(selectedPost)} disabled={remixingPostId === selectedPost.id}>
            {remixingPostId === selectedPost.id ? "正在复刻" : "复刻到我的作品"}
          </button>
        </div>
        {notice ? <p className="community-notice" role="status">{notice}</p> : null}

        <div className="community-detail-stats" aria-label="作品信息">
          <div><span>尺寸</span><strong>{selectedPost.pattern.width} x {selectedPost.pattern.height}</strong></div>
          <div><span>豆数</span><strong>{selectedPost.pattern.cells.length.toLocaleString("zh-CN")}</strong></div>
          <div><span>颜色</span><strong>{countPreviewPatternColors(selectedPost.pattern)} 色</strong></div>
          <div><span>复刻</span><strong>{selectedPost.remixes} 次</strong></div>
        </div>

        <section className="community-about">
          <div className="community-section-title">
            <h3>作品说明</h3>
            <button type="button" className={liked ? "active" : ""} aria-pressed={liked} onClick={() => toggleReaction("liked", selectedPost.id)}>
              {liked ? "已喜欢" : `喜欢 ${selectedPost.likes}`}
            </button>
          </div>
          <p>{selectedPost.description}</p>
          <dl>
            <div><dt>使用色卡</dt><dd>{selectedPost.paletteName}</dd></div>
            <div><dt>复刻说明</dt><dd>{selectedPost.remixLicense}</dd></div>
          </dl>
        </section>

        <section className="community-colors">
          <div className="community-section-title">
            <h3>色号清单</h3>
            <small>{colorUsage.length} 色 · 按色号排序</small>
          </div>
          <div className="community-color-list">
            {colorUsage.map((item) => (
              <div key={item.code}>
                <span className="community-color-swatch" style={{ background: item.hex }} />
                <strong>{item.code}</strong>
                <small>{item.name}</small>
                <b>{item.count} 颗</b>
              </div>
            ))}
          </div>
        </section>

        <section className="community-updates">
          <h3>最近更新</h3>
          <div>
            {selectedPost.updates.map((update) => (
              <article key={update.id}>
                <span aria-hidden="true" />
                <div><strong>{update.message}</strong><small>{formatShortDate(update.publishedAt)}</small></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

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
        <CommunityPublishDraftCard
          project={previewProject}
          pattern={previewPattern}
          onClear={onClearPreview}
          renderPattern={(targetPattern, label) => <CommunityPatternCanvas pattern={targetPattern} label={label} />}
        />
      ) : null}

      <div className="community-toolbar">
        <div className="community-view-tabs" role="group" aria-label="社区作品排序">
          {([["popular", "热门"], ["latest", "最新"], ["saved", "已收藏"]] as [CommunityView, string][]).map(([value, label]) => (
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
              <button type="button" className="community-preview-button" onClick={() => setSelectedPostId(post.id)} aria-label={`查看${post.title}图纸详情`}>
                <CommunityPatternCanvas pattern={post.pattern} label={`${post.title} 示例拼豆作品`} />
              </button>
              <div className="community-post-body">
                <div className="community-post-meta"><span>{post.category}</span><small>{post.author}</small></div>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <button type="button" className="community-post-open" onClick={() => setSelectedPostId(post.id)}>查看图纸 · 可复刻</button>
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

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
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

function CommunityPatternCanvas({ pattern, label, className = "" }: { pattern: CommunityPreviewPattern; label: string; className?: string }) {
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
  return <canvas ref={ref} className={`community-pattern ${className}`.trim()} aria-label={label} />;
}
