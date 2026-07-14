import { useState, useEffect } from "react";
import AuthScreen from "./components/auth/AuthScreen";
import GymOwnerDashboard from "./components/gym-owner/GymOwnerDashboard";
import App from "./App";
import OfflineScreen from "./components/error/OfflineScreen";
import ErrorBoundary from "./components/error/ErrorBoundary";
import APIErrorDisplay from "./components/error/APIErrorDisplay";
import Onboarding from "./components/onboarding/Onboarding";
import { C } from "./constants/data";

export default function Root() {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      const hasSeenOnboarding = localStorage.getItem("rs_onboarding_completed");
      return !hasSeenOnboarding; // Show onboarding if not completed
    } catch {
      return true;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const v = localStorage.getItem("rs_session");
      if (!v) return null;
      const p = JSON.parse(v);
      const storedUser = p?.user || p;
      if (!storedUser || !storedUser.email || !storedUser.name) { localStorage.removeItem("rs_session"); return null; }
      return storedUser;
    } catch { localStorage.removeItem("rs_session"); return null; }
  });
  const [gymOwner, setGymOwner] = useState(() => {
    try {
      const v = localStorage.getItem("rs_gym_owner_session");
      if (!v) return null;
      const p = JSON.parse(v);
      const storedGymOwner = p?.gymOwner || p;
      if (!storedGymOwner || !storedGymOwner.email || !storedGymOwner.gymName) { localStorage.removeItem("rs_gym_owner_session"); return null; }
      return storedGymOwner;
    } catch { localStorage.removeItem("rs_gym_owner_session"); return null; }
  });

  const handleAuth = session => {
    try {
      if (!session) {
        console.error("handleAuth: Session is null or undefined");
        return;
      }

      if (session.accountType === "gym_owner") {
        if (!session.gymOwner || !session.gymOwner.email) {
          console.error("handleAuth: Invalid gym owner data", session.gymOwner);
          return;
        }
        try {
          localStorage.setItem("rs_gym_owner_session", JSON.stringify(session));
          localStorage.removeItem("rs_session");
        } catch (e) {
          console.error("Failed to save gym owner session:", e);
        }
        setGymOwner(session.gymOwner);
        setUser(null);
        return;
      }

      // Member/User session
      const userData = session.user || session;
      if (!userData || !userData.email || !userData.name) {
        console.error("handleAuth: Invalid user data", userData);
        return;
      }
      
      try {
        localStorage.setItem("rs_session", JSON.stringify(session));
        localStorage.removeItem("rs_gym_owner_session");
      } catch (e) {
        console.error("Failed to save user session:", e);
      }
      setUser(userData);
      setGymOwner(null);
    } catch (err) {
      console.error("handleAuth error:", err);
    }
  };
  const handleLogout = () => {
    try {
      localStorage.removeItem("rs_session");
      localStorage.removeItem("rs_gym_owner_session");
    } catch {}
    setUser(null);
    setGymOwner(null);
  };

  const handleOnboardingComplete = () => {
    try {
      localStorage.setItem("rs_onboarding_completed", "true");
    } catch {}
    setShowOnboarding(false);
  };

  const [showUIMarker, setShowUIMarker] = useState(() => {
    try { return localStorage.getItem("rs_ui_marker_dismissed") !== "1"; } catch { return true; }
  });

  const dismissUIMarker = () => {
    try { localStorage.setItem("rs_ui_marker_dismissed", "1"); } catch {}
    setShowUIMarker(false);
  };

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <Onboarding onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    );
  }

  const appContent = gymOwner 
    ? <GymOwnerDashboard gymOwner={gymOwner} onLogout={handleLogout}/>
    : !user 
    ? <AuthScreen onAuth={handleAuth}/> 
    : <App user={user} onLogout={handleLogout}/>;

  return (
    <ErrorBoundary>
      <OfflineScreen />
      <APIErrorDisplay />
      {showUIMarker && (
        <div style={{ position:"fixed", left:12, right:12, top:12, zIndex:2000, display:"flex", justifyContent:"center" }}>
          <div style={{ background: C.primary, color: "#fff", padding: "8px 14px", borderRadius: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.06)", fontWeight:700, display:"flex", gap:12, alignItems:"center", fontFamily:"'Barlow',sans-serif" }}>
            <div>Updated UI — progress-chart-v2</div>
            <div style={{ fontSize:12, opacity:0.9 }}>{new Date().toLocaleString()}</div>
            <button onClick={dismissUIMarker} style={{ marginLeft:8, border:"none", background:"rgba(255,255,255,0.14)", color:"#fff", padding:"6px 8px", borderRadius:8, cursor:"pointer", fontWeight:700 }}>Dismiss</button>
          </div>
        </div>
      )}
      <div style={{ paddingTop: showUIMarker ? 56 : 0 }}>{appContent}</div>
    </ErrorBoundary>
  );
}
