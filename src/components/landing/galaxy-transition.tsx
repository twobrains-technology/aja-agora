"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";

interface GalaxyTransitionProps {
  active: boolean;
  onComplete: () => void;
}

export function GalaxyTransition({ active, onComplete }: GalaxyTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      color: string;
    }> = [];

    const colors = [
      "rgba(96, 130, 255,",  // primary blue
      "rgba(130, 170, 255,", // light blue
      "rgba(200, 220, 255,", // white-blue
      "rgba(160, 140, 255,", // purple-blue
    ];

    // Create particles bursting from center
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    for (let i = 0; i < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      particles.push({
        x: cx + (Math.random() - 0.5) * 100,
        y: cy + (Math.random() - 0.5) * 100,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1 + Math.random() * 3,
        alpha: 0.6 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let frame = 0;
    const totalFrames = 50;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background glow
      const glowProgress = Math.min(frame / 20, 1);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.6);
      gradient.addColorStop(0, `rgba(96, 130, 255, ${0.15 * glowProgress})`);
      gradient.addColorStop(0.5, `rgba(96, 130, 255, ${0.05 * glowProgress})`);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.alpha *= 0.97;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();

        // Trail
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
        ctx.strokeStyle = `${p.color}${p.alpha * 0.3})`;
        ctx.lineWidth = p.size * 0.5;
        ctx.stroke();
      }

      if (frame < totalFrames) {
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [active, onComplete]);

  if (!active) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%" }}
      />
    </motion.div>
  );
}
