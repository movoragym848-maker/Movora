import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { C } from "../../constants/data";
import { checkIn } from "../../services/api";

function parseGymPayload(payload) {
  const value = payload.trim();
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.gym_id === "string") return parsed.gym_id;
    if (typeof parsed?.gymId === "string") return parsed.gymId;
  } catch {
    // Plain GYM_<uuid> payloads are supported below.
  }
  if (value.startsWith("GYM_")) return value.slice(4).trim();
  return null;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location services are not available on this device"));
    navigator.geolocation.getCurrentPosition(resolve, error => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Location permission is required to check in"
        : "Unable to get your current location";
      reject(new Error(message));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

function playCheckInSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    masterGain.connect(audioContext.destination);

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const noteGain = audioContext.createGain();
      const noteStart = now + index * 0.13;
      oscillator.type = index === 2 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.exponentialRampToValueAtTime(index === 2 ? 0.42 : 0.28, noteStart + 0.035);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.55);
      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.6);
    });

    window.setTimeout(() => audioContext.close().catch(() => {}), 1500);
  } catch {
    // Audio is an enhancement; a blocked audio context must not affect check-in.
  }
}

export default function CheckInScreen({ onClose }) {
  const scannerRef = useRef(null);
  const [scannerError, setScannerError] = useState("");
  const [message, setMessage] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [successTime, setSuccessTime] = useState("");

  useEffect(() => {
    if (successTime) playCheckInSuccessSound();
  }, [successTime]);

  useEffect(() => {
    const scanner = new Html5Qrcode("movora-qr-reader");
    scannerRef.current = scanner;
    let handled = false;
    const scanConfig = { fps: 10, qrbox: { width: 280, height: 280 } };

    Html5Qrcode.getCameras()
      .then(cameras => {
        if (!cameras.length) throw new Error("No camera was found on this device");
        const rearCamera = cameras.find(camera => /back|rear|environment/i.test(camera.label));
        return scanner.start(
          (rearCamera || cameras[0]).id,
          scanConfig,
          async decodedText => {
        if (handled) return;
        handled = true;
        setCheckingIn(true);
        setScannerError("");
        setMessage("QR code found. Confirming your location...");
        try {
          await scanner.stop();
          const gymId = parseGymPayload(decodedText);
          if (!gymId) throw new Error("This is not a valid Movora gym QR code");
          const position = await getCurrentPosition();
          const result = await checkIn({
            gym_id: gymId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          const formattedTime = new Date(result.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setSuccessTime(formattedTime);
          setMessage(`Check-in successful at ${formattedTime}`);
        } catch (error) {
          setMessage("");
          setScannerError(error.status === 404
            ? "Attendance service is not deployed yet. Please deploy the updated Movora backend."
            : error.message || "Check-in failed");
        } finally {
          setCheckingIn(false);
        }
          },
          () => {}
        );
      })
      .catch(error => {
        const permissionError = /permission|notallowed|denied/i.test(error?.message || "");
        setPermissionDenied(permissionError);
        setScannerError(permissionError
          ? "Camera permission is required. Allow camera access in Android settings and tap retry."
          : error?.message || "Unable to start the camera");
      });

    return () => {
      if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, []);

  const retry = () => window.location.reload();

  return (
    <section style={{ position: "fixed", inset: 0, zIndex: 100, background: "#000", overflow: "hidden" }}>
      <style>{`
        #movora-qr-reader,
        #movora-qr-reader video {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          object-fit: cover !important;
        }
        #movora-qr-reader video { display: block !important; }
      `}</style>
      <div id="movora-qr-reader" style={{ position: "absolute", inset: 0, width: "100vw", height: "100dvh" }} />
      {successTime && <div className="check-in-success" role="status" aria-live="polite">
        <style>{`
          @keyframes checkInSuccessIn {
            0% { opacity: 0; transform: scale(0.76) translateY(18px); }
            70% { opacity: 1; transform: scale(1.04) translateY(-2px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes checkInRing {
            0% { transform: scale(0.65); opacity: 0.8; }
            100% { transform: scale(1.5); opacity: 0; }
          }
          @keyframes checkInSpark {
            0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.45; }
            50% { transform: translateY(-14px) rotate(12deg); opacity: 1; }
          }
          @keyframes checkInCheck {
            0% { stroke-dashoffset: 48; }
            100% { stroke-dashoffset: 0; }
          }
          .check-in-success {
            position: absolute;
            inset: 0;
            z-index: 5;
            display: grid;
            place-items: center;
            padding: 24px;
            background: linear-gradient(145deg, rgba(4, 18, 28, 0.94), rgba(8, 55, 58, 0.94));
            animation: checkInSuccessIn 520ms cubic-bezier(.2,.8,.2,1) both;
          }
          .check-in-success__content { position: relative; width: min(100%, 360px); text-align: center; color: #fff; }
          .check-in-success__badge { position: relative; width: 126px; height: 126px; margin: 0 auto 28px; display: grid; place-items: center; }
          .check-in-success__badge::before,
          .check-in-success__badge::after { content: ""; position: absolute; inset: 0; border: 1px solid rgba(91, 239, 190, 0.75); border-radius: 50%; animation: checkInRing 1.8s ease-out infinite; }
          .check-in-success__badge::after { animation-delay: 620ms; }
          .check-in-success__circle { position: relative; z-index: 1; width: 94px; height: 94px; display: grid; place-items: center; border-radius: 50%; background: #55e5b3; box-shadow: 0 0 0 8px rgba(85, 229, 179, 0.13), 0 18px 50px rgba(85, 229, 179, 0.34); }
          .check-in-success__circle svg { width: 54px; height: 54px; }
          .check-in-success__circle path { fill: none; stroke: #063b3d; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 48; stroke-dashoffset: 48; animation: checkInCheck 500ms 250ms ease-out forwards; }
          .check-in-success__spark { position: absolute; color: #ffd166; font-size: 18px; animation: checkInSpark 1.5s ease-in-out infinite; }
          .check-in-success__spark:nth-child(1) { top: 4px; left: 6px; animation-delay: 100ms; }
          .check-in-success__spark:nth-child(2) { top: 22px; right: 0; font-size: 13px; animation-delay: 480ms; }
          .check-in-success__spark:nth-child(3) { bottom: 7px; left: 19px; font-size: 12px; animation-delay: 760ms; }
          .check-in-success h2 { margin: 0; font-family: 'Barlow Condensed', sans-serif; font-size: 42px; letter-spacing: 0.02em; line-height: 0.95; }
          .check-in-success p { margin: 14px 0 0; color: rgba(255,255,255,0.72); font-size: 16px; }
          .check-in-success__time { display: inline-block; margin-top: 22px; padding: 9px 15px; border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; color: #b8ffe5; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
          .check-in-success__close { margin-top: 38px; padding: 13px 24px; border: 0; border-radius: 999px; background: #fff; color: #073b3d; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 10px 24px rgba(0,0,0,0.2); }
          @media (prefers-reduced-motion: reduce) { .check-in-success, .check-in-success__badge::before, .check-in-success__badge::after, .check-in-success__spark, .check-in-success__circle path { animation-duration: 1ms; animation-iteration-count: 1; } }
        `}</style>
        <div className="check-in-success__content">
          <div className="check-in-success__badge" aria-hidden="true">
            <span className="check-in-success__spark">✦</span>
            <span className="check-in-success__spark">✦</span>
            <span className="check-in-success__spark">✦</span>
            <div className="check-in-success__circle">
              <svg viewBox="0 0 54 54"><path d="M14 28.5 23 37l18-20" /></svg>
            </div>
          </div>
          <h2>YOU'RE IN</h2>
          <p>Attendance locked in. Time to make today count.</p>
          <span className="check-in-success__time">Checked in at {successTime}</span>
          <br />
          <button type="button" className="check-in-success__close" onClick={onClose}>Back to Movora</button>
        </div>
      </div>}
      <button type="button" onClick={onClose} aria-label="Close QR scanner" style={{ position: "absolute", top: "max(18px, env(safe-area-inset-top))", left: 18, zIndex: 3, width: 46, height: 46, border: "none", borderRadius: "50%", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 30, lineHeight: 1, cursor: "pointer" }}>×</button>
      <div aria-hidden="true" style={{ position: "absolute", inset: "50% auto auto 50%", width: "min(72vw, 300px)", aspectRatio: "1", transform: "translate(-50%, -50%)", border: "2px solid rgba(255,255,255,0.9)", borderRadius: 18, pointerEvents: "none", boxShadow: "0 0 0 999px rgba(0,0,0,0.28)" }} />
      {(message || scannerError) && <div role="status" aria-live="polite" style={{ position: "absolute", left: 18, right: 18, bottom: "max(92px, env(safe-area-inset-bottom) + 72px)", zIndex: 4, padding: "12px 14px", borderRadius: 10, background: scannerError ? "rgba(127, 29, 29, 0.9)" : "rgba(0, 0, 0, 0.72)", color: "#fff", textAlign: "center", fontSize: 14, fontWeight: 600 }}>
        {message || scannerError || "Camera ready"}
      </div>}
      {(permissionDenied || scannerError) && <button type="button" onClick={retry} aria-label="Try camera again" style={{ position: "absolute", left: "50%", bottom: "max(24px, env(safe-area-inset-bottom))", transform: "translateX(-50%)", width: 48, height: 48, border: "none", background: "rgba(255,255,255,0.9)", color: C.primary, borderRadius: "50%", cursor: "pointer", fontSize: 22 }}>↻</button>}
      {checkingIn && <div aria-hidden="true" style={{ position: "absolute", top: 18, right: 18, width: 12, height: 12, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 5px rgba(255,255,255,0.25)" }} />}
    </section>
  );
}
