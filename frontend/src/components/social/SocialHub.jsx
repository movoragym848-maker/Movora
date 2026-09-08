import { useEffect, useRef, useState } from "react";
import { C } from "../../constants/data";
import { createSocialReel, getFriendRequests, getSocialConversations, getSocialMessages, getSocialProfile, getSocialReels, respondToFriendRequest, saveSocialProfile, searchSocialProfiles, sendFriendRequest, sendSocialMessage, toggleSocialFollow } from "../../services/api";
import "./SocialHub.css";

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const emptyProfile = { username: "", displayName: "", bio: "", avatarUrl: null };
const NOTE_TTL_MS = 25 * 60 * 60 * 1000;

function initials(name) {
  return (name || "Movora").split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ name, src, size = 42 }) {
  return src ? <img src={src} alt="" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", background:C.surface }} /> : <div aria-hidden="true" style={{ width:size, height:size, borderRadius:"50%", display:"grid", placeItems:"center", background:"#DBEAFE", color:C.primary, fontWeight:800 }}>{initials(name)}</div>;
}

function AccountSetup({ onSaved, initial }) {
  const [form, setForm] = useState(initial || emptyProfile);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError("");
    if (!usernamePattern.test(form.username)) return setError("Username must be 3-30 characters using lowercase letters, numbers, dots, or underscores.");
    setSaving(true);
    try { onSaved(await saveSocialProfile({ ...form, username: form.username.toLowerCase() })); }
    catch (err) { setError(err.message || "Unable to create your social account."); }
    finally { setSaving(false); }
  };
  return <div style={{ maxWidth:460, margin:"30px auto", background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:22 }}>
    <div style={{ fontSize:32, marginBottom:8 }}>✦</div>
    <h1 style={{ margin:"0 0 6px", color:C.dark, fontFamily:"'Barlow Condensed',sans-serif", fontSize:28 }}>Create your Movora ID</h1>
    <p style={{ margin:"0 0 20px", color:C.muted, fontSize:14 }}>Choose a unique username before you discover people, reels, and messages.</p>
    {error && <div role="alert" style={{ marginBottom:14, padding:11, borderRadius:8, background:"#FEF2F2", color:"#991B1B", fontSize:13 }}>{error}</div>}
    <form onSubmit={submit} style={{ display:"grid", gap:12 }}>
      <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Username
        <div style={{ display:"flex", alignItems:"center", marginTop:6 }}><span style={{ padding:"10px 0 10px 11px", color:C.muted, background:C.surface, border:`1px solid ${C.border}`, borderRight:0, borderRadius:"8px 0 0 8px" }}>@</span><input required value={form.username} onChange={e => setForm(current => ({ ...current, username:e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30) }))} placeholder="your.username" style={{ flex:1, minWidth:0, padding:"10px 11px", border:`1px solid ${C.border}`, borderRadius:"0 8px 8px 0", background:C.surface, color:C.dark, font:"inherit" }} /></div>
      </label>
      <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Display name<input required minLength={2} maxLength={60} value={form.displayName} onChange={e => setForm(current => ({ ...current, displayName:e.target.value }))} placeholder="Your name" style={{ display:"block", width:"100%", marginTop:6, padding:"10px 11px", border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit" }} /></label>
      <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Bio <span style={{ color:C.muted, fontWeight:500 }}>(optional)</span><textarea maxLength={160} rows={3} value={form.bio} onChange={e => setForm(current => ({ ...current, bio:e.target.value }))} placeholder="Your fitness focus" style={{ display:"block", width:"100%", marginTop:6, padding:"10px 11px", border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit", resize:"vertical" }} /></label>
      <button type="submit" disabled={saving} style={{ border:0, borderRadius:9, background:C.primary, color:"#fff", padding:12, fontWeight:700, cursor:saving ? "wait" : "pointer" }}>{saving ? "Creating..." : "Create Movora ID"}</button>
    </form>
  </div>;
}

function Reels({ profile }) {
  const [reels, setReels] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [showPublisher, setShowPublisher] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const load = async nextCursor => {
    nextCursor ? setLoadingMore(true) : setLoading(true);
    try { const data = await getSocialReels(nextCursor); setReels(current => nextCursor ? [...current, ...data.items] : data.items); setCursor(data.nextCursor); }
    catch (err) { setError(err.message || "Unable to load reels."); }
    finally { setLoading(false); setLoadingMore(false); }
  };
  useEffect(() => { load(); }, []);
  const sentinel = useRef(null);
  useEffect(() => { const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting && cursor && !loadingMore) load(cursor); }, { rootMargin:"500px" }); if (sentinel.current) observer.observe(sentinel.current); return () => observer.disconnect(); }, [cursor, loadingMore]);
  if (loading) return <div style={{ padding:50, textAlign:"center", color:C.muted }}>Loading reels...</div>;
  return <div style={{ display:"grid", gap:16 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"end", gap:10 }}><div><h1 style={{ margin:0, color:C.dark, fontFamily:"'Barlow Condensed',sans-serif", fontSize:28 }}>Reels</h1><p style={{ margin:"4px 0 0", color:C.muted, fontSize:14 }}>Train. Share. Move together.</p></div><button type="button" onClick={() => setShowPublisher(current => !current)} style={{ border:0, borderRadius:9, background:C.primary, color:"#fff", padding:"9px 12px", fontWeight:700, cursor:"pointer" }}>+ Post</button></div>
    {showPublisher && <form onSubmit={async event => { event.preventDefault(); setPublishing(true); setError(""); try { await createSocialReel({ videoUrl, caption }); setVideoUrl(""); setCaption(""); setShowPublisher(false); await load(); } catch (err) { setError(err.message || "Unable to publish reel."); } finally { setPublishing(false); } }} style={{ display:"grid", gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}><input required type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Hosted video URL (https://...)" style={{ padding:10, border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit" }}/><input maxLength={220} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption" style={{ padding:10, border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit" }}/><button type="submit" disabled={publishing} style={{ border:0, borderRadius:8, background:C.dark, color:"#fff", padding:10, fontWeight:700, cursor:"pointer" }}>{publishing ? "Publishing..." : "Publish Reel"}</button></form>}
    {error && <div role="alert" style={{ padding:12, borderRadius:8, background:"#FEF2F2", color:"#991B1B" }}>{error}</div>}
    {reels.length === 0 ? <div style={{ padding:40, textAlign:"center", background:C.card, border:`1px solid ${C.border}`, borderRadius:14, color:C.muted }}>No reels have been published yet.</div> : reels.map(reel => <article key={reel.id} style={{ background:"#111827", borderRadius:16, overflow:"hidden", color:"#fff" }}><video src={reel.video_url} poster={reel.thumbnail_url || undefined} controls playsInline preload="metadata" style={{ display:"block", width:"100%", maxHeight:"72vh", aspectRatio:"9 / 16", objectFit:"cover", background:"#000" }} /><div style={{ padding:14 }}><div style={{ display:"flex", alignItems:"center", gap:9 }}><Avatar name={reel.display_name} src={reel.avatar_url} size={34}/><strong>{reel.display_name}</strong><span style={{ color:"#CBD5E1", fontSize:12 }}>@{reel.username}</span></div>{reel.caption && <p style={{ margin:"10px 0 0", color:"#E5E7EB", fontSize:14 }}>{reel.caption}</p>}</div></article>)}
    <div ref={sentinel} style={{ minHeight:30, textAlign:"center", color:C.muted, fontSize:12 }}>{loadingMore ? "Loading more..." : reels.length && !cursor ? "You are all caught up." : ""}</div>
  </div>;
}

function Messages({ profile }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState({ incoming:[], outgoing:[] });
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const noteInputRef = useRef(null);
  useEffect(() => { getSocialConversations().then(setConversations).catch(err => setError(err.message)); }, []);
  const refreshRequests = () => getFriendRequests().then(setRequests).catch(err => setError(err.message));
  useEffect(() => { refreshRequests(); }, []);
  useEffect(() => {
    const storageKey = `movora-note-${profile.user_id}`;
    const loadNote = () => {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setNote("");
        return;
      }

      try {
        const savedNote = JSON.parse(stored);
        if (savedNote.createdAt && Date.now() - savedNote.createdAt < NOTE_TTL_MS) {
          setNote(savedNote.text || "");
          return;
        }
      } catch {
        // Remove notes saved before expiration metadata was added.
      }

      window.localStorage.removeItem(storageKey);
      setNote("");
    };

    loadNote();
    const expiryTimer = window.setInterval(loadNote, 60000);
    return () => window.clearInterval(expiryTimer);
  }, [profile.user_id]);
  useEffect(() => {
    if (!noteOpen) return undefined;
    const focusTimer = window.setTimeout(() => noteInputRef.current?.focus(), 240);
    return () => window.clearTimeout(focusTimer);
  }, [noteOpen]);
  useEffect(() => { if (query.trim().length < 2) return setResults([]); const timer = setTimeout(() => searchSocialProfiles(query).then(setResults).catch(err => setError(err.message)), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { if (!selected || selected.newChat) return; getSocialMessages(selected.id).then(setMessages).catch(err => setError(err.message)); }, [selected]);
  const chooseUser = user => { setSelected({ ...user, id:user.user_id, newChat:true }); setMessages([]); setQuery(""); setResults([]); };
  const requestUser = async user => {
    try {
      const result = await sendFriendRequest(user.user_id);
      setResults(current => current.map(item => item.user_id === user.user_id ? { ...item, following:true, request_status:result.status === "accepted" ? "accepted" : "outgoing_pending" } : item));
      await refreshRequests();
    } catch (err) { setError(err.message); }
  };
  const respondToRequest = async (requestId, status, userId) => {
    try {
      await respondToFriendRequest(requestId, status);
      setResults(current => current.map(item => item.user_id === userId ? { ...item, request_status:status === "accepted" ? "accepted" : null, following:status === "accepted" ? item.following : false } : item));
      await refreshRequests();
    } catch (err) { setError(err.message); }
  };
  const followBack = async userId => {
    try { await toggleSocialFollow(userId); await refreshRequests(); }
    catch (err) { setError(err.message); }
  };
  const send = async event => { event.preventDefault(); if (!body.trim() || !selected) return; try { const data = await sendSocialMessage(selected.user_id, body); setMessages(current => [...current, data.message]); setSelected(current => ({ ...current, id:data.conversationId, newChat:false })); setBody(""); setConversations(await getSocialConversations()); } catch (err) { setError(err.message); } };
  const openNote = () => { setNoteDraft(note); setNoteOpen(true); };
  const saveNote = () => {
    const nextNote = noteDraft.trim().slice(0, 80);
    const storageKey = `movora-note-${profile.user_id}`;
    if (nextNote) window.localStorage.setItem(storageKey, JSON.stringify({ text:nextNote, createdAt:Date.now() }));
    else window.localStorage.removeItem(storageKey);
    setNote(nextNote);
    setNoteOpen(false);
  };
  return <div className="social-messages">
    <div className="messages-heading"><div><h1>Messages</h1><p>Train together, stay connected.</p></div><div className="messages-heading-actions">{noteOpen && <button type="button" className="note-save-action" onClick={saveNote}>Done</button>}<button type="button" className="requests-button" onClick={() => setRequestsOpen(current => !current)} aria-expanded={requestsOpen}>Requests{requests.incoming.filter(request => request.status === "pending").length > 0 && <span>{requests.incoming.filter(request => request.status === "pending").length}</span>}</button></div></div>
    {requestsOpen && <div className="requests-panel"><div className="requests-panel-heading"><strong>Friend requests</strong><button type="button" onClick={() => setRequestsOpen(false)} aria-label="Close friend requests">×</button></div>{requests.incoming.length > 0 ? <div className="request-group"><div className="request-label">Incoming</div>{requests.incoming.map(request => <div className="request-row" key={request.id}><Avatar name={request.display_name} src={request.avatar_url} size={38}/><div className="person-copy"><strong>{request.display_name}</strong><span>@{request.username}</span></div>{request.status === "pending" ? <button type="button" className="request-accept" onClick={() => respondToRequest(request.id, "accepted", request.user_id)}>Accept</button> : <span className="request-pending">Accepted</span>}{request.following ? <span className="request-pending">Following</span> : <button type="button" className="request-accept" onClick={() => followBack(request.user_id)}>Follow back</button>}</div>)}</div> : <p className="requests-empty">No incoming requests.</p>}{requests.outgoing.length > 0 && <div className="request-group"><div className="request-label">Sent</div>{requests.outgoing.map(request => <div className="request-row" key={request.id}><Avatar name={request.display_name} src={request.avatar_url} size={38}/><div className="person-copy"><strong>{request.display_name}</strong><span>@{request.username}</span></div><span className="request-pending">{request.status === "accepted" ? "Accepted" : "Pending"}</span></div>)}</div>}</div>}
    <div className="messages-search"><div className="search-field"><span aria-hidden="true">⌕</span><input id="people-search" aria-label="Search by username or name" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by @username or name" /></div></div>
    <div className="discover-row" aria-label="Discover people">
      <button type="button" className={`discover-item note-trigger${noteOpen ? " is-hidden" : ""}`} onClick={openNote} aria-label={note ? `Edit your note: ${note}` : "Write your note"}><div className="note-cloud-wrap">{note && <span className="note-cloud">{note}</span>}<div className="discover-avatar discover-note"><span>✦</span></div></div><strong>Your note</strong></button>
    </div>
    {noteOpen && <div className="note-overlay"><div className="note-composer" role="dialog" aria-label="Write your note"><div className="discover-avatar discover-note"><span>✦</span></div><input ref={noteInputRef} className="note-input" value={noteDraft} onChange={event => setNoteDraft(event.target.value.slice(0, 80))} maxLength={80} placeholder="What are you up to?" aria-label="Your note" /></div></div>}
    {error && <div role="alert" className="messages-error">{error}</div>}
    {results.length > 0 && <div className="people-results"><div className="section-label">People</div>{results.map(user => <div className="person-result" key={user.user_id}><Avatar name={user.display_name} src={user.avatar_url} size={46}/><div className="person-copy"><strong>{user.display_name}</strong><span>@{user.username} · {user.followers} followers</span></div>{user.request_status === "accepted" ? <button type="button" className="message-button" onClick={() => chooseUser(user)}>Message</button> : user.request_status === "outgoing_pending" ? <span className="request-pending">Requested</span> : user.request_status === "incoming_pending" ? <button type="button" className="request-accept" onClick={() => refreshRequests().then(() => setRequestsOpen(true))}>Review request</button> : <button type="button" className="message-button" onClick={() => requestUser(user)}>Add friend</button>}</div>)}</div>}
    <div className={`inbox-layout${selected ? " has-selection" : ""}`}>
      <section className="conversation-list"><div className="inbox-title"><h2>Chats</h2><span>{conversations.length || ""}</span></div>{conversations.length === 0 ? <div className="empty-chats"><span>○</span><p>Your conversations will appear here.</p><small>Search above to find a training partner.</small></div> : conversations.map(chat => <button className={`conversation-row${selected?.id === chat.id ? " active" : ""}`} key={chat.id} type="button" onClick={() => setSelected({ ...chat, user_id:chat.user_id })}><Avatar name={chat.display_name} src={chat.avatar_url} size={50}/><span className="conversation-copy"><strong>{chat.display_name}</strong><small>@{chat.username}</small></span><span className="conversation-arrow">›</span></button>)}</section>
      {selected && <section className="conversation-panel"><div className="conversation-header"><button className="back-button" type="button" onClick={() => setSelected(null)} aria-label="Back to chats">‹</button><Avatar name={selected.display_name} src={selected.avatar_url} size={42}/><div><strong>{selected.display_name}</strong><small>@{selected.username}</small></div></div><div className="message-history">{messages.length === 0 && <div className="new-conversation">Start a conversation with <strong>{selected.display_name}</strong>.</div>}{messages.map(message => <div className={`message-bubble${message.sender_id === profile.user_id ? " mine" : ""}`} key={message.id}>{message.body}</div>)}</div><form onSubmit={send} className="message-composer"><input value={body} onChange={e => setBody(e.target.value)} placeholder="Write a message..." aria-label="Write a message"/><button type="submit" aria-label="Send message">↑</button></form></section>}
    </div>
  </div>;
}

export default function SocialHub({ mode, user }) {
  const [profile, setProfile] = useState(undefined);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getSocialProfile().then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div style={{ padding:50, textAlign:"center", color:C.muted }}>Loading Movora social...</div>;
  if (!profile) return <AccountSetup initial={{ ...emptyProfile, displayName:user.name }} onSaved={setProfile}/>;
  return mode === "reels" ? <Reels profile={profile}/> : <Messages profile={profile}/>;
}
