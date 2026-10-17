import { useEffect, useState } from "react";
import { getSocialProfile } from "../../services/api";
import VerifiedBadge from "../social/VerifiedBadge";

export default function GymOwnerSocialProfile({ gymOwner, onCreateProfile, onViewPosts }) {
  const [profile, setProfile] = useState(undefined);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    getSocialProfile()
      .then(data => { if (active) setProfile(data); })
      .catch(err => { if (active) setError(err.message || "Unable to load your Movora social profile."); });
    return () => { active = false; };
  }, [reloadKey]);

  if (error) {
    return <div role="alert" style={{ marginBottom:16, padding:14, borderRadius:12, background:"#FEF2F2", color:"#991B1B", fontSize:13 }}>
      {error}
      <button type="button" onClick={() => setReloadKey(current => current + 1)} style={{ display:"block", marginTop:10, border:0, borderRadius:8, padding:"8px 12px", background:"#3B82F6", color:"#fff", fontWeight:700, cursor:"pointer" }}>Try again</button>
    </div>;
  }

  if (profile === undefined) {
    return <div role="status" style={{ marginBottom:16, padding:24, textAlign:"center", color:"#6B7280" }}>Loading your Movora profile...</div>;
  }

  if (!profile) {
    return <section style={{ marginBottom:18, padding:20, border:"1px solid #E5E7EB", borderRadius:14, background:"#fff" }}>
      <h2 style={{ margin:"0 0 6px", color:"#1F2937", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22 }}>Movora Social Profile</h2>
      <p style={{ margin:"0 0 14px", color:"#6B7280", fontSize:13 }}>Create your gym's social profile to connect with the Movora community.</p>
      <button type="button" onClick={onCreateProfile} style={{ border:0, borderRadius:9, padding:"10px 14px", background:"#3B82F6", color:"#fff", fontWeight:700, cursor:"pointer" }}>Create social profile</button>
    </section>;
  }

  return <section style={{ marginBottom:18, padding:18, border:"1px solid #E6C56F", borderRadius:14, background:"linear-gradient(120deg,#FFF9E8,#FFFFFF 68%)", boxShadow:"0 4px 14px rgba(184,138,35,.08)" }}>
    <h2 style={{ margin:"0 0 14px", color:"#1F2937", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22 }}>Movora Social Profile</h2>
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt="" style={{ width:76, height:76, flexShrink:0, borderRadius:"50%", objectFit:"cover", border:"3px solid #D6AD42" }} />
        : <div aria-hidden="true" style={{ width:76, height:76, flexShrink:0, display:"grid", placeItems:"center", borderRadius:"50%", border:"3px solid #D6AD42", background:"#DBEAFE", color:"#3B82F6", fontSize:24, fontWeight:800 }}>{(profile.display_name || gymOwner.gymName).split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase()}</div>}
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ color:"#1F2937", fontSize:19, fontWeight:800, overflowWrap:"anywhere" }}>{profile.display_name}<VerifiedBadge accountType="gym_owner" /></div>
        <div style={{ marginTop:3, color:"#8B6B19", fontSize:13, fontWeight:600 }}>@{profile.username}</div>
        <p style={{ margin:"7px 0 0", color:"#6B7280", fontSize:13, overflowWrap:"anywhere" }}>{profile.bio || "No bio added yet."}</p>
      </div>
    </div>
    <div style={{ display:"flex", gap:24, marginTop:16 }}>
      {[["Posts", profile.posts], ["Followers", profile.followers], ["Following", profile.following]].map(([label, value]) => (
        <div key={label} style={{ display:"grid", gap:2 }}>
          <strong style={{ color:"#1F2937", fontSize:16 }}>{value}</strong>
          <span style={{ color:"#6B7280", fontSize:11 }}>{label}</span>
        </div>
      ))}
    </div>
    <button type="button" onClick={onViewPosts} style={{ marginTop:14, padding:0, border:0, background:"transparent", color:"#3B82F6", fontSize:13, fontWeight:700, cursor:"pointer" }}>View my posts →</button>
  </section>;
}
