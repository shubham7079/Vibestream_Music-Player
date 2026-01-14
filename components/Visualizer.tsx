
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isPlaying: boolean;
  volume: number;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, volume }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let offset = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const mid = height / 2;
      
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6366f1';
      ctx.lineCap = 'round';

      // Simulate wave logic
      const speed = isPlaying ? 0.05 + (volume / 200) : 0.005;
      const amplitude = isPlaying ? 15 + (volume / 5) : 2;

      for (let x = 0; x < width; x += 2) {
        const y = mid + Math.sin(x * 0.02 + offset) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
      
      // Secondary glow wave
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 10;
      for (let x = 0; x < width; x += 2) {
        const y = mid + Math.sin(x * 0.015 - offset * 0.8) * (amplitude * 1.5);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      offset += speed;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, volume]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={60} 
      className="w-full opacity-60 pointer-events-none"
    />
  );
};
