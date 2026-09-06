import { useEffect, useRef, useState } from "react";
import { C } from "../../constants/data";
import { createSocialReel, getSocialConversations, getSocialMessages, getSocialProfile, getSocialReels, saveSocialProfile, searchSocialProfiles, sendSocialMessage, toggleSocialFollow } from "../../services/api";

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const emptyProfile = { username: "", displayName: "", bio: "", avatarUrl: null };

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
  useEffect(() => { getSocialConversations().then(setConversations).catch(err => setError(err.message)); }, []);
  useEffect(() => { if (query.trim().length < 2) return setResults([]); const timer = setTimeout(() => searchSocialProfiles(query).then(setResults).catch(err => setError(err.message)), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { if (!selected || selected.newChat) return; getSocialMessages(selected.id).then(setMessages).catch(err => setError(err.message)); }, [selected]);
  const chooseUser = user => { setSelected({ ...user, id:user.user_id, newChat:true }); setQuery(""); setResults([]); };
  const send = async event => { event.preventDefault(); if (!body.trim() || !selected) return; try { const data = await sendSocialMessage(selected.user_id, body); setMessages(current => [...current, data.message]); setSelected(current => ({ ...current, id:data.conversationId, newChat:false })); setBody(""); setConversations(await getSocialConversations()); } catch (err) { setError(err.message); } };
  return <div style={{ display:"grid", gap:14 }}>
    <div><h1 style={{ margin:0, color:C.dark, fontFamily:"'Barlow Condensed',sans-serif", fontSize:28 }}>Messages</h1><p style={{ margin:"4px 0 0", color:C.muted, fontSize:14 }}>Find your people and keep moving together.</p></div>
    {error && <div role="alert" style={{ padding:11, borderRadius:8, background:"#FEF2F2", color:"#991B1B", fontSize:13 }}>{error}</div>}
    <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Search people<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by @username or name" style={{ display:"block", width:"100%", marginTop:6, padding:12, border:`1px solid ${C.border}`, borderRadius:9, background:C.card, color:C.dark, font:"inherit" }} /></label>
    {results.length > 0 && <div style={{ display:"grid", gap:8 }}>{results.map(user => <div key={user.user_id} style={{ display:"flex", alignItems:"center", gap:10, padding:10, background:C.card, border:`1px solid ${C.border}`, borderRadius:10 }}><Avatar name={user.display_name} src={user.avatar_url} size={38}/><div style={{ flex:1 }}><strong style={{ color:C.dark }}>{user.display_name}</strong><div style={{ color:C.muted, fontSize:12 }}>@{user.username}</div></div><button type="button" onClick={() => toggleSocialFollow(user.user_id).then(result => setResults(current => current.map(item => item.user_id === user.user_id ? { ...item, following:result.following } : item)))} style={{ border:0, borderRadius:8, padding:"7px 10px", background:user.following ? C.surface : C.primary, color:user.following ? C.dark : "#fff", fontWeight:700, cursor:"pointer" }}>{user.following ? "Following" : "Follow"}</button><button type="button" onClick={() => chooseUser(user)} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", background:C.card, color:C.dark, fontWeight:700, cursor:"pointer" }}>Message</button></div>)}</div>}
    <div style={{ display:"grid", gridTemplateColumns:"minmax(120px, .8fr) minmax(0, 1.4fr)", gap:12, minHeight:360 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:10 }}><div style={{ color:C.dark, fontWeight:800, marginBottom:8 }}>Chats</div>{conversations.length === 0 ? <div style={{ color:C.muted, fontSize:12, padding:10 }}>No chats yet.</div> : conversations.map(chat => <button key={chat.id} type="button" onClick={() => setSelected({ ...chat, user_id:chat.user_id })} style={{ display:"flex", width:"100%", alignItems:"center", gap:8, border:0, background:selected?.id === chat.id ? C.surface : "transparent", borderRadius:8, padding:8, textAlign:"left", cursor:"pointer" }}><Avatar name={chat.display_name} src={chat.avatar_url} size={32}/><span style={{ minWidth:0, color:C.dark, fontSize:12, overflow:"hidden", textOverflow:"ellipsis" }}>{chat.display_name}</span></button>)}</div>
      <div style={{ display:"flex", flexDirection:"column", background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}>{selected ? <><div style={{ paddingBottom:10, borderBottom:`1px solid ${C.border}`, color:C.dark, fontWeight:800 }}>@{selected.username}</div><div style={{ flex:1, display:"flex", flexDirection:"column", gap:7, padding:"12px 0", overflowY:"auto" }}>{messages.map(message => <div key={message.id} style={{ alignSelf:message.sender_id === profile.user_id ? "flex-end" : "flex-start", maxWidth:"80%", padding:"8px 10px", borderRadius:10, background:message.sender_id === profile.user_id ? C.primary : C.surface, color:message.sender_id === profile.user_id ? "#fff" : C.dark, fontSize:13 }}>{message.body}</div>)}</div><form onSubmit={send} style={{ display:"flex", gap:8 }}><input value={body} onChange={e => setBody(e.target.value)} placeholder="Write a message..." style={{ flex:1, minWidth:0, padding:10, border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit" }}/><button type="submit" style={{ border:0, borderRadius:8, background:C.primary, color:"#fff", padding:"0 14px", fontWeight:700, cursor:"pointer" }}>Send</button></form></> : <div style={{ margin:"auto", textAlign:"center", color:C.muted, fontSize:13 }}>Search for someone to start a conversation.</div>}</div>
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
