import { useEffect, useRef, useState } from "react";
import { addSocialReelComment, getSocialReelComments, getSocialReelMedia, getSocialReels, toggleSocialReelLike, uploadSocialReel } from "../../services/api";
import "./ReelsExperience.css";

const FEED_VIEW = "FEED_VIEW";
const CAMERA_VIEW = "CAMERA_VIEW";
const POST_DETAILS_VIEW = "POST_DETAILS_VIEW";
const MAX_MEDIA_SIZE = 20 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 30;
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

function ReelCard({ reel, active, onLike, onComments, onShare }) {
  const [source, setSource] = useState(reel.video_url || "");
  const [mediaError, setMediaError] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setMediaError(false);
    if (!reel.media_type) {
      setSource(reel.video_url || "");
      return undefined;
    }
    setSource("");
    if (!active) return undefined;
    getSocialReelMedia(reel.id).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => { if (!cancelled) setMediaError(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [active, reel.id, reel.media_type, reel.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (active) video.play().catch(() => {});
    else video.pause();
  }, [active, source]);

  const isImage = reel.media_type?.startsWith("image/");
  return <article className="reel-page" data-reel-id={reel.id}>
    {source && (isImage
      ? <img className="reel-media" src={source} alt="" />
      : <video ref={videoRef} className="reel-media" src={source} poster={reel.thumbnail_url || undefined} playsInline loop muted preload="metadata" onClick={event => event.currentTarget.paused ? event.currentTarget.play().catch(() => {}) : event.currentTarget.pause()} />)}
    {mediaError && <div className="reel-media-error">This post could not be loaded.</div>}
    <div className="reel-shade" />
    <div className="reel-author"><span className="reel-avatar">{initials(reel.display_name)}</span><strong>{reel.display_name}</strong><span>@{reel.username}</span></div>
    <div className="reel-actions">
      <button type="button" className={`reel-action${reel.liked ? " is-liked" : ""}`} onClick={() => onLike(reel)} aria-label={reel.liked ? "Unlike reel" : "Like reel"} aria-pressed={Boolean(reel.liked)}><ReelIcon type="heart" filled={reel.liked}/><span>{reel.like_count || 0}</span></button>
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
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const commentsEndRef = useRef(null);

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
      const comment = await addSocialReelComment(reel.id, draft.trim());
      setComments(current => [...current, comment]);
      setDraft("");
      onCommentAdded();
      requestAnimationFrame(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) { setError(err.message || "Unable to add comment."); }
    finally { setPosting(false); }
  };

  return <div className="reel-sheet-backdrop" onClick={onClose}>
    <section className="reel-comments-sheet" role="dialog" aria-modal="true" aria-label="Comments" onClick={event => event.stopPropagation()}>
      <div className="reel-sheet-grip" />
      <header><strong>Comments</strong><button type="button" onClick={onClose} aria-label="Close comments">×</button></header>
      <div className="reel-comments-list">
        {loading && <p className="reel-comments-empty">Loading comments...</p>}
        {!loading && comments.length === 0 && <p className="reel-comments-empty">Start the conversation.</p>}
        {comments.map(comment => <div className="reel-comment" key={comment.id}><span className="reel-comment-avatar">{initials(comment.display_name)}</span><div><strong>{comment.display_name}</strong><p>{comment.body}</p></div></div>)}
        <div ref={commentsEndRef} />
      </div>
      {error && <p className="reel-form-error" role="alert">{error}</p>}
      <form className="reel-comment-form" onSubmit={submit}><input value={draft} onChange={event => setDraft(event.target.value.slice(0, 500))} maxLength={500} placeholder="Add a comment..." aria-label="Add a comment"/><button type="submit" disabled={posting || !draft.trim()}>{posting ? "..." : "Post"}</button></form>
    </section>
  </div>;
}

