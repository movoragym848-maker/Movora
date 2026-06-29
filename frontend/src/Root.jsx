import { useState, useEffect } from "react";
import AuthScreen from "./components/auth/AuthScreen";
import GymOwnerDashboard from "./components/gym-owner/GymOwnerDashboard";
import App from "./App";
import OfflineScreen from "./components/error/OfflineScreen";
import ErrorBoundary from "./components/error/ErrorBoundary";
import APIErrorDisplay from "./components/error/APIErrorDisplay";
import Onboarding from "./components/onboarding/Onboarding";

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
    if (session.accountType === "gym_owner") {
      try {
        localStorage.setItem("rs_gym_owner_session", JSON.stringify(session));
        localStorage.removeItem("rs_session");
      } catch {}
      setGymOwner(session.gymOwner);
      setUser(null);
      return;
    }
    try {
      localStorage.setItem("rs_session", JSON.stringify(session));
      localStorage.removeItem("rs_gym_owner_session");
    } catch {}
    setUser(session.user || session);
    setGymOwner(null);
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
    ? <GymOwnerDashboard gymOwner={gymOwner} onLogout={handleLogout}/>
    : !user 
    ? <AuthScreen onAuth={handleAuth}/> 
    : <App user={user} onLogout={handleLogout}/>;

  return (
    <ErrorBoundary>
      <OfflineScreen />
      <APIErrorDisplay />
      {appContent}
    </ErrorBoundary>
  );
}
