"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

interface Connection {
  from: number;
  to: number;
  progress: number;
  active: boolean;
  timer: number;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    let connections: Connection[] = [];

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const count = Math.floor((canvas.width * canvas.height) / 18000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }

    function triggerConnection() {
      if (particles.length < 2) return;
      const from = Math.floor(Math.random() * particles.length);
      let to = from;
      let bestDist = Infinity;
      const maxDist = 200;

      for (let i = 0; i < particles.length; i++) {
        if (i === from) continue;
        const dx = particles[i].x - particles[from].x;
        const dy = particles[i].y - particles[from].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist && dist < bestDist) {
          bestDist = dist;
          to = i;
        }
      }

      if (to !== from) {
        connections.push({ from, to, progress: 0, active: true, timer: 0 });
      }
    }

    const connectionInterval = setInterval(triggerConnection, 800);

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas!.width;
        if (p.x > canvas!.width) p.x = 0;
        if (p.y < 0) p.y = canvas!.height;
        if (p.y > canvas!.height) p.y = 0;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
        ctx!.fill();
      }

      for (let i = connections.length - 1; i >= 0; i--) {
        const c = connections[i];
        const pFrom = particles[c.from];
        const pTo = particles[c.to];
        if (!pFrom || !pTo) {
          connections.splice(i, 1);
          continue;
        }

        if (c.active) {
          c.progress = Math.min(c.progress + 0.04, 1);
          if (c.progress >= 1) {
            c.active = false;
          }
        } else {
          c.timer += 0.02;
          if (c.timer > 1) {
            connections.splice(i, 1);
            continue;
          }
        }

        const alpha = c.active ? c.progress * 0.6 : (1 - c.timer) * 0.6;
        const endX = pFrom.x + (pTo.x - pFrom.x) * (c.active ? c.progress : 1);
        const endY = pFrom.y + (pTo.y - pFrom.y) * (c.active ? c.progress : 1);

        const grad = ctx!.createLinearGradient(pFrom.x, pFrom.y, endX, endY);
        grad.addColorStop(0, `rgba(0, 212, 255, ${alpha})`);
        grad.addColorStop(1, `rgba(0, 229, 160, ${alpha})`);

        ctx!.beginPath();
        ctx!.moveTo(pFrom.x, pFrom.y);
        ctx!.lineTo(endX, endY);
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = 1;
        ctx!.stroke();

        if (c.active) {
          ctx!.beginPath();
          ctx!.arc(endX, endY, 2, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(0, 229, 160, ${alpha})`;
          ctx!.fill();
        }
      }

      animationId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      clearInterval(connectionInterval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
