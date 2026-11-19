import React, { useEffect, useRef, useState } from 'react';
import { getAspectRatioNumeric, getCropPixelRect } from '../engine/cropUtils';
import { CropAspectPreset, CropRegion } from '../types/filter';

interface Props {
  crop: CropRegion;
  aspectPreset: CropAspectPreset;
  imgWidth: number;
  imgHeight: number;
  onChange: (next: CropRegion) => void;
  onCommit: (finalCrop: CropRegion) => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

const MIN_NORM = 0.08;

export const CropOverlay: React.FC<Props> = ({
  crop,
  aspectPreset,
  imgWidth,
  imgHeight,
  onChange,
  onCommit,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRegion;
    rect: DOMRect;
    latestCrop: CropRegion;
  } | null>(null);

  const lockedPixelRatio = getAspectRatioNumeric(aspectPreset, imgWidth, imgHeight);
  const imgRatio = imgHeight > 0 ? imgWidth / imgHeight : 1;
  const normRatio = lockedPixelRatio !== null ? lockedPixelRatio / imgRatio : null;

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      e.preventDefault();

      const pixelDx = e.clientX - ds.startX;
      const pixelDy = e.clientY - ds.startY;
      const dx = pixelDx / Math.max(1, ds.rect.width);
      const dy = pixelDy / Math.max(1, ds.rect.height);
      const s = ds.startCrop;
      let next: CropRegion = { ...s };

      if (ds.mode === 'move') {
        next = {
          x: Math.max(0, Math.min(1 - s.width, s.x + dx)),
          y: Math.max(0, Math.min(1 - s.height, s.y + dy)),
          width: s.width,
          height: s.height,
        };
      } else if (normRatio !== null) {
        // Locked aspect ratio corner resize
        const isLeft = ds.mode === 'nw' || ds.mode === 'sw';
        const isTop = ds.mode === 'nw' || ds.mode === 'ne';

        const anchorX = isLeft ? s.x + s.width : s.x;
        const anchorY = isTop ? s.y + s.height : s.y;

        const maxW = isLeft ? anchorX : 1 - anchorX;
        const maxH = isTop ? anchorY : 1 - anchorY;

        const minW = Math.max(MIN_NORM, MIN_NORM * normRatio);
        const effMaxW = Math.max(minW, Math.min(maxW, maxH * normRatio));

        const rawW = isLeft ? s.width - dx : s.width + dx;
        const rawH = isTop ? s.height - dy : s.height + dy;
        const candidateW =
          Math.abs(pixelDx) >= Math.abs(pixelDy) ? rawW : rawH * normRatio;

        const w = Math.max(minW, Math.min(effMaxW, candidateW));
        const h = w / normRatio;

        next = {
          x: isLeft ? anchorX - w : anchorX,
          y: isTop ? anchorY - h : anchorY,
          width: w,
          height: h,
        };
      } else {
        // Freeform resize (corners and edges)
        let left = s.x;
        let top = s.y;
        let right = s.x + s.width;
        let bottom = s.y + s.height;

        if (ds.mode.includes('w')) {
          left = Math.max(0, Math.min(right - MIN_NORM, s.x + dx));
        }
        if (ds.mode.includes('e')) {
          right = Math.min(1, Math.max(left + MIN_NORM, s.x + s.width + dx));
        }
        if (ds.mode.includes('n')) {
          top = Math.max(0, Math.min(bottom - MIN_NORM, s.y + dy));
        }
        if (ds.mode.includes('s')) {
          bottom = Math.min(1, Math.max(top + MIN_NORM, s.y + s.height + dy));
        }

        next = {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        };
      }

      ds.latestCrop = next;
      onChange(next);
    };

