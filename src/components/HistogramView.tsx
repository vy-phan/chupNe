import React, { useEffect, useRef, useState } from 'react';
import { computeHistogram, HistogramData } from '../engine/curveUtils';

interface Props {
  sourceImage: HTMLImageElement | HTMLCanvasElement | null;
}

export const HistogramView: React.FC<Props> = ({ sourceImage }) => {
  const [histData, setHistData] = useState<HistogramData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!sourceImage) return;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 160;
    sampleCanvas.height = 120;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      ctx.drawImage(sourceImage, 0, 0, 160, 120);
      const imgData = ctx.getImageData(0, 0, 160, 120);
      const computed = computeHistogram(imgData);
      setHistData(computed);
    } catch {
      // image not ready
    }
  }, [sourceImage]);

  useEffect(() => {
    if (!histData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Soft blush cream background
    ctx.fillStyle = '#FFF9FB';
    ctx.fillRect(0, 0, w, h);

    const maxVal = histData.max || 1;

    ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
    for (let i = 0; i < 256; i++) {
      const barH = (histData.r[i] / maxVal) * (h - 4);
      const x = (i / 256) * w;
      ctx.fillRect(x, h - barH, w / 256 + 1, barH);
    }

    ctx.fillStyle = 'rgba(16, 185, 129, 0.32)';
    for (let i = 0; i < 256; i++) {
      const barH = (histData.g[i] / maxVal) * (h - 4);
      const x = (i / 256) * w;
      ctx.fillRect(x, h - barH, w / 256 + 1, barH);
    }

    ctx.fillStyle = 'rgba(59, 130, 246, 0.32)';
    for (let i = 0; i < 256; i++) {
      const barH = (histData.b[i] / maxVal) * (h - 4);
      const x = (i / 256) * w;
      ctx.fillRect(x, h - barH, w / 256 + 1, barH);
    }

    ctx.strokeStyle = 'rgba(61, 36, 46, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const y = h - (histData.lum[i] / maxVal) * (h - 4);
      const x = (i / 256) * w;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [histData]);

  if (!histData) return null;

  return (
    <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-2.5">
      <div className="flex items-center justify-between mb-1.5 text-[11px] text-[#8C6B77] font-medium">
        <span>Biểu đồ ánh sáng</span>
        <div className="flex items-center gap-2 text-[10px] font-bold">
          <span className="text-rose-500">R</span>
          <span className="text-emerald-600">G</span>
          <span className="text-blue-500">B</span>
          <span className="text-[#3D242E]">L</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={256} height={56} className="w-full h-14 rounded-xl border border-rose-100" />
    </div>
  );
};
