import React, { useRef, useState } from 'react';
import { ArrowLeft, Check, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { CapturedPhoto } from '../types/filter';

interface Props {
  photos: CapturedPhoto[];
  onRetake: () => void;
  onUsePhoto: (photo: CapturedPhoto) => void;
}

export const ReviewScreen: React.FC<Props> = ({ photos, onRetake, onUsePhoto }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const activePhoto = photos[selectedIndex] || photos[0];
  if (!activePhoto) return null;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoomScale((prev) => Math.min(4, Math.max(1, prev + delta)));
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (zoomScale <= 1) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragStartRef.current = { x: clientX - panPos.x, y: clientY - panPos.y };
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || zoomScale <= 1) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setPanPos({
      x: clientX - dragStartRef.current.x,
      y: clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const resetZoom = () => {
    setZoomScale(1);
    setPanPos({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full h-[100dvh] bg-[#FFF9FB] text-[#3D242E] flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-white/95 border-b border-rose-100">
        <button
          type="button"
          onClick={onRetake}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-2xl text-xs font-semibold text-[#3D242E] min-h-[42px]"
        >
          <ArrowLeft className="w-4 h-4 text-rose-500" />
          <span>Chụp lại</span>
        </button>

        <div className="text-center">
          <div className="text-xs font-bold text-[#3D242E]">Xem lại ảnh nè</div>
          <div className="text-[11px] text-[#8C6B77] tabular-nums">
            {activePhoto.width} × {activePhoto.height} px
            {photos.length > 1 && ` · Ảnh ${selectedIndex + 1}/${photos.length}`}
          </div>
        </div>

        {/* Quick Zoom toggle */}
        <div className="flex items-center gap-1 bg-rose-50 border border-rose-100 rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setZoomScale((prev) => Math.max(1, prev - 0.5))}
            disabled={zoomScale <= 1}
            className="p-1.5 text-[#8C6B77] hover:text-[#3D242E] disabled:opacity-30 rounded-xl"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="text-[11px] font-mono tabular-nums px-1.5 text-rose-500 font-bold"
          >
            {Math.round(zoomScale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoomScale((prev) => Math.min(4, prev + 0.5))}
            disabled={zoomScale >= 4}
            className="p-1.5 text-[#8C6B77] hover:text-[#3D242E] disabled:opacity-30 rounded-xl"
            title="Phóng to"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Viewer */}
      <div
        className="relative flex-1 flex items-center justify-center p-3 sm:p-6 bg-[#F7EDF1] overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <div
          className="relative max-w-full max-h-full transition-transform duration-75 ease-out flex items-center justify-center"
          style={{
            transform: `translate(${panPos.x}px, ${panPos.y}px) scale(${zoomScale})`,
          }}
        >
          <img
            src={activePhoto.dataUrl}
            alt="Ảnh vừa chụp"
            className="max-h-[72vh] max-w-[90vw] object-contain rounded-2xl shadow-xl shadow-rose-900/10 border border-rose-200/70 pointer-events-none"
          />
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="relative z-20 flex flex-col bg-white border-t border-rose-100 px-4 pb-safe pt-2">
        {photos.length > 1 && (
          <div className="flex items-center justify-center gap-2 py-2 overflow-x-auto no-scrollbar">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedIndex(idx);
                  resetZoom();
                }}
                className={`relative w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all shrink-0 ${
                  selectedIndex === idx
                    ? 'border-rose-500 scale-105 shadow-md shadow-rose-200'
                    : 'border-rose-100 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={p.dataUrl} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white bg-rose-500/90 px-1.5 rounded-full">
                  {idx + 1}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 py-3 max-w-lg mx-auto w-full">
          <button
            type="button"
            onClick={onRetake}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[#3D242E] font-bold text-sm rounded-2xl transition-all active:scale-[0.98] min-h-[48px]"
          >
            <RotateCcw className="w-4 h-4 text-rose-500" />
            <span>Chụp lại</span>
          </button>

          <button
            type="button"
            onClick={() => onUsePhoto(activePhoto)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm rounded-2xl shadow-lg shadow-rose-300/60 transition-all active:scale-[0.98] min-h-[48px]"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Chỉnh màu ngay</span>
          </button>
        </div>
      </div>
    </div>
  );
};
