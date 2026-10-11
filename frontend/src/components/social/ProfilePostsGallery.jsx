import { useEffect, useRef, useState } from "react";
import { getMySocialReels, getSocialReelMedia, getSocialReelPreview, resolveApiUrl } from "../../services/api";
import "./ProfileInsights.css";

function PostTile({ post, onSelect }) {
  const tileRef = useRef(null);
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    if (!tileRef.current || !("IntersectionObserver" in window)) {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin:"240px" });
    observer.observe(tileRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const loadPreview = async () => {
      if (!nearViewport) return;
      try {
        if (post.thumbnail_url) {
          if (/^https?:\/\//i.test(post.thumbnail_url)) {
            if (!cancelled) setPreview(post.thumbnail_url);
          } else {
            const blob = await getSocialReelPreview(post.thumbnail_url);
            objectUrl = URL.createObjectURL(blob);
            if (!cancelled) setPreview(objectUrl);
          }
        } else if (post.media_type?.startsWith("image/")) {
          const blob = await getSocialReelMedia(post.id);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setPreview(objectUrl);
        } else if (post.media_type?.startsWith("video/") && !post.video_url && post.status !== "processing") {
          const blob = await getSocialReelMedia(post.id);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setPreview(objectUrl);
        } else if (post.video_url) {
          if (!cancelled) setPreview(resolveApiUrl(post.video_url));
        }
      } catch {
        if (!cancelled) setPreviewError(true);
      }
    };
    loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nearViewport, post.id, post.media_type, post.status, post.thumbnail_url, post.video_url]);

  const showVideo = post.media_type?.startsWith("video/") && !post.thumbnail_url;
  return <button ref={tileRef} className="profile-post-tile" type="button" onClick={() => onSelect(post)} aria-label={`Open post: ${post.caption || "Untitled post"}`}>
    {preview && (showVideo
      ? <video src={preview} muted playsInline preload="metadata" />
      : <img src={preview} loading="lazy" alt={post.caption || "Post preview"} />)}
    {!preview && <span className="profile-post-placeholder">{post.status === "processing" ? "Preparing video…" : previewError ? "Preview unavailable" : "Post"}</span>}
    <span className="profile-post-overlay">
      <span><b aria-hidden="true">▶</b> {post.view_count || 0}</span>
      <span><b aria-hidden="true">♥</b> {post.like_count || 0}</span>
      <span><b aria-hidden="true">▢</b> {post.comment_count || 0}</span>
    </span>
    {post.privacy === "friends" && <span className="profile-post-privacy">Friends</span>}
  </button>;
}

export default function ProfilePostsGallery({ onBack, onSelectPost }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getMySocialReels()
      .then(data => { if (active) setPosts(data); })
      .catch(err => { if (active) setError(err.message || "Unable to load your posts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="profile-insights-page" aria-labelledby="my-posts-heading">
    <header className="profile-insights-header">
      <button className="profile-insights-back" type="button" onClick={onBack} aria-label="Back to profile">←</button>
      <div><span className="profile-insights-kicker">YOUR PROFILE</span><h1 id="my-posts-heading">My Posts</h1></div>
      <span className="profile-post-total">{posts.length}</span>
    </header>
    {loading && <p className="profile-insights-state" role="status">Loading your posts…</p>}
    {error && <p className="profile-insights-error" role="alert">{error}</p>}
    {!loading && !error && posts.length === 0 && <div className="profile-insights-empty"><h2>No posts yet</h2><p>Your uploaded reels and photos will appear here.</p></div>}
    {!loading && posts.length > 0 && <div className="profile-post-grid">{posts.map(post => <PostTile key={post.id} post={post} onSelect={onSelectPost} />)}</div>}
  </section>;
}
