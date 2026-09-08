import { useEffect, useRef, useState } from "react";
import { C } from "../../constants/data";

const CONFETTI_COLORS = [
  "#FF3366", "#FF6633", "#FFCC33", "#33FF66", "#33FFCC", 
  "#33CCFF", "#3366FF", "#CC33FF", "#FF33CC", "#FFD700",
  "#ADFF2F", "#00FFFF", "#FF4500", "#FF1493", "#8A2BE2"
];

const SHAPES = ["rect", "circle", "triangle"];

class ConfettiParticle {
  constructor(canvasWidth, canvasHeight, spawnPoint) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Spawn point: "left", "right", or "center"
    if (spawnPoint === "left") {
      this.x = 0;
      this.y = canvasHeight;
      this.vx = Math.random() * 12 + 6; // shoot right
      this.vy = -(Math.random() * 18 + 14); // shoot up
    } else if (spawnPoint === "right") {
      this.x = canvasWidth;
      this.y = canvasHeight;
      this.vx = -(Math.random() * 12 + 6); // shoot left
      this.vy = -(Math.random() * 18 + 14); // shoot up
    } else {
      // Center
      this.x = canvasWidth / 2;
      this.y = canvasHeight;
      this.vx = (Math.random() - 0.5) * 16; // shoot outward
      this.vy = -(Math.random() * 20 + 16); // shoot up
    }

    this.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    this.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    
    this.size = Math.random() * 8 + 6;
    this.width = this.size;
    this.height = this.size * (Math.random() * 0.4 + 0.8);
    this.radius = this.size / 2;

    this.gravity = Math.random() * 0.2 + 0.35;
    this.drag = Math.random() * 0.015 + 0.965; // slow down factor
    
    this.opacity = 1;
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 10;
    
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = Math.random() * 0.05 + 0.05;
    this.wobbleIntensity = Math.random() * 4 + 2;

    this.life = 0;
    this.maxLife = Math.random() * 50 + 130; // ~3 seconds at 60fps
  }

  update() {
    this.vx *= this.drag;
    this.vy += this.gravity;
    this.vy *= this.drag;

    // Apply wobble (sideways shimmeying)
    this.x += this.vx + Math.sin(this.wobble) * this.wobbleIntensity * 0.15;
    this.y += this.vy;

    this.wobble += this.wobbleSpeed;
    this.rotation += this.rotationSpeed;
    this.life++;

    // Fade out towards the end of life or if off screen
    if (this.life > this.maxLife * 0.7) {
      this.opacity = Math.max(0, 1 - (this.life - this.maxLife * 0.7) / (this.maxLife * 0.3));
    }
  }

  draw(ctx) {
    if (this.opacity <= 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;

    if (this.shape === "rect") {
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    } else if (this.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(this.width / 2, this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 2);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

const playTrumpetFanfare = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Helper to create a single brass/trumpet note
    const playTrumpetNote = (freq, startTime, duration, gainVal = 0.12) => {
      // Use dual sawtooth oscillators for a rich ensemble sound
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Slightly detune them to create a chorus/ensemble effect
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(freq, startTime);
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(freq + 4, startTime); // slightly detuned by a few Hz

      // Vibrato (LFO) for human-like trumpet shake
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 7.5; // 7.5 Hz vibrato
      lfoGain.gain.value = 1.8;   // pitch modulation depth
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      // Low-pass Filter for brassy tone sweep
      filter.type = "lowpass";
      filter.Q.value = 3.5; // High resonance for that sharp brass/horn punch
      filter.frequency.setValueAtTime(150, startTime);
      filter.frequency.exponentialRampToValueAtTime(3200, startTime + 0.08); // sharp attack sweep
      filter.frequency.exponentialRampToValueAtTime(1100, startTime + duration); // decay sweep

      // Amplitude envelope (ADSR)
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gainVal, startTime + 0.05); // quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // decay

      // Connections
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Start LFO & Oscillators
      lfo.start(startTime);
      osc1.start(startTime);
      osc2.start(startTime);

      lfo.stop(startTime + duration);
      osc1.stop(startTime + duration);
      osc2.stop(startTime + duration);
    };

    const now = ctx.currentTime;

    // Classic triumphant trumpet fanfare arpeggio:
    // G4 (392.00 Hz) ➔ C5 (523.25 Hz) ➔ E5 (659.25 Hz) ➔ Triumphant Major Chord!
    
    // Quick ascending arpeggio notes (staccato build-up)
    playTrumpetNote(392.00, now + 0.00, 0.18, 0.14); // G4
    playTrumpetNote(523.25, now + 0.10, 0.18, 0.14); // C5
    playTrumpetNote(659.25, now + 0.20, 0.18, 0.14); // E5

    // Big Triumphant Full Brass Chord!
    // Root C5 (523.25 Hz) + Third E5 (659.25 Hz) + Fifth G5 (783.99 Hz) + High Octave C6 (1046.50 Hz)
    playTrumpetNote(523.25, now + 0.30, 0.8, 0.10);  // Low Root
    playTrumpetNote(659.25, now + 0.30, 0.8, 0.10);  // Third
    playTrumpetNote(783.99, now + 0.30, 0.8, 0.12);  // Fifth
    playTrumpetNote(1046.50, now + 0.30, 1.0, 0.12); // High Octave Sparkle

    // A secondary trumpet plays a quick "ta-da!" harmony flourish right after
    playTrumpetNote(1046.50, now + 0.58, 0.16, 0.12); // C6
    playTrumpetNote(1318.51, now + 0.68, 0.50, 0.14); // E6 (harmony peak)

  } catch (e) {
    console.warn("Trumpet fanfare audio failed to initialize:", e);
  }
};