export default function ReelsExperience() {
  const [view, setView] = useState(FEED_VIEW);
  const [reels, setReels] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [activeReelId, setActiveReelId] = useState(null);
  const [commentsReel, setCommentsReel] = useState(null);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("original");
  const [capturedMedia, setCapturedMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [caption, setCaption] = useState("");
  const [workoutTag, setWorkoutTag] = useState("");
  const [location, setLocation] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const feedRef = useRef(null);
  const loadMoreRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const holdTimerRef = useRef(null);
  const maxRecordTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const recordingStartRef = useRef(0);
  const recordingCleanupRef = useRef(null);
  const recordingStartedRef = useRef(false);
  const loadingRef = useRef(false);
  const previewUrlRef = useRef("");

  const currentFilter = filters.find(filter => filter.id === selectedFilter) || filters[0];

  const loadPage = async nextCursor => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    setFeedError("");
    try {
      const data = await getSocialReels(nextCursor);
      setReels(current => nextCursor ? [...current, ...data.items] : data.items);
      setCursor(data.nextCursor);
      if (!activeReelId && data.items[0]) setActiveReelId(data.items[0].id);
    } catch (err) { setFeedError(err.message || "Unable to load reels."); }
    finally { setLoading(false); setLoadingMore(false); loadingRef.current = false; }
  };

  useEffect(() => { loadPage(null); }, []);

  useEffect(() => {
    if (view !== FEED_VIEW || !feedRef.current || !loadMoreRef.current) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && cursor && !loadingRef.current) loadPage(cursor);
    }, { root:feedRef.current, rootMargin:"500px 0px" });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [cursor, loadingMore, reels.length, view]);

  useEffect(() => {
    const root = feedRef.current;
    if (view !== FEED_VIEW || !root) return undefined;
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (current?.intersectionRatio > 0.55) setActiveReelId(current.target.dataset.reelId);
    }, { root, threshold:[0.3, 0.55, 0.8] });
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
          stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:cameraFacing } }, audio:true });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:cameraFacing } }, audio:false });
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
  }, [cameraFacing, view]);

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
              if (cameraFacing === "user") {
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
      recorder.ondataavailable = event => { if (event.data?.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type:recorder.mimeType || "video/webm" });
        recorderChunksRef.current = [];
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
    if (file.size > MAX_MEDIA_SIZE) {
      setCameraError("Choose a photo or video smaller than 20 MB.");
      return;
    }
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      setCameraError("Choose a photo or video file.");
      return;
    }
    setCapture(file);
  };

  const retake = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
    setCapturedMedia(null);
    setCameraError("");
  };

  const publish = async event => {
    event.preventDefault();
    if (!capturedMedia || publishing) return;
    if (capturedMedia.size > MAX_MEDIA_SIZE) {
      setPublishError("This media is larger than 20 MB. Record a shorter clip or choose a smaller file.");
      return;
    }
    setPublishing(true);
    setPublishError("");
    try {
      await uploadSocialReel(capturedMedia, { caption, workoutTag, location, privacy });
      const data = await getSocialReels();
      setReels(data.items);
      setCursor(data.nextCursor);
      setActiveReelId(data.items[0]?.id || null);
      setCaption("");
      setWorkoutTag("");
      setLocation("");
      setPrivacy("public");
      retake();
      setView(FEED_VIEW);
      requestAnimationFrame(() => feedRef.current?.scrollTo({ top:0, behavior:"smooth" }));
    } catch (error) {
      const uploadRouteMissing = error.status === 404 && error.url?.includes("/social/reels/upload");
      setPublishError(uploadRouteMissing
        ? "The Reel upload endpoint was not found. Deploy the latest Movora backend to Railway, then try again."
        : error.message || "Unable to publish this post.");
    }
    finally { setPublishing(false); }
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

  const shareReel = async reel => {
    const shareData = { title:`${reel.display_name}'s Movora post`, text:reel.caption || "Watch this Movora post", url:reel.video_url || window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareData.url);
      else setFeedError("Sharing is not available on this device.");
    } catch (error) { if (error.name !== "AbortError") setFeedError("Unable to share this post."); }
  };

  const commentAdded = reelId => setReels(current => current.map(item => item.id === reelId ? { ...item, comment_count:(item.comment_count || 0) + 1 } : item));

  return <main className="reels-experience" data-view={view}>
    <div className="reels-feed" ref={feedRef} aria-label="Reels feed">
      {loading && <div className="reels-loading">Loading Reels...</div>}
      {!loading && reels.map(reel => <ReelCard key={reel.id} reel={reel} active={view === FEED_VIEW && activeReelId === reel.id} onLike={toggleLike} onComments={setCommentsReel} onShare={shareReel}/>)}
      {!loading && reels.length === 0 && <div className="reels-empty"><span className="reels-empty-mark">M</span><h1>Movora Reels</h1><p>Movement looks better in motion.</p><button type="button" onClick={() => setView(CAMERA_VIEW)}>Create the first post</button></div>}
      {feedError && view === FEED_VIEW && <div className="reels-feed-error" role="alert">{feedError}<button type="button" onClick={() => loadPage(null)}>Retry</button></div>}
      <div ref={loadMoreRef} className="reels-feed-end">{loadingMore ? "Loading more" : cursor ? "" : reels.length ? "You're all caught up" : ""}</div>
    </div>
    {view === FEED_VIEW && <header className="reels-topbar"><span className="reels-brand">Reels</span><button type="button" className="reels-post-button" onClick={() => { setCameraError(""); setView(CAMERA_VIEW); }}>+ Post</button></header>}

    {view === CAMERA_VIEW && <section className="reels-camera-view" aria-label="Create a post">
      {capturedMedia ? (capturedMedia.type.startsWith("image/")
        ? <img className="camera-preview" src={previewUrl} alt="Captured preview" />
        : <video className="camera-preview" src={previewUrl} autoPlay muted loop playsInline />)
        : <video ref={cameraVideoRef} className={`camera-preview${cameraFacing === "user" ? " is-selfie" : ""}`} autoPlay muted playsInline style={{ filter:currentFilter.css }} />}
      <div className="camera-vignette" />
      <header className="camera-topbar"><button type="button" className="camera-back" onClick={() => { retake(); setView(FEED_VIEW); }} aria-label="Close camera">×</button><span>{recording ? <><i className="recording-dot"/> {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</> : "New post"}</span>{capturedMedia ? <button type="button" className="camera-next" onClick={() => { setPublishError(""); setView(POST_DETAILS_VIEW); }}>Next</button> : <button type="button" className="camera-flip" onClick={() => setCameraFacing(current => current === "user" ? "environment" : "user")} disabled={!cameraReady || recording}>Flip</button>}</header>
      {cameraError && <p className="camera-error" role="alert">{cameraError}</p>}
      {!capturedMedia && <div className="camera-controls">
        <div className="camera-filters" role="group" aria-label="Camera filters">{filters.map(filter => <button type="button" key={filter.id} className={selectedFilter === filter.id ? "selected" : ""} onClick={() => setSelectedFilter(filter.id)}><span className={`filter-swatch filter-${filter.id}`} />{filter.label}</button>)}</div>
        <div className="camera-shutter-row"><button type="button" className="camera-library" onClick={() => document.getElementById("reel-media-picker")?.click()} aria-label="Choose photos or videos from your gallery"><span className="camera-library-icon" aria-hidden="true">▧</span><span>Gallery</span></button><button type="button" className={`camera-shutter${recording ? " is-recording" : ""}`} disabled={!cameraReady} onPointerDown={onShutterDown} onPointerUp={onShutterUp} onPointerCancel={onShutterUp} onContextMenu={event => event.preventDefault()} aria-label="Tap to take a photo or hold to record video"><span /></button><span className="camera-hint">Tap photo · Hold video</span></div>
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
        <button className="reels-publish-button" type="submit" disabled={publishing}>{publishing ? "Sharing..." : "Share post"}</button>
      </form>
    </section>}

    {commentsReel && <CommentsSheet reel={commentsReel} onClose={() => setCommentsReel(null)} onCommentAdded={() => commentAdded(commentsReel.id)}/>}
  </main>;
}
