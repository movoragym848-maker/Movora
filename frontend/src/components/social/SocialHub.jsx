import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { C } from "../../constants/data";
import { createSocialReel, getCallSignals, getFriendRequests, getSocialConversations, getSocialMessages, getSocialNotes, getSocialProfile, getSocialReels, respondToFriendRequest, saveSocialNote, saveSocialProfile, searchSocialProfiles, sendCallSignal, sendFriendRequest, sendSocialMessage, toggleSocialFollow } from "../../services/api";
import "./SocialHub.css";

const CallAudio = Capacitor.registerPlugin("CallAudio");

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const NOTE_TTL_MS = 25 * 60 * 60 * 1000;

function initials(name) {
  return (name || "Movora").split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ name, src, size = 42 }) {
  return src ? <img src={src} alt="" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", background:C.surface }} /> : <div aria-hidden="true" style={{ width:size, height:size, borderRadius:"50%", display:"grid", placeItems:"center", background:"#DBEAFE", color:C.primary, fontWeight:800 }}>{initials(name)}</div>;
}

function CallIcon({ type }) {
  if (type === "video") return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 8.5h1.2l4.3-2.5v12l-4.3-2.5H15zM3 7.5h12v9H3z" /></svg>;
  if (type === "hangup") return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5.1 8.7 2.2 2.2a1 1 0 0 0 1.1.2l1.5-.6a1 1 0 0 1 1.1.2l2 2a1 1 0 0 1 .2 1.1l-.6 1.5a1 1 0 0 0 .2 1.1l2.2 2.2a1 1 0 0 0 1.3.1l2-1.6a1 1 0 0 0 .2-1.3C15.6 9 15 8.4 7.2 4.5a1 1 0 0 0-1.3.2l-1.6 2a1 1 0 0 0 .1 1.3Z" /><path d="m4 4 16 16" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5.1 4.8a2 2 0 0 1 2.8-.1l2 1.8a2 2 0 0 1 .4 2.5L9.2 10a15 15 0 0 0 4.8 4.8l1-1.1a2 2 0 0 1 2.5-.4l1.8 2a2 2 0 0 1-.1 2.8l-1 1a2 2 0 0 1-2.1.4A17 17 0 0 1 4.7 8a2 2 0 0 1 .4-2.1z" /></svg>;
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
    <p style={{ margin:"0 0 20px", color:C.muted, fontSize:14 }}>Choose a unique ID so people can find you by username or display name.</p>
    {error && <div role="alert" style={{ marginBottom:14, padding:11, borderRadius:8, background:"#FEF2F2", color:"#991B1B", fontSize:13 }}>{error}</div>}
    <form onSubmit={submit} style={{ display:"grid", gap:12 }}>
      <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Unique social ID
        <div style={{ display:"flex", alignItems:"center", marginTop:6 }}><span style={{ padding:"10px 0 10px 11px", color:C.muted, background:C.surface, border:`1px solid ${C.border}`, borderRight:0, borderRadius:"8px 0 0 8px" }}>@</span><input required value={form.username} onChange={e => setForm(current => ({ ...current, username:e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30) }))} placeholder="your.username" style={{ flex:1, minWidth:0, padding:"10px 11px", border:`1px solid ${C.border}`, borderRadius:"0 8px 8px 0", background:C.surface, color:C.dark, font:"inherit" }} /></div>
      </label>
      <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Display name<input required minLength={2} maxLength={60} value={form.displayName} onChange={e => setForm(current => ({ ...current, displayName:e.target.value }))} placeholder="Your name" style={{ display:"block", width:"100%", marginTop:6, padding:"10px 11px", border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit" }} /></label>
      <label style={{ color:C.dark, fontSize:12, fontWeight:700 }}>Bio <span style={{ color:C.muted, fontWeight:500 }}>(optional)</span><textarea maxLength={160} rows={3} value={form.bio} onChange={e => setForm(current => ({ ...current, bio:e.target.value }))} placeholder="Your fitness focus" style={{ display:"block", width:"100%", marginTop:6, padding:"10px 11px", border:`1px solid ${C.border}`, borderRadius:8, background:C.surface, color:C.dark, font:"inherit", resize:"vertical" }} /></label>
      <button type="submit" disabled={saving} style={{ border:0, borderRadius:9, background:C.primary, color:"#fff", padding:12, fontWeight:700, cursor:saving ? "wait" : "pointer" }}>{saving ? "Creating..." : "Create Movora ID"}</button>
    </form>
  </div>;
}

export function CallPanel({ person, onError, incomingOnly = false }) {
  const [activePerson, setActivePerson] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [mediaType, setMediaType] = useState("audio");
  const [callError, setCallError] = useState("");
  const [held, setHeld] = useState(false);
  const [remoteHeld, setRemoteHeld] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ringAudioRef = useRef(null);
  const phaseRef = useRef("idle");
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const callIdRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const latestSignalRef = useRef(new Date(Date.now() - 30000).toISOString());
  const currentPerson = activePerson || person;

  const fail = (error, requestedType = mediaType) => {
    const errorName = error?.name || "UnknownError";
    const errorMessage = error?.message || "No browser error message was provided.";
    const diagnostics = `type=${requestedType}; name=${errorName}; message=${errorMessage}; secure=${window.isSecureContext}; mediaDevices=${Boolean(navigator.mediaDevices)}; getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}; platform=${navigator.platform || "unknown"}`;
    const message = error?.status === 404
      ? "Call signaling endpoint returned 404. Deploy the latest backend."
      : errorName === "NotAllowedError" || errorName === "PermissionDeniedError"
        ? `Capture permission failed for ${requestedType}.`
        : errorMessage;
    const fullMessage = `${message}\nDiagnostic: ${diagnostics}`;
    setCallError(fullMessage);
    onError(fullMessage);
  };
  const signal = (type, payload = {}) => currentPerson?.user_id
    ? sendCallSignal(currentPerson.user_id, type, { ...payload, callId:callIdRef.current }).catch(error => fail(error))
    : Promise.resolve();
  const clearCall = () => {
    if (ringAudioRef.current) {
      ringAudioRef.current.pause();
      ringAudioRef.current.currentTime = 0;
    }
    if (Capacitor.getPlatform() === "android") CallAudio.reset().catch(() => {});
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteStreamRef.current = null;
    incomingOfferRef.current = null;
    callIdRef.current = null;
    setActivePerson(null);
    setPhase("idle");
    setHeld(false);
    setRemoteHeld(false);
    setElapsed(0);
  };
  phaseRef.current = phase;
  const closeCall = (action = "hangup") => {
    signal("hangup", { action });
    clearCall();
  };
  const createPeer = async (requestedType, incomingOffer = null) => {
    if (peerRef.current) return peerRef.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This device does not support browser calls.");
    if (Capacitor.getPlatform() === "android") await CallAudio.start();
    const peer = new RTCPeerConnection({ iceServers:[{ urls:"stun:stun.l.google.com:19302" }] });
    peer.ontrack = event => {
      const remoteStream = event.streams[0];
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    peer.onicecandidate = event => { if (event.candidate) signal("candidate", event.candidate.toJSON()); };
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 },
      video: requestedType === "video" ? { facingMode:"user" } : false,
    });
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    localStreamRef.current = stream;
    peerRef.current = peer;
    setMediaType(requestedType);
    if (incomingOffer) {
      await peer.setRemoteDescription(incomingOffer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await signal("answer", answer);
      setPhase("connected");
    }
    return peer;
  };
  useEffect(() => {
    if (remoteStreamRef.current && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStreamRef.current;
    if (remoteStreamRef.current && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    if (localStreamRef.current && localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
  }, [phase, mediaType]);
  useEffect(() => {
    if (phase !== "connected") return undefined;
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "calling" && phase !== "incoming") return undefined;
    const ringtone = new Audio("/universfield-modern-phone-ring.mp3");
    ringtone.loop = true;
    ringtone.volume = 0.8;
    ringAudioRef.current = ringtone;
    ringtone.play().catch(() => {});
    return () => {
      ringtone.pause();
      ringtone.currentTime = 0;
      if (ringAudioRef.current === ringtone) ringAudioRef.current = null;
    };
  }, [phase]);
  const startCall = async requestedType => {
    setCallError("");
    callIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMediaType(requestedType);
    setPhase("calling");
    try {
      const peer = await createPeer(requestedType);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await signal("offer", { ...offer, mediaType:requestedType });
    } catch (error) { clearCall(); fail(error, requestedType); }
  };
  const acceptCall = async () => {
    const offer = incomingOfferRef.current;
    if (!offer) return;
    try { await createPeer(mediaType, offer); }
    catch (error) { clearCall(); fail(error, mediaType); }
  };
  const toggleHold = () => {
    const nextHeld = !held;
    localStreamRef.current?.getTracks().forEach(track => { track.enabled = !nextHeld; });
    setHeld(nextHeld);
    signal("hangup", { action:nextHeld ? "hold" : "resume" });
  };
  const toggleSpeaker = async () => {
    const nextSpeaker = !speaker;
    const element = mediaType === "video" ? remoteVideoRef.current : remoteAudioRef.current;
    if (Capacitor.getPlatform() === "android") {
      try { await CallAudio.setSpeaker({ enabled:nextSpeaker }); }
      catch (error) { setCallError(`Speaker routing is unavailable on this device. ${error.message || ""}`); return; }
    } else if (element?.setSinkId) {
      try { await element.setSinkId(nextSpeaker ? "default" : "communications"); }
      catch (error) { setCallError(`Speaker routing is unavailable on this device. ${error.message || ""}`); return; }
    }
    setSpeaker(nextSpeaker);
  };
  const toggleVideo = async () => {
    if (mediaType === "video") {
      localStreamRef.current?.getVideoTracks().forEach(track => track.stop());
      setMediaType("audio");
      return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"user" } });
      camera.getVideoTracks().forEach(track => {
        localStreamRef.current?.addTrack(track);
        peerRef.current?.addTrack(track, localStreamRef.current);
      });
      setMediaType("video");
      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);
      await signal("offer", { ...offer, mediaType:"video", renegotiation:true });
    } catch (error) { fail(error, "video"); }
  };
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const signals = await getCallSignals(latestSignalRef.current);
        for (const item of signals) {
          if (!mounted || seenSignalsRef.current.has(item.id) || (person?.user_id && item.sender_id !== person.user_id)) continue;
          seenSignalsRef.current.add(item.id);
          latestSignalRef.current = item.created_at;
          const incomingCallId = item.payload?.callId;
          if (item.signal_type !== "offer" && (!callIdRef.current || incomingCallId !== callIdRef.current)) continue;
          if (item.signal_type === "offer" && (!incomingCallId || (callIdRef.current && incomingCallId !== callIdRef.current))) continue;
          if (item.signal_type === "offer" && !peerRef.current && phaseRef.current === "idle" && incomingOnly) {
            callIdRef.current = incomingCallId;
            setActivePerson({ user_id:item.sender_id, username:item.sender_username, display_name:item.sender_display_name || "Movora member", avatar_url:item.sender_avatar_url });
            incomingOfferRef.current = item.payload;
            setMediaType(item.payload.mediaType || "audio");
            setPhase("incoming");
          } else if (item.signal_type === "offer" && peerRef.current && item.payload.renegotiation && peerRef.current.signalingState === "stable") {
            await peerRef.current.setRemoteDescription(item.payload);
            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);
            await signal("answer", answer);
            setMediaType(item.payload.mediaType || "video");
          } else if (item.signal_type === "answer" && peerRef.current && peerRef.current.signalingState === "have-local-offer") {
            await peerRef.current.setRemoteDescription(item.payload);
            setPhase("connected");
          } else if (item.signal_type === "candidate" && peerRef.current?.remoteDescription) {
            await peerRef.current.addIceCandidate(item.payload);
          } else if (item.signal_type === "hangup") {
            if (item.payload?.action === "hold") setRemoteHeld(true);
            else if (item.payload?.action === "resume") setRemoteHeld(false);
            else clearCall();
          }
        }
      } catch (error) { if (mounted && error?.status !== 404) setCallError(error.message); }
    };
    poll();
    const timer = window.setInterval(poll, 1000);
    return () => { mounted = false; window.clearInterval(timer); clearCall(); };
  }, [person?.user_id, incomingOnly]);
  if (phase === "idle") return !incomingOnly && currentPerson ? <div className="call-panel"><div className="call-actions"><button type="button" className="call-icon-button" onClick={() => startCall("audio")} aria-label="Start voice call" title="Voice call"><CallIcon type="audio" /></button><button type="button" className="call-icon-button" onClick={() => startCall("video")} aria-label="Start video call" title="Video call"><CallIcon type="video" /></button></div>{callError && <span className="call-error">{callError}</span>}</div> : null;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  return <div className="call-screen" role="dialog" aria-label={`${phase} ${mediaType} call`}>
    <div className="call-screen-top"><span className="call-screen-type">{mediaType === "video" ? "Video call" : "Voice call"}</span><span className="call-screen-time">{phase === "connected" ? `${minutes}:${seconds}` : phase === "incoming" ? "Incoming call" : "Calling..."}</span></div>
    <div className="call-screen-person"><Avatar name={currentPerson?.display_name} src={currentPerson?.avatar_url} size={92}/><h2>{currentPerson?.display_name || "Movora member"}</h2><p>{phase === "incoming" ? `Incoming ${mediaType} call` : phase === "calling" ? "Ringing..." : remoteHeld ? "Friend put the call on hold" : held ? "On hold" : "Connected"}</p></div>
    {mediaType === "video" && <div className="call-screen-media"><video ref={remoteVideoRef} autoPlay playsInline /><video className="call-screen-local" ref={localVideoRef} autoPlay muted playsInline /></div>}
    <audio ref={remoteAudioRef} autoPlay playsInline />
    {callError && <div className="call-screen-error">{callError}</div>}
    {phase === "incoming" ? <div className="incoming-actions"><button type="button" className="call-control accept-control" onClick={acceptCall} aria-label="Accept call">Accept</button><button type="button" className="call-control decline-control" onClick={() => closeCall("decline")} aria-label="Decline call">Decline</button></div> : phase === "calling" ? <button type="button" className="call-control decline-control call-cancel-control" onClick={() => closeCall()} aria-label="Cancel call">Cancel</button> : <div className="call-controls"><button type="button" className={`call-control${held ? " active-control" : ""}`} onClick={toggleHold}>{held ? "Resume" : "Hold"}</button><button type="button" className={`call-control${speaker ? " active-control" : ""}`} onClick={toggleSpeaker}>{speaker ? "Speaker on" : "Speaker off"}</button><button type="button" className="call-control" onClick={toggleVideo}>{mediaType === "video" ? "Voice" : "Video"}</button><button type="button" className="call-control decline-control" onClick={() => closeCall()} aria-label="End call"><CallIcon type="hangup" /></button></div>}
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
  const [requestAction, setRequestAction] = useState("");
  const [note, setNote] = useState("");
  const [friendNotes, setFriendNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const noteInputRef = useRef(null);
  const refreshConversations = () => getSocialConversations().then(setConversations).catch(err => setError(`${err.message} (${err.status || "network"})`));
  useEffect(() => { refreshConversations(); }, []);
  const refreshRequests = () => getFriendRequests().then(setRequests).catch(err => setError(err.message));
  useEffect(() => { refreshRequests(); }, []);
  useEffect(() => {
    let mounted = true;
    const loadNotes = () => getSocialNotes().then(notes => {
      if (!mounted) return;
      const ownNote = notes.find(item => item.user_id === profile.user_id);
      setNote(ownNote?.text || "");
      setFriendNotes(notes.filter(item => item.user_id !== profile.user_id));
    }).catch(() => {});
    loadNotes();
    const notesTimer = window.setInterval(loadNotes, 60000);
    return () => { mounted = false; window.clearInterval(notesTimer); };
  }, [profile.user_id]);
  useEffect(() => {
    if (!noteOpen) return undefined;
    const focusTimer = window.setTimeout(() => noteInputRef.current?.focus(), 240);
    return () => window.clearTimeout(focusTimer);
  }, [noteOpen]);
  useEffect(() => { if (query.trim().length < 2) return setResults([]); const timer = setTimeout(() => searchSocialProfiles(query).then(setResults).catch(err => setError(err.message)), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!selected || selected.newChat) return undefined;
    let mounted = true;
    let loading = false;
    const loadMessages = async () => {
      if (loading) return;
      loading = true;
      try {
        const latestMessages = await getSocialMessages(selected.id);
        if (mounted) setMessages(current => {
          const pending = current.filter(message => message.pending);
          return [...latestMessages, ...pending];
        });
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        loading = false;
      }
    };
    loadMessages();
    const timer = window.setInterval(loadMessages, 1000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [selected?.id, selected?.newChat]);
  const chooseUser = user => { setSelected({ ...user, id:user.user_id, newChat:true }); setMessages([]); setQuery(""); setResults([]); };
  const requestUser = async user => {
    try {
      const result = await sendFriendRequest(user.user_id);
      setResults(current => current.map(item => item.user_id === user.user_id ? { ...item, following:true, request_status:result.status === "accepted" ? "accepted" : "outgoing_pending" } : item));
      await refreshRequests();
    } catch (err) { setError(err.message); }
  };
  const respondToRequest = async (requestId, status, userId) => {
    if (requestAction) return;
    setRequestAction(requestId);
    try {
      const result = await respondToFriendRequest(requestId, status);
      setRequests(current => ({ ...current, incoming:current.incoming.map(item => item.id === requestId ? { ...item, status, following:result.following ?? item.following } : item) }));
      setResults(current => current.map(item => item.user_id === userId ? { ...item, request_status:status === "accepted" ? "accepted" : null, following:result.following ?? item.following } : item));
      await refreshRequests();
      await refreshConversations();
    } catch (err) { setError(err.message); }
    finally { setRequestAction(""); }
  };
  const followBack = async userId => {
    if (requestAction) return;
    setRequestAction(userId);
    try {
      const result = await toggleSocialFollow(userId);
      setRequests(current => ({ ...current, incoming:current.incoming.map(item => item.user_id === userId ? { ...item, following:result.following } : item) }));
      await refreshRequests();
    }
    catch (err) { setError(err.message); }
    finally { setRequestAction(""); }
  };
  const acceptedRequestChats = requests.outgoing.filter(request => request.status === "accepted").map(request => ({
    id:null,
    user_id:request.user_id,
    username:request.username,
    display_name:request.display_name,
    avatar_url:request.avatar_url,
  }));
  const chatRows = [...conversations, ...acceptedRequestChats.filter(request => !conversations.some(chat => chat.user_id === request.user_id))];
  const send = async event => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !selected) return;
    const pendingId = `pending-${Date.now()}`;
    const pendingMessage = { id:pendingId, sender_id:profile.user_id, body:text, created_at:new Date().toISOString(), pending:true };
    setMessages(current => [...current, pendingMessage]);
    setBody("");
    setError("");
    try {
      const data = await sendSocialMessage(selected.user_id, text);
      setMessages(current => current.map(message => message.id === pendingId ? data.message : message));
      setSelected(current => ({ ...current, id:data.conversationId, newChat:false }));
      refreshConversations();
    } catch (err) {
      setMessages(current => current.filter(message => message.id !== pendingId));
      setError(err.message);
    }
  };
  const openNote = () => { setNoteDraft(note); setNoteOpen(true); };
  const saveNote = async () => {
    const nextNote = noteDraft.trim().slice(0, 80);
    if (!nextNote) return;
    try {
      await saveSocialNote(nextNote);
      setNote(nextNote);
      setNoteOpen(false);
    } catch (err) { setError(err.message || "Unable to save your note."); }
  };
  return <div className="social-messages">
    <div className="messages-heading"><div><h1>Messages</h1><p>Train together, stay connected.</p></div><div className="messages-heading-actions">{noteOpen && <button type="button" className="note-save-action" onClick={saveNote}>Done</button>}<button type="button" className="requests-button" onClick={() => setRequestsOpen(current => !current)} aria-expanded={requestsOpen}>Requests{requests.incoming.filter(request => request.status === "pending").length > 0 && <span>{requests.incoming.filter(request => request.status === "pending").length}</span>}</button></div></div>
    {requestsOpen && <div className="requests-panel"><div className="requests-panel-heading"><strong>Friend requests</strong><button type="button" onClick={() => setRequestsOpen(false)} aria-label="Close friend requests">×</button></div>{requests.incoming.length > 0 ? <div className="request-group"><div className="request-label">Incoming</div>{requests.incoming.map(request => <div className="request-row" key={request.id}><Avatar name={request.display_name} src={request.avatar_url} size={38}/><div className="person-copy"><strong>{request.display_name}</strong><span>@{request.username}</span></div>{request.status === "pending" ? <button type="button" className="request-accept" disabled={requestAction === request.id} onClick={() => respondToRequest(request.id, "accepted", request.user_id)}>{requestAction === request.id ? "Accepting..." : "Accept"}</button> : <span className="request-pending">Accepted</span>}{request.following ? <span className="request-pending">Following</span> : <button type="button" className="request-accept" disabled={requestAction === request.user_id} onClick={() => followBack(request.user_id)}>{requestAction === request.user_id ? "Following..." : "Follow back"}</button>}</div>)}</div> : <p className="requests-empty">No incoming requests.</p>}{requests.outgoing.length > 0 && <div className="request-group"><div className="request-label">Sent</div>{requests.outgoing.map(request => <div className="request-row" key={request.id}><Avatar name={request.display_name} src={request.avatar_url} size={38}/><div className="person-copy"><strong>{request.display_name}</strong><span>@{request.username}</span></div><span className="request-pending">{request.status === "accepted" ? "Accepted" : "Pending"}</span></div>)}</div>}</div>}
    <div className="messages-search"><div className="search-field"><span aria-hidden="true">⌕</span><input id="people-search" aria-label="Search by username or name" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by @username or name" /></div></div>
    <div className="discover-row" aria-label="Discover people">
      <button type="button" className={`discover-item note-trigger${noteOpen ? " is-hidden" : ""}`} onClick={openNote} aria-label={note ? `Edit your note: ${note}` : "Write your note"}><div className="note-cloud-wrap">{note && <span className="note-cloud">{note}</span>}<div className="discover-avatar discover-note"><span>✦</span></div></div><strong>Your note</strong></button>
      {friendNotes.map(friendNote => <div className="discover-item" key={friendNote.user_id}><div className="note-cloud-wrap"><span className="note-cloud friend-note-cloud">{friendNote.text}</span><Avatar name={friendNote.display_name} src={friendNote.avatar_url} size={62}/></div><strong>{friendNote.display_name}</strong></div>)}
    </div>
    {noteOpen && <div className="note-overlay"><div className="note-composer" role="dialog" aria-label="Write your note"><div className="discover-avatar discover-note"><span>✦</span></div><input ref={noteInputRef} className="note-input" value={noteDraft} onChange={event => setNoteDraft(event.target.value.slice(0, 80))} maxLength={80} placeholder="What are you up to?" aria-label="Your note" /></div></div>}
    {error && <div role="alert" className="messages-error">{error}</div>}
    {results.length > 0 && <div className="people-results"><div className="section-label">People</div>{results.map(user => <div className="person-result" key={user.user_id}><Avatar name={user.display_name} src={user.avatar_url} size={46}/><div className="person-copy"><strong>{user.display_name}</strong><span>@{user.username} · {user.followers} followers</span></div>{user.request_status === "accepted" ? <button type="button" className="message-button" onClick={() => chooseUser(user)}>Message</button> : user.request_status === "outgoing_pending" ? <span className="request-pending">Requested</span> : user.request_status === "incoming_pending" ? <button type="button" className="request-accept" onClick={() => refreshRequests().then(() => setRequestsOpen(true))}>Review request</button> : <button type="button" className="message-button" onClick={() => requestUser(user)}>Add friend</button>}</div>)}</div>}
    <div className={`inbox-layout${selected ? " has-selection" : ""}`}>
      <section className="conversation-list"><div className="inbox-title"><h2>Chats</h2><span>{chatRows.length || ""}</span></div>{chatRows.length === 0 ? <div className="empty-chats"><span>○</span><p>Your conversations will appear here.</p><small>Search above to find a training partner.</small></div> : chatRows.map((chat, index) => <button className={`conversation-row${selected?.user_id === chat.user_id ? " active" : ""}`} key={chat.id || chat.user_id || index} type="button" onClick={() => setSelected({ ...chat, user_id:chat.user_id, newChat:!chat.id })}><Avatar name={chat.display_name} src={chat.avatar_url} size={50}/><span className="conversation-copy"><strong>{chat.display_name}</strong><small>@{chat.username}</small></span><span className="conversation-arrow">›</span></button>)}</section>
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