export default function ConfettiCanvas({ onComplete }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [congratsText, setCongratsText] = useState("AMAZING WORK!");

  const MOTIVATIONS = [
    "AMAZING WORK!",
    "YOU CRUSHED IT!",
    "KEEP IT UP!",
    "BEAST MODE ACTIVE!",
    "CONSISTENCY IS KEY!",
    "NO STOPPING YOU!",
    "LEVEL UP!",
    "FEEL THE BURN!"
  ];

  useEffect(() => {
    // Select a random motivational string
    setCongratsText(MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)]);

    // Play triumphant trumpet fanfare
    playTrumpetFanfare();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let particles = [];

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    // Initial bursts
    const numParticles = 180;
    for (let i = 0; i < numParticles; i++) {
      // Divide particles among spawn points
      let spawn = "center";
      if (i % 3 === 0) spawn = "left";
      if (i % 3 === 1) spawn = "right";
      particles.push(new ConfettiParticle(canvas.width, canvas.height, spawn));
    }

    // Animation Loop
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      // Filter out dead particles
      particles = particles.filter(p => p.opacity > 0 && p.y < canvas.height + 50 && p.x > -50 && p.x < canvas.width + 50);

      if (particles.length > 0) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        if (onComplete) onComplete();
      }
    };

    animationRef.current = requestAnimationFrame(tick);

    // Safety timeout to clean up after 3.5 seconds anyway
    const safetyTimeout = setTimeout(() => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (onComplete) onComplete();
    }, 3500);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(safetyTimeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes celebrate-pop-in-out {
          0% { transform: translate(-50%, -40%) scale(0.7); opacity: 0; }
          10% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
          14% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          88% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -60%) scale(0.85); opacity: 0; }
        }
        @keyframes bounce-emoji-celebrate {
          0% { transform: translateY(0) scale(1); }
          100% { transform: translateY(-12px) scale(1.2) rotate(8deg); }
        }
        .celebration-banner-wrapper {
          position: fixed;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10000;
          text-align: center;
          pointer-events: none;
          animation: celebrate-pop-in-out 3.2s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275);
          width: 90%;
          max-width: 400px;
        }
        .celebration-banner-card {
          background: rgba(255, 255, 255, 0.98);
          border: 2px solid ${C.primary};
          box-shadow: 0 24px 50px rgba(59, 130, 246, 0.28), 0 0 0 1px rgba(59, 130, 246, 0.05);
          border-radius: 24px;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .celebration-emoji {
          font-size: 52px;
          line-height: 1;
          display: inline-block;
          animation: bounce-emoji-celebrate 0.6s infinite alternate ease-in-out;
        }
        .celebration-title {
          margin: 0;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 32px;
          font-weight: 800;
          color: #1E3A5F;
          letter-spacing: 1.5px;
          line-height: 1.1;
        }
        .celebration-subtitle {
          margin: 0;
          font-family: 'Barlow', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: ${C.primary};
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      `}</style>
      
      {/* Full-screen Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9999,
          pointerEvents: "none"
        }}
      />

      {/* Pop-up Celebration Banner */}
      <div className="celebration-banner-wrapper">
        <div className="celebration-banner-card">
          <span className="celebration-emoji">🎉</span>
          <h2 className="celebration-title">{congratsText}</h2>
          <p className="celebration-subtitle">⚡ Workout Logged Successfully! ⚡</p>
        </div>
      </div>
    </>
  );
}
