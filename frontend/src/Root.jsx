import { useState, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
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
  const [sharedReel, setSharedReel] = useState(() => ({
    id: new URLSearchParams(window.location.search).get("reel"),
    version: 0,
  }));

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;
    let urlListener;
    const handleUrl = incomingUrl => {
      try {
        const url = new URL(incomingUrl);
        if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "movora-production.up.railway.app") return;
        const reelId = url.searchParams.get("reel");
        if (!reelId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reelId)) return;
        const appUrl = new URL(window.location.href);
        appUrl.searchParams.set("reel", reelId);
        window.history.replaceState({}, "", `${appUrl.pathname}${appUrl.search}${appUrl.hash}`);
        setSharedReel(current => ({ id:reelId, version:current.version + 1 }));
      } catch {}
    };

    CapacitorApp.addListener("appUrlOpen", event => handleUrl(event.url)).then(listener => {
      if (active) urlListener = listener;
      else listener.remove();
    });
    CapacitorApp.getLaunchUrl().then(launch => {
      if (active && launch?.url) handleUrl(launch.url);
    }).catch(() => {});

    return () => {
      active = false;
      urlListener?.remove();
    };
  }, []);

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

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <Onboarding onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    );
  }

  const appContent = gymOwner 
    ? <GymOwnerDashboard gymOwner={gymOwner} onLogout={handleLogout} sharedReel={sharedReel}/>
    : !user 
    ? <AuthScreen onAuth={handleAuth}/> 
    : <App user={user} onLogout={handleLogout} sharedReel={sharedReel}/>;

  return (
    <ErrorBoundary>
      <OfflineScreen />
      <APIErrorDisplay />
      <div>{appContent}</div>
    </ErrorBoundary>
  );
}
