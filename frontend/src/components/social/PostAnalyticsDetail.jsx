import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { deleteMyReel, getMyReelAnalytics, getSocialReelMedia, recordSocialReelEvent, resolveApiUrl, updateMyReelPrivacy } from "../../services/api";
import "./ProfileInsights.css";

const audienceColors = ["#3182e8", "#8b9aa5"];

function initials(name = "Movora") {
  return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function ChartFrame({ title, children, empty }) {
  return <section className="profile-analytics-chart">
    <h3>{title}</h3>
    {empty ? <div className="profile-analytics-chart-empty">Analytics will appear as people view this post.</div> : <div className="profile-analytics-chart-body">{children}</div>}
  </section>;
}

export default function PostAnalyticsDetail({ reelId, onBack, onDeleted }) {
  const [analytics, setAnalytics] = useState(null);
  const [source, setSource] = useState("");
  const [loadError, setLoadError] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const videoRef = useRef(null);
  const watchSampleRef = useRef({ currentTime:0, sentAt:0 });

  useEffect(() => {
    let active = true;
    setLoadError("");
    getMyReelAnalytics(reelId).then(result => {
      if (!active) return;
      setAnalytics(result);
      setPrivacy(result.reel.privacy || "public");
    }).catch(err => { if (active) setLoadError(err.message || "Unable to load post analytics."); });
    return () => { active = false; };
  }, [reelId]);

  const reel = analytics?.reel;
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setSource("");
    if (!reel || reel.video_hls_url || reel.video_url) return undefined;
    getSocialReelMedia(reel.id).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => { if (!cancelled) setLoadError("Post media could not be loaded."); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reel?.id, reel?.media_type, reel?.video_hls_url, reel?.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !reel?.video_hls_url) return undefined;
    let cancelled = false;
    let hls;
    const session = JSON.parse(localStorage.getItem("rs_session") || "null");
    const attach = async () => {
      const { default:Hls } = await import("hls.js");
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls({ xhrSetup(xhr) { if (session?.accessToken) xhr.setRequestHeader("Authorization", `Bearer ${session.accessToken}`); } });
        hls.loadSource(resolveApiUrl(reel.video_hls_url));
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = resolveApiUrl(reel.video_hls_url);
      }
    };
    attach().catch(() => setLoadError("Video playback is unavailable."));
    return () => { cancelled = true; hls?.destroy(); };
  }, [reel?.id, reel?.video_hls_url]);

  const handleTimeUpdate = event => {
    const video = event.currentTarget;
    const now = Date.now();
    const previous = watchSampleRef.current;
    if (!previous.sentAt) {
      watchSampleRef.current = { currentTime:video.currentTime, sentAt:now };
      return;
    }
    if (now - previous.sentAt < 5000) return;
    const watchedMs = Math.max(0, Math.min(30000, Math.round((video.currentTime - previous.currentTime) * 1000)));
    const progressPct = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(100, Math.round((video.currentTime / video.duration) * 100)) : 0;
    watchSampleRef.current = { currentTime:video.currentTime, sentAt:now };
    if (watchedMs > 0) recordSocialReelEvent(reel.id, { eventType:"watch", watchMs:watchedMs, progressPct }).catch(() => {});
  };

  const saveChanges = async () => {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await updateMyReelPrivacy(reel.id, privacy);
      setAnalytics(current => ({ ...current, reel:{ ...current.reel, privacy } }));
      setFeedback("Visibility saved.");
    } catch (err) { setError(err.message || "Unable to save visibility."); }
    finally { setBusy(false); }
  };

  const deletePost = async () => {
    if (!window.confirm("Delete this post? This permanently removes it and its analytics.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteMyReel(reel.id);
      onDeleted();
    } catch (err) { setError(err.message || "Unable to delete this post."); }
    finally { setBusy(false); }
  };

  if (loadError) return <section className="profile-insights-page"><header className="profile-insights-header"><button type="button" className="profile-insights-back" onClick={onBack} aria-label="Back to posts">←</button><h1 className="profile-insights-title">Post analytics</h1></header><p className="profile-insights-error" role="alert">{loadError}</p></section>;
  if (!analytics) return <section className="profile-insights-page"><p className="profile-insights-state" role="status">Loading post analytics…</p></section>;

  const audienceData = [
    { name:"Followers", value:analytics.audience.followers },
    { name:"Non-followers", value:analytics.audience.nonFollowers },
  ];
  const emptyImpressions = !analytics.reel.impressions;
  const emptyRetention = !analytics.retention.some(point => point.viewers > 0);
  const mediaSource = source || (reel.video_url ? resolveApiUrl(reel.video_url) : "");
  const isImage = reel.media_type?.startsWith("image/");

  return <section className="profile-insights-page" aria-labelledby="post-analytics-heading">
    <header className="profile-insights-header">
      <button className="profile-insights-back" type="button" onClick={onBack} aria-label="Back to posts">←</button>
      <div><span className="profile-insights-kicker">POST PERFORMANCE</span><h1 id="post-analytics-heading">Post analytics</h1></div>
    </header>
    <div className="profile-analytics-layout">
      <article className="profile-analytics-media">
        <div className="profile-analytics-media-frame">
          {isImage && mediaSource && <img src={mediaSource} alt={reel.caption || "Your post"} />}
          {!isImage && (reel.video_hls_url || mediaSource) && <video ref={videoRef} src={reel.video_hls_url ? undefined : mediaSource} controls playsInline onTimeUpdate={handleTimeUpdate} />}
          {!isImage && !reel.video_hls_url && !mediaSource && <div className="profile-analytics-media-empty">Media preview unavailable</div>}
        </div>
        <div className="profile-analytics-author"><span className="profile-analytics-avatar">{initials(reel.display_name)}</span><div><strong>{reel.display_name || "You"}</strong><span>@{reel.username || "member"}</span></div></div>
        {reel.caption && <p className="profile-analytics-caption">{reel.caption}</p>}
        <p className="profile-analytics-caption">{analytics.reel.likes} likes · {analytics.reel.saves} saves · {analytics.reel.comments} comments · {analytics.reel.shares} shares</p>
      </article>

      <div className="profile-analytics-panel">
        <h2 className="profile-analytics-title">Performance</h2>
        <p className="profile-analytics-subtitle">All recorded activity since this post was published. Audience split excludes your own views.</p>
        <div className="profile-analytics-stats">
          {[
            ["Impressions", analytics.reel.impressions],
            ["Unique reach", analytics.reel.reach],
            ["Avg. watch", `${(analytics.reel.average_watch_ms / 1000).toFixed(1)}s`],
            ["Likes", analytics.reel.likes],
            ["Saves", analytics.reel.saves],
            ["Shares", analytics.reel.shares],
          ].map(([label, value]) => <div className="profile-analytics-stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
        <ChartFrame title="Impressions and reach · lifetime" empty={emptyImpressions}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.impressions}><CartesianGrid stroke="#e8eef2" vertical={false}/><XAxis dataKey="day" tick={{ fontSize:9 }} tickFormatter={value => value.slice(5)}/><YAxis allowDecimals={false} width={28} tick={{ fontSize:9 }}/><Tooltip/><Area type="monotone" dataKey="impressions" stroke="#3182e8" fill="#3182e8" fillOpacity={0.15}/><Area type="monotone" dataKey="reach" stroke="#12a18a" fill="#12a18a" fillOpacity={0.08}/></AreaChart></ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title="Watch retention" empty={emptyRetention}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.retention}><CartesianGrid stroke="#e8eef2" vertical={false}/><XAxis dataKey="progress_pct" tickFormatter={value => `${value}%`} tick={{ fontSize:9 }}/><YAxis domain={[0,100]} tickFormatter={value => `${value}%`} width={34} tick={{ fontSize:9 }}/><Tooltip formatter={value => `${value}%`}/><Line type="monotone" dataKey="retention_rate" stroke="#3182e8" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>
        </ChartFrame>
        <div className="profile-analytics-chart-grid">
          <ChartFrame title="Audience split" empty={!analytics.reel.reach}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={audienceData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%" paddingAngle={2}>{audienceData.map((entry, index) => <Cell key={entry.name} fill={audienceColors[index]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
          </ChartFrame>
          <ChartFrame title={`Comments · lifetime (${analytics.commentVelocityUnit || "day"})`} empty={!analytics.reel.comments}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.commentVelocity}><CartesianGrid stroke="#e8eef2" vertical={false}/><XAxis dataKey="day" tickFormatter={value => value.slice(5)} tick={{ fontSize:9 }}/><YAxis allowDecimals={false} width={25} tick={{ fontSize:9 }}/><Tooltip/><Bar dataKey="comments" fill="#12a18a" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>
          </ChartFrame>
        </div>
        <section className="profile-analytics-comments" aria-labelledby="profile-analytics-comments-heading">
          <header><h3 id="profile-analytics-comments-heading">Post comments</h3><span>{analytics.reel.comments}</span></header>
          {(!analytics.comments || analytics.comments.length === 0) && <p className="profile-analytics-comments-empty">No comments on this post yet.</p>}
          {analytics.comments?.map(comment => <article className="profile-analytics-comment" key={comment.id}>
            <span className="profile-analytics-comment-avatar">{initials(comment.display_name)}</span>
            <div className="profile-analytics-comment-content">
              <div><strong>{comment.display_name}</strong>{comment.parent_comment_id && <span className="profile-analytics-reply-label">Reply</span>}{comment.is_pinned && <span className="profile-analytics-pinned-label">Pinned</span>}<time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString()}</time></div>
              <p>{comment.body}</p>
            </div>
          </article>)}
          {analytics.comments?.length >= 100 && <p className="profile-analytics-comments-note">Showing the latest 100 comments.</p>}
        </section>
        <div className="profile-analytics-settings">
          <label htmlFor="reel-visibility">Who can see this post?
            <select id="reel-visibility" value={privacy} onChange={event => setPrivacy(event.target.value)}>
              <option value="public">Visible to Everyone</option>
              <option value="friends">Friends Only</option>
              <option value="private">Only Me</option>
            </select>
          </label>
        </div>
        {error && <p className="profile-analytics-form-error" role="alert">{error}</p>}
        {feedback && <p className="profile-insights-state" role="status">{feedback}</p>}
        <footer className="profile-analytics-footer">
          <button className="profile-analytics-delete" type="button" disabled={busy} onClick={deletePost}>Delete Post</button>
          <button className="profile-analytics-save" type="button" disabled={busy || privacy === reel.privacy} onClick={saveChanges}>{busy ? "Saving…" : "Save Changes"}</button>
        </footer>
      </div>
    </div>
  </section>;
}
