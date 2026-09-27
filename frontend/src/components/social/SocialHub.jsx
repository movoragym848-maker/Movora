import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { C } from "../../constants/data";
import { getCallSignals, getFriendRequests, getSocialConversations, getSocialMessages, getSocialNotes, getSocialProfile, getSocialTyping, respondToFriendRequest, saveSocialNote, saveSocialProfile, searchSocialProfiles, sendCallSignal, sendFriendRequest, sendSocialMessage, setSocialTyping, toggleSocialFollow } from "../../services/api";
import "./SocialHub.css";
import ReelsExperience from "./ReelsExperience";

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
  const [muted, setMuted] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [speaker, setSpeaker] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ringAudioRef = useRef(null);
  const phaseRef = useRef("idle");
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteMediaStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const videoTransceiverRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const callIdRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const latestSignalRef = useRef(new Date(Date.now() - 5000).toISOString());
  const pollingRef = useRef(false);
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
    remoteMediaStreamRef.current = null;
    videoTransceiverRef.current = null;
    incomingOfferRef.current = null;
    callIdRef.current = null;
    setActivePerson(null);
    setPhase("idle");
    setHeld(false);
    setRemoteHeld(false);
    setMuted(false);
    setCameraFacing("user");
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
    if (requestedType === "video") videoTransceiverRef.current = peer.addTransceiver("video", { direction:"recvonly" });
    peer.ontrack = event => {
      const remoteStream = event.streams[0] || remoteMediaStreamRef.current || new MediaStream();
      if (!event.streams[0]) remoteStream.addTrack(event.track);
      remoteMediaStreamRef.current = remoteStream;
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1;
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    peer.onicecandidate = event => { if (event.candidate) signal("candidate", event.candidate.toJSON()); };
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 },
      video: requestedType === "video" ? { facingMode:"user" } : false,
    });
    stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
    if (requestedType === "video") {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTransceiverRef.current) {
        await videoTransceiverRef.current.sender.replaceTrack(videoTrack);
        videoTransceiverRef.current.direction = "sendrecv";
      }
    }
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
    if (remoteStreamRef.current && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1;
      remoteAudioRef.current.play().catch(() => {});
    }
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
    peerRef.current?.getSenders().forEach(sender => {
      if (sender.track) sender.track.enabled = !nextHeld;
    });
    localStreamRef.current?.getTracks().forEach(track => { track.enabled = !nextHeld; });
    if (remoteAudioRef.current) remoteAudioRef.current.muted = nextHeld;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = nextHeld;
      if (nextHeld) remoteVideoRef.current.pause();
      else remoteVideoRef.current.play().catch(() => {});
    }
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
  const toggleMute = () => {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !nextMuted; });
    peerRef.current?.getSenders().forEach(sender => {
      if (sender.track?.kind === "audio") sender.track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  };
  const flipCamera = async () => {
    if (mediaType !== "video" || !peerRef.current || !localStreamRef.current) return;
    setCallError("");
    try {
      const nextFacing = cameraFacing === "user" ? "environment" : "user";
      const camera = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ exact:nextFacing } } });
      const videoTrack = camera.getVideoTracks()[0];
      if (!videoTrack || !videoTransceiverRef.current || !peerRef.current) throw new Error("Camera did not provide a video track.");
      await videoTransceiverRef.current.sender.replaceTrack(videoTrack);
      localStreamRef.current.getVideoTracks().forEach(track => track.stop());
      localStreamRef.current.addTrack(videoTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setCameraFacing(nextFacing);
    } catch (error) { fail(error, "camera flip"); }
  };
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
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
          } else if (item.signal_type === "answer" && peerRef.current && peerRef.current.signalingState === "have-local-offer") {
            await peerRef.current.setRemoteDescription(item.payload);
            setPhase("connected");
          } else if (item.signal_type === "candidate" && peerRef.current?.remoteDescription) {
            await peerRef.current.addIceCandidate(item.payload);
          } else if (item.signal_type === "hangup") {
            if (item.payload?.action === "hold") {
              setRemoteHeld(true);
              if (remoteAudioRef.current) remoteAudioRef.current.muted = true;
              if (remoteVideoRef.current) {
                remoteVideoRef.current.muted = true;
                remoteVideoRef.current.pause();
              }
            } else if (item.payload?.action === "resume") {
              setRemoteHeld(false);
              if (remoteAudioRef.current) remoteAudioRef.current.muted = false;
              if (remoteVideoRef.current) {
                remoteVideoRef.current.muted = false;
                remoteVideoRef.current.play().catch(() => {});
              }
            }
            else clearCall();
          }
        }
      } catch (error) {
        const message = String(error?.message || "").toLowerCase();
        const transient = error?.isNetworkError || message.includes("network") || message.includes("failed to fetch") || message.includes("timeout") || message.includes("502") || message.includes("503");
        if (mounted && !transient && error?.status !== 404) setCallError(error.message);
      } finally {
        pollingRef.current = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, 1000);
    return () => { mounted = false; window.clearInterval(timer); clearCall(); };
  }, [person?.user_id, incomingOnly]);
  if (phase === "idle") return !incomingOnly && currentPerson ? <div className="call-panel"><div className="call-actions"><button type="button" className="call-icon-button" onClick={() => startCall("audio")} aria-label="Start voice call" title="Voice call"><CallIcon type="audio" /></button><button type="button" className="call-icon-button" onClick={() => startCall("video")} aria-label="Start video call" title="Video call"><CallIcon type="video" /></button></div>{callError && <span className="call-error">{callError}</span>}</div> : null;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  return <div className={`call-screen${mediaType === "video" ? " call-screen-video" : ""}`} role="dialog" aria-label={`${phase} ${mediaType} call`}>
    <div className="call-screen-top"><span className="call-screen-type">{mediaType === "video" ? "Video call" : "Voice call"}</span><span className="call-screen-time">{phase === "connected" ? `${minutes}:${seconds}` : phase === "incoming" ? "Incoming call" : "Calling..."}</span></div>
    <div className={`call-screen-person${mediaType === "video" && phase === "connected" ? " video-connected-person" : ""}`}><Avatar name={currentPerson?.display_name} src={currentPerson?.avatar_url} size={92}/><h2>{currentPerson?.display_name || "Movora member"}</h2><p>{phase === "incoming" ? `Incoming ${mediaType} call` : phase === "calling" ? "Ringing..." : remoteHeld ? "Friend put the call on hold" : held ? "On hold" : "Connected"}</p></div>
    {mediaType === "video" && phase === "connected" && <div className="call-screen-media"><video ref={remoteVideoRef} autoPlay playsInline /><video className="call-screen-local" ref={localVideoRef} autoPlay muted playsInline /></div>}
    <audio ref={remoteAudioRef} autoPlay playsInline onCanPlay={event => event.currentTarget.play().catch(() => {})} />
    {callError && <div className="call-screen-error">{callError}</div>}
    {phase === "incoming" ? <div className="incoming-actions"><button type="button" className="call-control accept-control" onClick={acceptCall} aria-label="Accept call">Accept</button><button type="button" className="call-control decline-control" onClick={() => closeCall("decline")} aria-label="Decline call">Decline</button></div> : phase === "calling" ? <button type="button" className="call-control decline-control call-cancel-control" onClick={() => closeCall()} aria-label="Cancel call">Cancel</button> : <div className="call-controls"><button type="button" className={`call-control${held ? " active-control" : ""}`} onClick={toggleHold}>{held ? "Resume" : "Hold"}</button><button type="button" className={`call-control${speaker ? " active-control" : ""}`} onClick={toggleSpeaker}>{speaker ? "Speaker on" : "Speaker off"}</button><button type="button" className={`call-control${muted ? " active-control" : ""}`} onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>{mediaType === "video" && <button type="button" className="call-control" onClick={flipCamera}>Flip camera</button>}<button type="button" className="call-control decline-control" onClick={() => closeCall()} aria-label="End call"><CallIcon type="hangup" /></button></div>}
  </div>;
}