    const handlePointerUp = () => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const finalCrop = ds.latestCrop;
      dragStateRef.current = null;
      setIsDragging(false);
      onCommit(finalCrop);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [normRatio, onChange, onCommit]);

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragStateRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      rect,
      latestCrop: { ...crop },
    };
    setIsDragging(true);
  };

  const pixelRect = getCropPixelRect(imgWidth, imgHeight, crop);
  const isFree = normRatio === null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden rounded-2xl touch-none select-none z-20"
    >
      {/* Crop Window with Outer Dimmed Backdrop */}
      <div
        onPointerDown={(e) => startDrag('move', e)}
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
          boxShadow: '0 0 0 9999px rgba(43, 23, 32, 0.56)',
        }}
        className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(244,63,94,0.45)]"
      >
        {/* Rule of Thirds Grid Lines */}
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
            isDragging ? 'opacity-80' : 'opacity-40'
          }`}
        >
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/75" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/75" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/75" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/75" />
        </div>

        {/* Live Dimension Pill inside top of crop frame */}
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#2B1720]/70 backdrop-blur-sm text-[10px] font-mono tabular-nums font-semibold text-white whitespace-nowrap shadow-sm">
          {pixelRect.sw} × {pixelRect.sh}
        </div>

        {/* 4 Corner Handles (40x40 invisible hit area for effortless touch) */}
        <button
          type="button"
          aria-label="Kéo góc trên trái"
          onPointerDown={(e) => startDrag('nw', e)}
          className="absolute -top-4 -left-4 w-9 h-9 flex items-center justify-center cursor-nwse-resize touch-none"
        >
          <span className="w-4 h-4 border-t-[3.5px] border-l-[3.5px] border-rose-400 bg-transparent rounded-tl-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] translate-x-1.5 translate-y-1.5" />
        </button>

        <button
          type="button"
          aria-label="Kéo góc trên phải"
          onPointerDown={(e) => startDrag('ne', e)}
          className="absolute -top-4 -right-4 w-9 h-9 flex items-center justify-center cursor-nesw-resize touch-none"
        >
          <span className="w-4 h-4 border-t-[3.5px] border-r-[3.5px] border-rose-400 rounded-tr-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] -translate-x-1.5 translate-y-1.5" />
        </button>

        <button
          type="button"
          aria-label="Kéo góc dưới trái"
          onPointerDown={(e) => startDrag('sw', e)}
          className="absolute -bottom-4 -left-4 w-9 h-9 flex items-center justify-center cursor-nesw-resize touch-none"
        >
          <span className="w-4 h-4 border-b-[3.5px] border-l-[3.5px] border-rose-400 rounded-bl-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] translate-x-1.5 -translate-y-1.5" />
        </button>

        <button
          type="button"
          aria-label="Kéo góc dưới phải"
          onPointerDown={(e) => startDrag('se', e)}
          className="absolute -bottom-4 -right-4 w-9 h-9 flex items-center justify-center cursor-nwse-resize touch-none"
        >
          <span className="w-4 h-4 border-b-[3.5px] border-r-[3.5px] border-rose-400 rounded-br-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] -translate-x-1.5 -translate-y-1.5" />
        </button>

        {/* 4 Edge Handles in Freeform Mode */}
        {isFree && (
          <>
            <button
              type="button"
              aria-label="Kéo cạnh trên"
              onPointerDown={(e) => startDrag('n', e)}
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-10 h-7 flex items-center justify-center cursor-ns-resize touch-none"
            >
              <span className="w-6 h-1.5 rounded-full bg-white ring-1 ring-rose-400 shadow-sm" />
            </button>
            <button
              type="button"
              aria-label="Kéo cạnh dưới"
              onPointerDown={(e) => startDrag('s', e)}
              className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-10 h-7 flex items-center justify-center cursor-ns-resize touch-none"
            >
              <span className="w-6 h-1.5 rounded-full bg-white ring-1 ring-rose-400 shadow-sm" />
            </button>
            <button
              type="button"
              aria-label="Kéo cạnh trái"
              onPointerDown={(e) => startDrag('w', e)}
              className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-10 flex items-center justify-center cursor-ew-resize touch-none"
            >
              <span className="w-1.5 h-6 rounded-full bg-white ring-1 ring-rose-400 shadow-sm" />
            </button>
            <button
              type="button"
              aria-label="Kéo cạnh phải"
              onPointerDown={(e) => startDrag('e', e)}
              className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-10 flex items-center justify-center cursor-ew-resize touch-none"
            >
              <span className="w-1.5 h-6 rounded-full bg-white ring-1 ring-rose-400 shadow-sm" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
