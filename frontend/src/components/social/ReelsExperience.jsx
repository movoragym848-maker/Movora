import { useEffect, useRef, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { addSocialReelComment, createSocialReelFromUpload, getSocialConversations, getSocialReel, getSocialReelComments, getSocialReelMedia, getSocialReelUploadUrl, getSocialReelUploadLimits, getSocialReels, recordSocialReelEvent, resolveApiUrl, sendSocialMessage, setSocialReelCommentPinned, toggleSocialReelLike, uploadReelObject, uploadSocialReel } from "../../services/api";
const likeAnimationUrl = `${import.meta.env.BASE_URL}like.lottie`;
import "./ReelsExperience.css";

const FEED_VIEW = "FEED_VIEW";
const CAMERA_VIEW = "CAMERA_VIEW";
const POST_DETAILS_VIEW = "POST_DETAILS_VIEW";
const MAX_RECORDING_SECONDS = 30;
const DEFAULT_MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const RECORDING_SIZE_HEADROOM_BYTES = 1024 * 1024;
const filters = [
  { id: "original", label: "Original", css: "none" },
  { id: "warm", label: "Warm", css: "sepia(.22) saturate(1.2)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.08)" },
  { id: "mono", label: "Mono", css: "grayscale(1)" },
];

function initials(name = "Movora") {
  return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function ReelIcon({ type, filled = false }) {
  if (type === "heart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 4.2-8.8 10.1-8.8 10.1S3.2 12.9 3.2 8.7a4.4 4.4 0 0 1 8.8-.2 4.4 4.4 0 0 1 8.8.2Z" fill={filled ? "currentColor" : "none"} /></svg>;
  if (type === "comment") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.3a8 8 0 0 1-8.2 7.7 9 9 0 0 1-3.2-.6L4 20l1.2-3.8a7.4 7.4 0 0 1-1.5-4.5A8 8 0 0 1 12 4a8 8 0 0 1 8 7.3Z" fill="none" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" /></svg>;
}

function ReelCard({ reel, feedIndex, active, preload, onLike, onComments, onShare }) {
  const [source, setSource] = useState(reel.video_url || "");
  const [mediaError, setMediaError] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [likeAnimationKey, setLikeAnimationKey] = useState(0);
  const videoRef = useRef(null);
  const mediaUrlRef = useRef("");
  const activeRef = useRef(active);
  const likeAnimationTimerRef = useRef(null);
  const videoClickTimerRef = useRef(null);
  const watchSampleRef = useRef({ currentTime:0, sentAt:0 });
  const shouldMountMedia = active || preload;
  activeRef.current = active;

  useEffect(() => {
    if (active) recordSocialReelEvent(reel.id, { eventType:"impression" }).catch(() => {});
  }, [active, reel.id]);

  const handleWatchTime = event => {
    const video = event.currentTarget;
    const now = Date.now();
    const previous = watchSampleRef.current;
    if (!previous.sentAt) {
      watchSampleRef.current = { currentTime:video.currentTime, sentAt:now };
      return;
    }
    if (now - previous.sentAt < 5000) return;
    const watchMs = Math.max(0, Math.min(30000, Math.round((video.currentTime - previous.currentTime) * 1000)));
    const progressPct = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(100, Math.round(video.currentTime / video.duration * 100)) : 0;
    watchSampleRef.current = { currentTime:video.currentTime, sentAt:now };
    if (watchMs) recordSocialReelEvent(reel.id, { eventType:"watch", watchMs, progressPct }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setMediaError(false);
    if (reel.status === "processing" || reel.status === "failed") {
      setSource("");
      return undefined;
    }
    if (reel.video_hls_url) {
      setSource(resolveApiUrl(reel.video_hls_url));
      return undefined;
    }
    if (!reel.media_type) {
      setSource(reel.video_url || "");
      return undefined;
    }
    if (mediaUrlRef.current) {
      setSource(mediaUrlRef.current);
      return undefined;
    }
    if (!active && !preload) return undefined;
    setSource("");
    getSocialReelMedia(reel.id).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      mediaUrlRef.current = objectUrl;
      setSource(objectUrl);
    }).catch(() => { if (!cancelled) setMediaError(true); });
    return () => {
      cancelled = true;
    };
  }, [active, preload, reel.id, reel.media_type, reel.status, reel.video_hls_url, reel.video_url]);

  useEffect(() => () => {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source || !shouldMountMedia) return undefined;
    let cancelled = false;
    let hls;
    const attachStream = async () => {
      if (!source.includes(".m3u8")) {
        video.load();
        return;
      }
      const { default:Hls } = await import("hls.js");
      if (cancelled) return;
      let token = "";
      try { token = JSON.parse(localStorage.getItem("rs_session") || "null")?.accessToken || ""; }
      catch { token = ""; }
      const apiOrigin = new URL(resolveApiUrl("/"), window.location.href).origin;
      const playlistOrigin = new URL(source, window.location.href).origin;
      if (Hls.isSupported()) {
        hls = new Hls({
          startLevel:0,
          capLevelToPlayerSize:true,
          maxBufferLength:12,
          maxMaxBufferLength:24,
          xhrSetup(xhr) {
            if (token && playlistOrigin === apiOrigin) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        });
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (activeRef.current) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setMediaError(true);
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source;
        video.load();
        if (activeRef.current) video.play().catch(() => {});
      } else {
        setMediaError(true);
      }
    };
    attachStream().catch(() => { if (!cancelled) setMediaError(true); });
    return () => {
      cancelled = true;
      video.pause();
      hls?.destroy();
    };
  }, [shouldMountMedia, source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => {});
    else video.pause();
  }, [active, shouldMountMedia, source]);

  useEffect(() => () => {
    if (likeAnimationTimerRef.current) window.clearTimeout(likeAnimationTimerRef.current);
    if (videoClickTimerRef.current) window.clearTimeout(videoClickTimerRef.current);
  }, []);

  const playLikeAnimation = () => {
    setLikeAnimationKey(key => key + 1);
    setShowLikeAnimation(true);
    if (likeAnimationTimerRef.current) window.clearTimeout(likeAnimationTimerRef.current);
    likeAnimationTimerRef.current = window.setTimeout(() => setShowLikeAnimation(false), 1400);
  };

  const toggleVideoPlayback = event => {
    const video = event.currentTarget;
    if (videoClickTimerRef.current) window.clearTimeout(videoClickTimerRef.current);
    videoClickTimerRef.current = window.setTimeout(() => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
      videoClickTimerRef.current = null;
    }, 250);
  };

  const likeWithAnimation = event => {
    if (event.target.closest("button")) return;
    if (videoClickTimerRef.current) {
      window.clearTimeout(videoClickTimerRef.current);
      videoClickTimerRef.current = null;
    }
    if (!reel.liked) {
      playLikeAnimation();
      onLike(reel);
    }
  };

  const likeFromButton = () => {
    if (!reel.liked) playLikeAnimation();
    onLike(reel);
  };

  const isImage = reel.media_type?.startsWith("image/");
  return <article className="reel-page" data-reel-id={reel.feedKey} data-feed-index={feedIndex} onDoubleClick={likeWithAnimation}>
    {shouldMountMedia && source && (isImage
      ? <img className="reel-media" src={source} alt="" />
      : <video ref={videoRef} className="reel-media" src={source.includes(".m3u8") ? undefined : source} poster={reel.thumbnail_url ? resolveApiUrl(reel.thumbnail_url) : undefined} playsInline loop muted preload={active ? "auto" : "metadata"} onClick={toggleVideoPlayback} onTimeUpdate={handleWatchTime} />)}
    {mediaError && <div className="reel-media-error">This post could not be loaded.</div>}
    {reel.status === "processing" && <div className="reel-processing-status" role="status"><span className="reel-processing-spinner"/>Preparing HD video...</div>}
    {reel.status === "failed" && <div className="reel-processing-status" role="status">Video processing failed.</div>}
    <div className="reel-shade" />
    {showLikeAnimation && <div className="reel-like-burst" aria-hidden="true"><DotLottieReact key={likeAnimationKey} src={likeAnimationUrl} autoplay loop={false} /></div>}
    <div className="reel-author"><span className="reel-avatar">{initials(reel.display_name)}</span><strong>{reel.display_name}</strong><span>@{reel.username}</span></div>
    <div className="reel-actions">
      <button type="button" className={`reel-action${reel.liked ? " is-liked" : ""}`} onClick={likeFromButton} aria-label={reel.liked ? "Unlike reel" : "Like reel"} aria-pressed={Boolean(reel.liked)}><ReelIcon type="heart" filled={reel.liked}/><span>{reel.like_count || 0}</span></button>
      <button type="button" className="reel-action" onClick={() => onComments(reel)} aria-label="Open comments"><ReelIcon type="comment"/><span>{reel.comment_count || 0}</span></button>
      <button type="button" className="reel-action" onClick={() => onShare(reel)} aria-label="Share reel"><ReelIcon type="share"/><span>Share</span></button>
    </div>
    <div className="reel-caption">
      {reel.caption && <p>{reel.caption}</p>}
      {(reel.workout_tag || reel.location) && <div className="reel-tags">{reel.workout_tag && <span>#{reel.workout_tag}</span>}{reel.location && <span>{reel.location}</span>}</div>}
    </div>
  </article>;
}

function CommentsSheet({ reel, onClose, onCommentAdded }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [pinningId, setPinningId] = useState("");
  const [error, setError] = useState("");
  const commentsEndRef = useRef(null);

  const commentTree = (() => {
    const byId = new Map(comments.map(comment => [comment.id, { ...comment, replies:[] }]));
    const roots = [];
    byId.forEach(comment => {
      const parent = comment.parent_comment_id && byId.get(comment.parent_comment_id);
      if (parent) parent.replies.push(comment);
      else roots.push(comment);
    });
    const threadIsPinned = comment => comment.is_pinned || comment.replies.some(threadIsPinned);
    const sortThread = comment => {
      comment.replies.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(a.created_at) - new Date(b.created_at));
      comment.replies.forEach(sortThread);
    };
    roots.sort((a, b) => Number(threadIsPinned(b)) - Number(threadIsPinned(a)) || new Date(a.created_at) - new Date(b.created_at));
    roots.forEach(sortThread);
    return roots;
  })();

  useEffect(() => {
    let mounted = true;
    getSocialReelComments(reel.id).then(data => { if (mounted) setComments(data); }).catch(err => { if (mounted) setError(err.message); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [reel.id]);

  const submit = async event => {
    event.preventDefault();
    if (!draft.trim() || posting) return;
    setPosting(true);
    setError("");
    try {
      const comment = await addSocialReelComment(reel.id, draft.trim(), replyingTo?.id);
      setComments(current => [...current, comment]);
      setDraft("");
      setReplyingTo(null);
      onCommentAdded();
      requestAnimationFrame(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) { setError(err.message || "Unable to add comment."); }
    finally { setPosting(false); }
  };

  const togglePinned = async comment => {
    setPinningId(comment.id);
    setError("");
    try {
      const pinned = !comment.is_pinned;
      await setSocialReelCommentPinned(reel.id, comment.id, pinned);
      setComments(current => current.map(item => ({ ...item, is_pinned:pinned && item.id === comment.id })));
    } catch (err) { setError(err.message || "Unable to update pinned comment."); }
    finally { setPinningId(""); }
  };

  const renderComment = comment => <div className="reel-comment-thread" key={comment.id}>
    <div className={`reel-comment${comment.is_pinned ? " is-pinned" : ""}`}>
      <span className="reel-comment-avatar">{initials(comment.display_name)}</span>
      <div className="reel-comment-content">
        <div className="reel-comment-heading"><strong>{comment.display_name}</strong>{comment.is_pinned && <span className="reel-comment-pinned">Pinned</span>}</div>
        <p>{comment.body}</p>
        <div className="reel-comment-tools">
          <button type="button" onClick={() => { setReplyingTo(comment); setDraft(""); }}>Reply</button>
          {comment.can_manage && <button type="button" disabled={Boolean(pinningId)} onClick={() => togglePinned(comment)}>{pinningId === comment.id ? "…" : comment.is_pinned ? "Unpin" : "Pin"}</button>}
        </div>
      </div>
    </div>
    {comment.replies.length > 0 && <div className="reel-comment-replies">{comment.replies.map(renderComment)}</div>}
  </div>;

  return <div className="reel-sheet-backdrop" onClick={onClose}>
    <section className="reel-comments-sheet" role="dialog" aria-modal="true" aria-label="Comments" onClick={event => event.stopPropagation()}>
      <div className="reel-sheet-grip" />
      <header><strong>Comments</strong><button type="button" onClick={onClose} aria-label="Close comments">×</button></header>
      <div className="reel-comments-list">
        {loading && <p className="reel-comments-empty">Loading comments...</p>}
        {!loading && comments.length === 0 && <p className="reel-comments-empty">Start the conversation.</p>}
        {commentTree.map(renderComment)}
        <div ref={commentsEndRef} />
      </div>
      {error && <p className="reel-form-error" role="alert">{error}</p>}
      {replyingTo && <div className="reel-replying-to"><span>Replying to {replyingTo.display_name}</span><button type="button" onClick={() => { setReplyingTo(null); setDraft(""); }} aria-label="Cancel reply">×</button></div>}
      <form className="reel-comment-form" onSubmit={submit}><input value={draft} onChange={event => setDraft(event.target.value.slice(0, 500))} maxLength={500} placeholder={replyingTo ? `Reply to ${replyingTo.display_name}...` : "Add a comment..."} aria-label={replyingTo ? `Reply to ${replyingTo.display_name}` : "Add a comment"}/><button type="submit" disabled={posting || !draft.trim()}>{posting ? "..." : replyingTo ? "Reply" : "Post"}</button></form>
    </section>
  </div>;
}

function ShareSheet({ reel, shareUrl, onClose }) {
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [sendingUserId, setSendingUserId] = useState("");
  const [sentUserIds, setSentUserIds] = useState(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const canShareLink = Boolean(shareUrl);

  useEffect(() => {
    let mounted = true;
    getSocialConversations().then(data => { if (mounted) setFriends(data); }).catch(err => { if (mounted) setError(err.message || "Unable to load friends."); }).finally(() => { if (mounted) setLoadingFriends(false); });
    return () => { mounted = false; };
  }, []);

  const shareOnWhatsApp = () => {
    const message = ["A reel from Movora", reel.caption, shareUrl].filter(Boolean).join("\n");
    recordSocialReelEvent(reel.id, { eventType:"share" }).catch(() => {});
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("Post link copied.");
      setError("");
      recordSocialReelEvent(reel.id, { eventType:"share" }).catch(() => {});
    } catch {
      setError("Clipboard access is unavailable. Copy the link from your browser address bar.");
    }
  };

  const sendToFriend = async friend => {
    if (sendingUserId) return;
    setSendingUserId(friend.user_id);
    setError("");
    try {
      const message = [reel.caption || "Check out this Movora post", shareUrl].join("\n");
      await sendSocialMessage(friend.user_id, message);
      await recordSocialReelEvent(reel.id, { eventType:"share" }).catch(() => {});
      setSentUserIds(current => new Set(current).add(friend.user_id));
    } catch (err) { setError(err.message || "Unable to share with this friend."); }
    finally { setSendingUserId(""); }
  };

  return <div className="reel-sheet-backdrop" onClick={onClose}>
    <section className="reel-share-sheet" role="dialog" aria-modal="true" aria-label="Share post" onClick={event => event.stopPropagation()}>
      <div className="reel-sheet-grip" />
      <header><strong>Share post</strong><button type="button" onClick={onClose} aria-label="Close share options">×</button></header>
      <div className="reel-share-actions">
        <button type="button" onClick={shareOnWhatsApp} disabled={!canShareLink}><span className="share-action-icon whatsapp-share-icon">◉</span><span>WhatsApp</span></button>
        <button type="button" onClick={copyLink} disabled={!canShareLink}><span className="share-action-icon">↗</span><span>Copy link</span></button>
      </div>
      {!canShareLink && <p className="share-needs-url">Set VITE_APP_URL to Movora's public website URL. Localhost links cannot be shared.</p>}
      {feedback && <p className="share-feedback" role="status">{feedback}</p>}
      <div className="share-friends-heading"><strong>Send to a friend</strong><span>{friends.length}</span></div>
      <div className="share-friends-list">
        {loadingFriends && <p className="share-empty">Loading friends...</p>}
        {!loadingFriends && friends.length === 0 && <p className="share-empty">Accepted friends will appear here.</p>}
        {friends.map(friend => <div className="share-friend" key={friend.user_id}><span className="share-friend-avatar">{initials(friend.display_name)}</span><span className="share-friend-name">{friend.display_name}</span><button type="button" disabled={!canShareLink || sendingUserId === friend.user_id || sentUserIds.has(friend.user_id)} onClick={() => sendToFriend(friend)}>{sentUserIds.has(friend.user_id) ? "Sent" : sendingUserId === friend.user_id ? "Sending..." : "Send"}</button></div>)}
      </div>
      {error && <p className="share-error" role="alert">{error}</p>}
    </section>
  </div>;
}

export default function ReelsExperience({ onExit }) {
  const [view, setView] = useState(FEED_VIEW);
  const [reels, setReels] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [activeReelKey, setActiveReelKey] = useState(null);
  const [commentsReel, setCommentsReel] = useState(null);
  const [sharingReel, setSharingReel] = useState(null);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [cameraSwitching, setCameraSwitching] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("original");
  const [capturedMedia, setCapturedMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [maxVideoBytes, setMaxVideoBytes] = useState(DEFAULT_MAX_VIDEO_BYTES);
  const [uploadLimitReady, setUploadLimitReady] = useState(false);
  const [caption, setCaption] = useState("");
  const [workoutTag, setWorkoutTag] = useState("");
  const [location, setLocation] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const feedRef = useRef(null);
  const loadMoreRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraFacingRef = useRef(cameraFacing);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const recordedBytesRef = useRef(0);
  const holdTimerRef = useRef(null);
  const maxRecordTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const recordingStartRef = useRef(0);
  const recordingCleanupRef = useRef(null);
  const recordingStartedRef = useRef(false);
  const loadingRef = useRef(false);
  const nextFeedKeyRef = useRef(0);
  const previewUrlRef = useRef("");

  const currentFilter = filters.find(filter => filter.id === selectedFilter) || filters[0];
  const recordingProgress = Math.min(100, maxVideoBytes > 0 ? recordedBytes / maxVideoBytes * 100 : 0);
  const uploadLimitMegabytes = Math.round(maxVideoBytes / (1024 * 1024));

  useEffect(() => {
    if (view !== CAMERA_VIEW) return undefined;
    let active = true;
    setUploadLimitReady(false);
    getSocialReelUploadLimits()
      .then(limits => {
        if (active && Number.isSafeInteger(limits.maxVideoBytes) && limits.maxVideoBytes > 0) setMaxVideoBytes(limits.maxVideoBytes);
      })
      .catch(() => {})
      .finally(() => { if (active) setUploadLimitReady(true); });
    return () => { active = false; };
  }, [view]);

  const loadPage = async nextCursor => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    setFeedError("");
    try {
      const sharedReelId = new URLSearchParams(window.location.search).get("reel");
      if (!nextCursor && sharedReelId) {
        const sharedReel = await getSocialReel(sharedReelId);
        const data = await getSocialReels();
        const items = [sharedReel, ...data.items.filter(item => item.id !== sharedReel.id)]
          .map(reel => ({ ...reel, feedKey:`${reel.id}:${nextFeedKeyRef.current++}` }));
        setReels(items);
        setCursor(data.nextCursor);
        setActiveReelKey(null);
        requestAnimationFrame(() => feedRef.current?.scrollTo({ top:0, behavior:"instant" }));
        return;
      }
      const data = await getSocialReels(nextCursor);
      const items = data.items.map(reel => ({ ...reel, feedKey:`${reel.id}:${nextFeedKeyRef.current++}` }));
      setReels(current => nextCursor ? [...current, ...items] : items);
      setCursor(data.nextCursor);
      if (!nextCursor && items[0]) setActiveReelKey(items[0].feedKey);
    } catch (err) {
      const sharedReelId = new URLSearchParams(window.location.search).get("reel");
      if (!nextCursor && sharedReelId) setReels([]);
      if (sharedReelId && err.status === 404) {
        setFeedError("This Reel link was not found. Check the link and make sure the latest Movora backend is deployed.");
      } else {
        setFeedError(err.message || "Unable to load reels.");
      }
    }
    finally { setLoading(false); setLoadingMore(false); loadingRef.current = false; }
  };

  useEffect(() => { loadPage(null); }, []);

  const pendingReelIds = reels.filter(reel => reel.status === "processing").map(reel => reel.id).join(",");
  useEffect(() => {
    const reelIds = pendingReelIds ? pendingReelIds.split(",") : [];
    if (!reelIds.length) return undefined;
    let mounted = true;
    const refreshStatuses = async () => {
      const updates = await Promise.all(reelIds.map(reelId => getSocialReel(reelId).catch(() => null)));
      if (!mounted) return;
      const latestById = new Map(updates.filter(Boolean).map(reel => [reel.id, reel]));
      setReels(current => current.map(reel => latestById.get(reel.id) || reel));
    };
    const timer = window.setInterval(refreshStatuses, 3000);
    refreshStatuses();
    return () => { mounted = false; window.clearInterval(timer); };
  }, [pendingReelIds]);

  useEffect(() => {
    const root = feedRef.current;
    if (view !== FEED_VIEW || !root || !cursor || reels.length < 3) return undefined;
    const fetchTarget = root.querySelector(`[data-feed-index="${Math.max(0, reels.length - 3)}"]`);
    if (!fetchTarget) return undefined;
    // Fetch while two full-screen items remain, so the next batch is ready before the user reaches the end.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !loadingRef.current) loadPage(cursor);
    }, { root, threshold:0.1 });
    observer.observe(fetchTarget);
    return () => observer.disconnect();
  }, [cursor, loadingMore, reels.length, view]);

  useEffect(() => {
    const root = feedRef.current;
    if (view !== FEED_VIEW || !root) return undefined;
    const visibility = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visibility.set(entry.target, entry.intersectionRatio));
      const current = [...visibility.entries()].sort((a, b) => b[1] - a[1])[0];
      setActiveReelKey(current?.[1] >= 0.8 ? current[0].dataset.reelId : null);
    }, { root, threshold:[0, 0.8] });
    root.querySelectorAll("[data-reel-id]").forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [reels, view]);

  useEffect(() => {
    if (view !== CAMERA_VIEW) return undefined;
    let cancelled = false;
    let stream = null;
    setCameraReady(false);
    setCameraError("");
    const openCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is unavailable here. Choose a photo or video from your library instead.");
        return;
      }
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:cameraFacingRef.current } }, audio:true });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:cameraFacingRef.current } }, audio:false });
        }
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (error) {
        setCameraError(error.name === "NotAllowedError" ? "Allow camera access to capture a post." : error.message || "Unable to open the camera. Choose media from your library instead.");
      }
    };
    openCamera();
    return () => {
      cancelled = true;
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      if (maxRecordTimerRef.current) window.clearTimeout(maxRecordTimerRef.current);
      if (durationTimerRef.current) window.clearInterval(durationTimerRef.current);
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      recordingCleanupRef.current?.();
      recordingCleanupRef.current = null;
      (stream || cameraStreamRef.current)?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    };
  }, [view]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const setCapture = blob => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(blob);
    setPreviewUrl(previewUrlRef.current);
    setCapturedMedia(blob);
    setCameraError("");
  };

  const capturePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("The camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.filter = currentFilter.css;
    if (cameraFacing === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) setCapture(blob);
      else setCameraError("Unable to capture this photo.");
    }, "image/jpeg", 0.88);
  };

  const startRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream || !window.MediaRecorder) {
      setCameraError("Video recording is not supported on this device. Tap the shutter to take a photo.");
      return false;
    }
    let recordingStream = stream;
    let releaseRecordingStream = () => {};
    try {
      const previewVideo = cameraVideoRef.current;
      const canvas = document.createElement("canvas");
      if (previewVideo?.videoWidth && canvas.captureStream) {
        canvas.width = previewVideo.videoWidth;
        canvas.height = previewVideo.videoHeight;
        const context = canvas.getContext("2d");
        if (context) {
          let animationFrame = 0;
          const drawFrame = () => {
            if (previewVideo.readyState >= 2) {
              context.save();
              context.filter = currentFilter.css;
              if (cameraFacingRef.current === "user") {
                context.translate(canvas.width, 0);
                context.scale(-1, 1);
              }
              context.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
              context.restore();
            }
            animationFrame = requestAnimationFrame(drawFrame);
          };
          drawFrame();
          const filteredStream = canvas.captureStream(30);
          stream.getAudioTracks().forEach(track => filteredStream.addTrack(track));
          recordingStream = filteredStream;
          releaseRecordingStream = () => {
            cancelAnimationFrame(animationFrame);
            filteredStream.getVideoTracks().forEach(track => track.stop());
          };
        }
      }
      const candidates = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType, videoBitsPerSecond:1_500_000, audioBitsPerSecond:128_000 })
        : new MediaRecorder(recordingStream, { videoBitsPerSecond:1_500_000 });
      recorderChunksRef.current = [];
      recordedBytesRef.current = 0;
      setRecordedBytes(0);
      const recordingByteLimit = Math.max(1, maxVideoBytes - RECORDING_SIZE_HEADROOM_BYTES);
      recorder.ondataavailable = event => {
        if (!event.data?.size) return;
        recorderChunksRef.current.push(event.data);
        recordedBytesRef.current += event.data.size;
        setRecordedBytes(recordedBytesRef.current);
        if (recordedBytesRef.current >= recordingByteLimit && recorder.state === "recording") {
          setCameraError(`Reached the ${uploadLimitMegabytes} MB upload limit. Recording stopped.`);
          recorder.stop();
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type:recorder.mimeType || "video/webm" });
        recorderChunksRef.current = [];
        recordedBytesRef.current = blob.size;
        setRecordedBytes(blob.size);
        if (durationTimerRef.current) window.clearInterval(durationTimerRef.current);
        if (maxRecordTimerRef.current) window.clearTimeout(maxRecordTimerRef.current);
        durationTimerRef.current = null;
        maxRecordTimerRef.current = null;
        recordingCleanupRef.current?.();
        recordingCleanupRef.current = null;
        if (blob.size) setCapture(blob);
        setRecording(false);
        setRecordingSeconds(0);
      };
      recordingCleanupRef.current = releaseRecordingStream;
      recorder.start(250);
      recorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setRecording(true);
      setRecordingSeconds(0);
      durationTimerRef.current = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartRef.current) / 1000)), 250);
      maxRecordTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, MAX_RECORDING_SECONDS * 1000);
      return true;
    } catch (error) {
      releaseRecordingStream();
      setCameraError(error.message || "Unable to start video recording.");
      return false;
    }
  };

  const stopRecording = () => {
    if (maxRecordTimerRef.current) window.clearTimeout(maxRecordTimerRef.current);
    if (durationTimerRef.current) window.clearInterval(durationTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const onShutterDown = event => {
    event.preventDefault();
    recordingStartedRef.current = false;
    holdTimerRef.current = window.setTimeout(() => { recordingStartedRef.current = startRecording(); }, 240);
  };

  const flipCamera = async () => {
    if (cameraSwitching || !cameraReady) return;
    const nextFacing = cameraFacingRef.current === "user" ? "environment" : "user";
    const currentStream = cameraStreamRef.current;
    const currentTrack = currentStream?.getVideoTracks()[0];
    if (!currentTrack) {
      setCameraError("The active camera is unavailable. Close and reopen the camera to try again.");
      return;
    }

    setCameraSwitching(true);
    setCameraError("");
    try {
      try {
        if (!currentTrack.applyConstraints) throw new Error("In-place camera switching is unavailable.");
        await currentTrack.applyConstraints({ facingMode:{ exact:nextFacing } });
      } catch (switchError) {
        if (recording) throw new Error("This device cannot switch cameras while recording. Stop the video, then flip the camera and continue with another clip.");
        if (!navigator.mediaDevices?.getUserMedia) throw switchError;
        let nextStream;
        try {
          nextStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:nextFacing } }, audio:true });
        } catch {
          nextStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:nextFacing } }, audio:false });
        }
        if (view !== CAMERA_VIEW || !cameraVideoRef.current) {
          nextStream.getTracks().forEach(track => track.stop());
          return;
        }
        cameraVideoRef.current.srcObject = nextStream;
        await cameraVideoRef.current.play().catch(() => {});
        cameraStreamRef.current = nextStream;
        currentStream.getTracks().forEach(track => track.stop());
      }
      cameraFacingRef.current = nextFacing;
      setCameraFacing(nextFacing);
    } catch (error) {
      setCameraError(error.message || "Unable to switch cameras.");
    } finally {
      setCameraSwitching(false);
    }
  };

  const onShutterUp = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    if (recordingStartedRef.current) stopRecording();
    else if (!recording) capturePhoto();
    recordingStartedRef.current = false;
  };

  const chooseLibraryMedia = event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      setCameraError("Choose a photo or video file.");
      return;
    }
    if (file.type.startsWith("video/") && file.size > maxVideoBytes) {
      setCameraError(`Choose a video under ${uploadLimitMegabytes} MB.`);
      return;
    }
    setCapture(file);
  };

  const retake = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
    setCapturedMedia(null);
    recordedBytesRef.current = 0;
    setRecordedBytes(0);
    setCameraError("");
  };

  const publish = async event => {
    event.preventDefault();
    if (!capturedMedia || publishing) return;
    setPublishing(true);
    setPublishError("");
    setUploadProgress(0);
    try {
      if (capturedMedia.type.startsWith("video/")) {
        setUploadStage("Preparing secure upload...");
        const upload = await getSocialReelUploadUrl(capturedMedia.type, capturedMedia.size);
        setUploadStage("Uploading video to R2...");
        await uploadReelObject(upload.upload_url, capturedMedia, upload.required_headers, setUploadProgress);
        setUploadStage("Starting HD video processing...");
        await createSocialReelFromUpload({ object_key:upload.object_key, caption, workoutTag, location, privacy });
      } else {
        setUploadStage("Uploading photo...");
        await uploadSocialReel(capturedMedia, { caption, workoutTag, location, privacy });
      }
      const data = await getSocialReels();
      const items = data.items.map(reel => ({ ...reel, feedKey:`${reel.id}:${nextFeedKeyRef.current++}` }));
      setReels(items);
      setCursor(data.nextCursor);
      setActiveReelKey(null);
      setCaption("");
      setWorkoutTag("");
      setLocation("");
      setPrivacy("public");
      setUploadStage("");
      setUploadProgress(0);
      retake();
      setView(FEED_VIEW);
      requestAnimationFrame(() => feedRef.current?.scrollTo({ top:0, behavior:"smooth" }));
    } catch (error) {
      setPublishError(error.message || "Unable to publish this post.");
    }
    finally { setPublishing(false); setUploadStage(""); }
  };

  const toggleLike = async reel => {
    const wasLiked = Boolean(reel.liked);
    setReels(current => current.map(item => item.id === reel.id ? { ...item, liked:!wasLiked, like_count:Math.max(0, (item.like_count || 0) + (wasLiked ? -1 : 1)) } : item));
    try {
      const result = await toggleSocialReelLike(reel.id);
      setReels(current => current.map(item => item.id === reel.id ? { ...item, liked:result.liked, like_count:result.like_count } : item));
    } catch (error) {
      setReels(current => current.map(item => item.id === reel.id ? { ...item, liked:wasLiked, like_count:Math.max(0, (item.like_count || 0) + (wasLiked ? 1 : -1)) } : item));
      setFeedError(error.message || "Unable to update like.");
    }
  };

  const shareReel = reel => setSharingReel(reel);

  const getShareUrl = reel => {
    const configuredUrl = import.meta.env?.VITE_APP_URL?.trim();
    const browserUrl = /^https?:$/.test(window.location.protocol) ? window.location.origin : "";
    const candidates = [configuredUrl, browserUrl, "https://movora-production.up.railway.app"].filter(Boolean);
    const link = candidates.map(candidate => {
      try { return new URL(candidate); }
      catch { return null; }
    }).find(candidate => candidate && /^https?:$/.test(candidate.protocol)
      && !["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(candidate.hostname.toLowerCase()));
    if (!link) return "";
    link.searchParams.set("reel", reel.id);
    link.hash = "";
    return link.toString();
  };

  const commentAdded = reelId => setReels(current => current.map(item => item.id === reelId ? { ...item, comment_count:(item.comment_count || 0) + 1 } : item));
  const activeReelIndex = reels.findIndex(reel => reel.feedKey === activeReelKey);

  return <main className="reels-experience" data-view={view}>
    <div className="reels-feed" ref={feedRef} aria-label="Reels feed">
      {loading && <div className="reels-loading">Loading Reels...</div>}
      {!loading && reels.map((reel, index) => <ReelCard key={reel.feedKey} reel={reel} feedIndex={index} active={view === FEED_VIEW && activeReelKey === reel.feedKey} preload={view === FEED_VIEW && index === activeReelIndex + 1} onLike={toggleLike} onComments={setCommentsReel} onShare={shareReel}/>)}
      {!loading && reels.length === 0 && <div className="reels-empty"><span className="reels-empty-mark">M</span><h1>Movora Reels</h1><p>Movement looks better in motion.</p><button type="button" onClick={() => setView(CAMERA_VIEW)}>Create the first post</button></div>}
      {feedError && view === FEED_VIEW && <div className="reels-feed-error" role="alert">{feedError}<button type="button" onClick={() => loadPage(null)}>Retry</button></div>}
      <div ref={loadMoreRef} className="reels-feed-end">{loadingMore ? "Loading more" : cursor ? "" : reels.length ? "You're all caught up" : ""}</div>
    </div>
    {view === FEED_VIEW && <header className="reels-topbar"><div className="reels-topbar-leading"><button type="button" className="reels-back-button" onClick={onExit} aria-label="Back to Home">←</button><span className="reels-brand">Reels</span></div><button type="button" className="reels-post-button" onClick={() => { setCameraError(""); setView(CAMERA_VIEW); }}>+ Post</button></header>}

    {view === CAMERA_VIEW && <section className="reels-camera-view" aria-label="Create a post">
      {capturedMedia ? (capturedMedia.type.startsWith("image/")
        ? <img className="camera-preview" src={previewUrl} alt="Captured preview" />
        : <video className="camera-preview" src={previewUrl} autoPlay muted loop playsInline />)
        : <video ref={cameraVideoRef} className={`camera-preview${cameraFacing === "user" ? " is-selfie" : ""}`} autoPlay muted playsInline style={{ filter:currentFilter.css }} />}
      <div className="camera-vignette" />
      <header className="camera-topbar"><button type="button" className="camera-back" onClick={() => { retake(); setView(FEED_VIEW); }} aria-label="Close camera">×</button><span>{recording ? <><i className="recording-dot"/> {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</> : "New post"}</span>{capturedMedia ? <button type="button" className="camera-next" onClick={() => { setPublishError(""); setView(POST_DETAILS_VIEW); }}>Next</button> : <button type="button" className="camera-flip" onClick={flipCamera} disabled={!cameraReady || cameraSwitching}>{cameraSwitching ? "Switching…" : "Flip"}</button>}</header>
      {cameraError && <p className="camera-error" role="alert">{cameraError}</p>}
      {!capturedMedia && <div className="camera-controls">
        <div className="camera-filters" role="group" aria-label="Camera filters">{filters.map(filter => <button type="button" key={filter.id} className={selectedFilter === filter.id ? "selected" : ""} onClick={() => setSelectedFilter(filter.id)}><span className={`filter-swatch filter-${filter.id}`} />{filter.label}</button>)}</div>
        <div className="camera-shutter-row">
          <button type="button" className="camera-library" onClick={() => document.getElementById("reel-media-picker")?.click()} aria-label="Choose photos or videos from your gallery"><span className="camera-library-icon" aria-hidden="true">▧</span><span>Gallery</span></button>
          <div className={`camera-shutter-wrap${recording ? " is-recording" : ""}`}>
            <svg className="camera-shutter-progress" viewBox="0 0 100 100" role="progressbar" aria-label="Video file size limit" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(recordingProgress)}>
              <circle className="camera-shutter-progress-track" cx="50" cy="50" r="44" />
              <circle className="camera-shutter-progress-value" cx="50" cy="50" r="44" style={{ strokeDashoffset:`${276.46 * (1 - recordingProgress / 100)}` }} />
            </svg>
            <button type="button" className={`camera-shutter${recording ? " is-recording" : ""}`} disabled={!cameraReady || !uploadLimitReady} onPointerDown={onShutterDown} onPointerUp={onShutterUp} onPointerCancel={onShutterUp} onContextMenu={event => event.preventDefault()} aria-label={recording ? "Release to stop recording" : `Tap for photo or hold to record video, maximum ${uploadLimitMegabytes} megabytes`}>
              <span />
            </button>
          </div>
          <span className="camera-hint">{recording ? `${(recordedBytes / (1024 * 1024)).toFixed(1)} / ${uploadLimitMegabytes} MB` : `Tap photo · Hold video · Max ${uploadLimitMegabytes} MB`}</span>
        </div>
        <input id="reel-media-picker" className="camera-file-input" type="file" accept="image/*,video/*" onChange={chooseLibraryMedia} />
      </div>}
      {capturedMedia && <button type="button" className="camera-retake" onClick={retake}>Retake</button>}
    </section>}

    {view === POST_DETAILS_VIEW && <section className="reels-details-view" aria-label="Review post">
      <header className="details-topbar"><button type="button" onClick={() => setView(CAMERA_VIEW)} aria-label="Back to camera">‹</button><h1>New post</h1><span /></header>
      <form className="reels-details-form" onSubmit={publish}>
        <div className="details-media-preview">{capturedMedia?.type.startsWith("image/") ? <img src={previewUrl} alt="Post preview"/> : <video src={previewUrl} controls playsInline />}</div>
        <label className="details-field"><span>Caption</span><textarea value={caption} onChange={event => setCaption(event.target.value.slice(0, 220))} maxLength={220} placeholder="Add a caption..." rows={3}/><small>{caption.length}/220</small></label>
        <label className="details-field"><span>Workout tag <small>Optional</small></span><input value={workoutTag} onChange={event => setWorkoutTag(event.target.value.slice(0, 40))} placeholder="e.g. Leg day" /></label>
        <label className="details-field"><span>Location <small>Optional</small></span><input value={location} onChange={event => setLocation(event.target.value.slice(0, 100))} placeholder="Add a location" /></label>
        <label className="details-field"><span>Who can see this</span><select value={privacy} onChange={event => setPrivacy(event.target.value)}><option value="public">Everyone</option><option value="friends">Friends</option><option value="private">Only me</option></select></label>
        {publishError && <p className="reel-form-error" role="alert">{publishError}</p>}
        {publishing && <div className="reel-upload-progress" role="status"><div className="reel-upload-progress-label"><span>{uploadStage}</span>{uploadStage.startsWith("Uploading") && <span>{uploadProgress}%</span>}</div><div className="reel-upload-progress-track"><span style={{ width:`${uploadStage.startsWith("Uploading") ? uploadProgress : 100}%` }}/></div></div>}
        <button className="reels-publish-button" type="submit" disabled={publishing}>{publishing ? uploadStage.startsWith("Uploading") ? `Uploading ${uploadProgress}%` : "Preparing post..." : "Share post"}</button>
      </form>
    </section>}

    {commentsReel && <CommentsSheet reel={commentsReel} onClose={() => setCommentsReel(null)} onCommentAdded={() => commentAdded(commentsReel.id)}/>}
    {sharingReel && <ShareSheet reel={sharingReel} shareUrl={getShareUrl(sharingReel)} onClose={() => setSharingReel(null)}/>}
  </main>;
}