function Messages({ profile }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otherTyping, setOtherTyping] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState({ incoming:[], outgoing:[] });
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestAction, setRequestAction] = useState("");
  const [note, setNote] = useState("");
  const [friendNotes, setFriendNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const noteInputRef = useRef(null);
  const messageHistoryRef = useRef(null);
  const messageInputRef = useRef(null);
  const shouldScrollToLatestRef = useRef(true);
  const typingUserRef = useRef(null);
  const typingHeartbeatRef = useRef(null);
  const typingTimeoutRef = useRef(null);
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
        const [latestMessages, typingStatus] = await Promise.all([
          getSocialMessages(selected.id),
          getSocialTyping(selected.id).catch(() => ({ typing:false })),
        ]);
        if (mounted) {
          setOtherTyping(typingStatus.typing);
          setMessages(current => {
            const pending = current.filter(message => message.pending);
            return [...latestMessages, ...pending];
          });
        }
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
  useLayoutEffect(() => {
    const history = messageHistoryRef.current;
    if (!history || messages.length === 0) return;
    const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 80;
    if (shouldScrollToLatestRef.current || nearBottom) history.scrollTop = history.scrollHeight;
    shouldScrollToLatestRef.current = false;
  }, [messages, otherTyping]);
  useEffect(() => {
    shouldScrollToLatestRef.current = true;
    setOtherTyping(false);
  }, [selected?.user_id]);
  useEffect(() => () => {
    if (typingHeartbeatRef.current) window.clearInterval(typingHeartbeatRef.current);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    const userId = typingUserRef.current;
    typingUserRef.current = null;
    if (userId) setSocialTyping(userId, false).catch(() => {});
  }, [selected?.user_id]);
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
  const stopTyping = () => {
    if (typingHeartbeatRef.current) window.clearInterval(typingHeartbeatRef.current);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingHeartbeatRef.current = null;
    typingTimeoutRef.current = null;
    const userId = typingUserRef.current;
    typingUserRef.current = null;
    if (userId) setSocialTyping(userId, false).catch(() => {});
  };
  const updateDraft = value => {
    setBody(value);
    if (!selected || !value.trim()) {
      stopTyping();
      return;
    }
    if (typingUserRef.current !== selected.user_id) {
      stopTyping();
      typingUserRef.current = selected.user_id;
      const announce = () => setSocialTyping(selected.user_id, true).then(result => {
        setSelected(current => current?.user_id === selected.user_id && current.newChat
          ? { ...current, id:result.conversationId, newChat:false }
          : current);
      }).catch(() => {});
      announce();
      typingHeartbeatRef.current = window.setInterval(announce, 2000);
    }
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(stopTyping, 1400);
  };
  const send = async event => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !selected) return;
    const pendingId = `pending-${Date.now()}`;
    const pendingMessage = { id:pendingId, sender_id:profile.user_id, body:text, created_at:new Date().toISOString(), pending:true };
    setMessages(current => [...current, pendingMessage]);
    setBody("");
    stopTyping();
    window.requestAnimationFrame(() => messageInputRef.current?.focus());
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
      {friendNotes.map(friendNote => <button type="button" className="discover-item friend-note-item" key={friendNote.user_id} onClick={() => setSelectedNote(friendNote)} aria-label={`Read ${friendNote.display_name}'s note`}><div className="note-cloud-wrap"><span className="note-cloud friend-note-cloud">{friendNote.text}</span><Avatar name={friendNote.display_name} src={friendNote.avatar_url} size={62}/></div><strong>{friendNote.display_name}</strong></button>)}
    </div>
    {noteOpen && <div className="note-overlay"><div className="note-composer" role="dialog" aria-label="Write your note"><div className="discover-avatar discover-note"><span>✦</span></div><input ref={noteInputRef} className="note-input" value={noteDraft} onChange={event => setNoteDraft(event.target.value.slice(0, 80))} maxLength={80} placeholder="What are you up to?" aria-label="Your note" /></div></div>}
    {selectedNote && <div className="note-overlay" onClick={() => setSelectedNote(null)}><div className="note-viewer" role="dialog" aria-label={`${selectedNote.display_name}'s note`} onClick={event => event.stopPropagation()}><Avatar name={selectedNote.display_name} src={selectedNote.avatar_url} size={76}/><strong>{selectedNote.display_name}</strong><p>{selectedNote.text}</p><button type="button" onClick={() => setSelectedNote(null)}>Close</button></div></div>}
    {error && <div role="alert" className="messages-error">{error}</div>}
    {results.length > 0 && <div className="people-results"><div className="section-label">People</div>{results.map(user => <div className="person-result" key={user.user_id}><Avatar name={user.display_name} src={user.avatar_url} size={46}/><div className="person-copy"><strong>{user.display_name}</strong><span>@{user.username} · {user.followers} followers</span></div>{user.request_status === "accepted" ? <button type="button" className="message-button" onClick={() => chooseUser(user)}>Message</button> : user.request_status === "outgoing_pending" ? <span className="request-pending">Requested</span> : user.request_status === "incoming_pending" ? <button type="button" className="request-accept" onClick={() => refreshRequests().then(() => setRequestsOpen(true))}>Review request</button> : <button type="button" className="message-button" onClick={() => requestUser(user)}>Add friend</button>}</div>)}</div>}
    <div className={`inbox-layout${selected ? " has-selection" : ""}`}>
      <section className="conversation-list"><div className="inbox-title"><h2>Chats</h2><span>{chatRows.length || ""}</span></div>{chatRows.length === 0 ? <div className="empty-chats"><span>○</span><p>Your conversations will appear here.</p><small>Search above to find a training partner.</small></div> : chatRows.map((chat, index) => <button className={`conversation-row${selected?.user_id === chat.user_id ? " active" : ""}`} key={chat.id || chat.user_id || index} type="button" onClick={() => { setMessages([]); setSelected({ ...chat, user_id:chat.user_id, newChat:!chat.id }); }}><Avatar name={chat.display_name} src={chat.avatar_url} size={50}/><span className="conversation-copy"><strong>{chat.display_name}</strong><small>@{chat.username}</small></span><span className="conversation-arrow">›</span></button>)}</section>
      {selected && <section className="conversation-panel"><div className="conversation-header"><button className="back-button" type="button" onClick={() => setSelected(null)} aria-label="Back to chats">‹</button><Avatar name={selected.display_name} src={selected.avatar_url} size={42}/><div><strong>{selected.display_name}</strong><small>@{selected.username}</small></div></div><CallPanel person={selected} onError={setError}/><div className="message-history" ref={messageHistoryRef}>{messages.length === 0 && <div className="new-conversation">Start a conversation with <strong>{selected.display_name}</strong>.</div>}{messages.map(message => <div className={`message-bubble${message.sender_id === profile.user_id ? " mine" : ""}`} key={message.id}>{message.body}</div>)}{otherTyping && <div className="typing-indicator" role="status" aria-label={`${selected.display_name} is typing`}><div className="typing-scene" aria-hidden="true"><div className="teddy"><span className="teddy-ear teddy-ear-left"/><span className="teddy-ear teddy-ear-right"/><span className="teddy-head"><i className="teddy-eye teddy-eye-left"/><i className="teddy-eye teddy-eye-right"/><i className="teddy-muzzle"/><i className="teddy-nose"/></span><span className="teddy-body"/><span className="teddy-leg teddy-leg-left"/><span className="teddy-leg teddy-leg-right"/><span className="teddy-arm teddy-arm-left"/><span className="teddy-arm teddy-arm-right"/></div><div className="teddy-laptop"><span className="laptop-screen"><i/><i/><i/></span><span className="laptop-base"/></div></div><span className="typing-caption">typing</span></div>}</div><form onSubmit={send} className="message-composer"><input ref={messageInputRef} value={body} onChange={e => updateDraft(e.target.value)} placeholder="Write a message..." aria-label="Write a message"/><button type="submit" aria-label="Send message">↑</button></form></section>}
    </div>
  </div>;
}

export default function SocialHub({ mode, user }) {
  const [profile, setProfile] = useState(undefined);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getSocialProfile().then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div style={{ padding:50, textAlign:"center", color:C.muted }}>Loading Movora social...</div>;
  if (!profile) return <AccountSetup initial={{ ...emptyProfile, displayName:user.name }} onSaved={setProfile}/>;
  return mode === "reels" ? <ReelsExperience/> : <Messages profile={profile}/>;
}
