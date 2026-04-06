'use client';

import { useRef, useEffect } from 'react';

interface Node {
  x: number; y: number; vx: number; vy: number; r: number; hue: string;
}

export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;
    const nodes: Node[] = [];
    let animId: number;

    function resize() {
      W = canvas!.width = canvas!.offsetWidth;
      H = canvas!.height = canvas!.offsetHeight;
    }
    window.addEventListener('resize', resize);

    for (let i = 0; i < 40; i++) {
      nodes.push({
        x: Math.random() * (W || 800),
        y: Math.random() * (H || 600),
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 2 + Math.random() * 3,
        hue: Math.random() > 0.5 ? '168,201,160' : '212,160,160',
      });
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.15;
            ctx!.beginPath();
            ctx!.strokeStyle = `rgba(212,160,160,${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.stroke();
          }
        }
      }
      nodes.forEach(n => {
        ctx!.beginPath();
        ctx!.fillStyle = `rgba(${n.hue},0.5)`;
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.beginPath();
        ctx!.fillStyle = `rgba(${n.hue},0.15)`;
        ctx!.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
        ctx!.fill();
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none opacity-60" />;
}
