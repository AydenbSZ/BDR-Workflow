import { useMemo } from "react";

/**
 * Floating particles + lightning lines + orbs background.
 * Pure CSS animations, no JS timers.
 */
export default function AnimatedBackground() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 20,
      color: Math.random() > 0.6 ? "#8b5cf6" : "#00e1ed",
    })), []);

  const lightnings = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 60}%`,
      width: `${Math.random() * 200 + 80}px`,
      rotation: Math.random() * 40 - 20,
      duration: Math.random() * 6 + 4,
      delay: Math.random() * 10,
    })), []);

  return (
    <div className="particles-bg">
      {/* Ambient orbs */}
      <div className="orb" style={{ width: 400, height: 400, top: "10%", left: "5%", background: "#8b5cf6" }} />
      <div className="orb" style={{ width: 300, height: 300, top: "60%", right: "10%", background: "#00e1ed", animationDelay: "-7s" }} />
      <div className="orb" style={{ width: 250, height: 250, bottom: "5%", left: "40%", background: "#0088ff", animationDelay: "-14s" }} />

      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* Lightning lines */}
      {lightnings.map((l) => (
        <div
          key={l.id}
          className="lightning-line"
          style={{
            top: l.top,
            left: l.left,
            width: l.width,
            transform: `rotate(${l.rotation}deg)`,
            animationDuration: `${l.duration}s`,
            animationDelay: `${l.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
