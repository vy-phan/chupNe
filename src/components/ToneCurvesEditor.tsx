import React, { useRef, useState } from 'react';
import { buildCurveLookupTable } from '../engine/curveUtils';
import { CurvePoint, ToneCurveParams } from '../types/filter';

interface Props {
  curves: ToneCurveParams;
  onChange: (updated: ToneCurveParams) => void;
}

type Channel = 'master' | 'r' | 'g' | 'b';

export const ToneCurvesEditor: React.FC<Props> = ({ curves, onChange }) => {
  const [activeChannel, setActiveChannel] = useState<Channel>('master');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const currentPoints = curves[activeChannel] || [[0, 0], [255, 255]];

  const lut = buildCurveLookupTable(currentPoints);
  let pathD = `M 0 ${255 - lut[0]}`;
  for (let i = 1; i < 256; i++) {
    pathD += ` L ${i} ${255 - lut[i]}`;
  }

  const channelColors: Record<Channel, { stroke: string; fill: string; label: string; activeClass: string }> = {
    master: { stroke: '#F43F5E', fill: '#F43F5E', label: 'Tổng', activeClass: 'bg-rose-500 text-white shadow-xs' },
    r: { stroke: '#EF4444', fill: '#EF4444', label: 'Đỏ', activeClass: 'bg-red-50 text-red-600 border-red-200' },
    g: { stroke: '#10B981', fill: '#10B981', label: 'Lục', activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    b: { stroke: '#3B82F6', fill: '#3B82F6', label: 'Lam', activeClass: 'bg-blue-50 text-blue-600 border-blue-200' },
  };

  const getSvgCoordinates = (e: React.MouseEvent | React.TouchEvent): [number, number] | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = Math.max(0, Math.min(255, Math.round(((clientX - rect.left) / rect.width) * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (clientY - rect.top) / rect.height) * 255)));
    return [x, y];
  };

  const handlePointerDown = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e);
    if (!coords) return;
    const [x, y] = coords;

    let foundIdx = -1;
    for (let i = 0; i < currentPoints.length; i++) {
      const [px, py] = currentPoints[i];
      const dist = Math.hypot(px - x, py - y);
      if (dist <= 16) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== -1) {
      setDraggingIdx(foundIdx);
    } else {
      const newPoints = [...currentPoints, [x, y] as CurvePoint].sort((a, b) => a[0] - b[0]);
      const newIdx = newPoints.findIndex((p) => p[0] === x && p[1] === y);
      setDraggingIdx(newIdx);
      onChange({
        ...curves,
        [activeChannel]: newPoints,
      });
    }
  };

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (draggingIdx === null) return;
    const coords = getSvgCoordinates(e);
    if (!coords) return;
    const [x, y] = coords;

    const newPoints = [...currentPoints];
    if (draggingIdx === 0 && newPoints[0][0] === 0) {
      newPoints[0] = [0, y];
    } else if (draggingIdx === newPoints.length - 1 && newPoints[newPoints.length - 1][0] === 255) {
      newPoints[newPoints.length - 1] = [255, y];
    } else {
      newPoints[draggingIdx] = [x, y];
    }

    onChange({
      ...curves,
      [activeChannel]: newPoints,
    });
  };

  const handlePointerUp = () => {
    setDraggingIdx(null);
  };

  const handleDoubleClickPoint = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idx === 0 || idx === currentPoints.length - 1) return;
    const newPoints = currentPoints.filter((_, i) => i !== idx);
    onChange({
      ...curves,
      [activeChannel]: newPoints,
    });
  };

  const resetCurrentChannel = () => {
    onChange({
      ...curves,
      [activeChannel]: [[0, 0], [255, 255]],
    });
  };

  return (
    <div className="space-y-3 select-none">
      {/* Channel Selector Tabs */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-rose-50/70 border border-rose-100 rounded-xl">
          {(['master', 'r', 'g', 'b'] as Channel[]).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setActiveChannel(ch)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeChannel === ch
                  ? channelColors[ch].activeClass
                  : 'text-[#8C6B77] hover:text-[#3D242E]'
              }`}
            >
              {channelColors[ch].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={resetCurrentChannel}
          className="text-xs font-semibold text-[#8C6B77] hover:text-rose-500 transition-colors whitespace-nowrap"
        >
          Đặt lại kênh
        </button>
      </div>

      {/* SVG Interactive Canvas */}
      <div className="relative w-full aspect-square max-w-[260px] mx-auto bg-[#FFF9FB] border border-rose-200/80 rounded-2xl overflow-hidden p-2 touch-none">
        <svg
          ref={svgRef}
          viewBox="0 0 255 255"
          className="w-full h-full cursor-crosshair"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          <line x1="64" y1="0" x2="64" y2="255" stroke="#F5DCE4" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="128" y1="0" x2="128" y2="255" stroke="#ECC6D3" strokeWidth="1" />
          <line x1="192" y1="0" x2="192" y2="255" stroke="#F5DCE4" strokeWidth="1" strokeDasharray="3 3" />

          <line x1="0" y1="64" x2="255" y2="64" stroke="#F5DCE4" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" y1="128" x2="255" y2="128" stroke="#ECC6D3" strokeWidth="1" />
          <line x1="0" y1="192" x2="255" y2="192" stroke="#F5DCE4" strokeWidth="1" strokeDasharray="3 3" />

          <line x1="0" y1="255" x2="255" y2="0" stroke="#E2B4C4" strokeWidth="1" strokeDasharray="2 4" />

          <path
            d={pathD}
            fill="none"
            stroke={channelColors[activeChannel].stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {currentPoints.map(([px, py], idx) => (
            <circle
              key={idx}
              cx={px}
              cy={255 - py}
              r={draggingIdx === idx ? 7.5 : 5.5}
              fill={channelColors[activeChannel].fill}
              stroke="#FFFFFF"
              strokeWidth="2.5"
              className="cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
              onDoubleClick={(e) => handleDoubleClickPoint(idx, e)}
            />
          ))}
        </svg>
      </div>

      <p className="text-[11px] text-[#8C6B77] text-center">
        Chạm lên đường cong để thêm điểm sáng · Nhấn đúp để bỏ điểm.
      </p>
    </div>
  );
};
