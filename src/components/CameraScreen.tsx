import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Clock,
  FlipHorizontal,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Maximize2,
  RefreshCw,
  Sliders,
  Sun,
  Volume2,
  VolumeX,
  Zap,
  ZapOff
} from 'lucide-react';
import { filterRegistry } from '../services/filterRegistry';
import { SAMPLE_PHOTOS, SamplePhotoItem } from '../data/samplePhotos';
import { CapturedPhoto, FilterPreset } from '../types/filter';
import { playCountdownBeep, playShutterSound } from '../utils/feedback';

interface Props {
  onPhotosCaptured: (photos: CapturedPhoto[]) => void;
  onOpenPhotoPicker: (file: File) => void;
  onSelectSamplePhoto: (sample: SamplePhotoItem) => void;
  onOpenHelp: () => void;
}

type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export const CameraScreen: React.FC<Props> = ({
  onPhotosCaptured,
  onOpenPhotoPicker,
  onSelectSamplePhoto,
  onOpenHelp,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // Settings with localStorage persistence
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    return (localStorage.getItem('chup_ne_facing') as 'user' | 'environment') || 'environment';
  });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    return (localStorage.getItem('chup_ne_ratio') as AspectRatio) || '4:3';
  });
  const [timerDuration, setTimerDuration] = useState<number>(() => {
    return parseInt(localStorage.getItem('chup_ne_timer') || '0', 10);
  });
  const [showGrid, setShowGrid] = useState<boolean>(() => {
    return localStorage.getItem('chup_ne_grid') === 'true';
  });
  const [mirrorSelfie, setMirrorSelfie] = useState<boolean>(() => {
    return localStorage.getItem('chup_ne_mirror') !== 'false';
  });
  const [burstCount, setBurstCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('chup_ne_burst') || '1', 10);
  });

  // Camera Capabilities
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [hasZoomSupport, setHasZoomSupport] = useState(false);
  const [exposureCompensation, setExposureCompensation] = useState(0);

  // Live Filter Preview on Camera
  const [activeFilterId, setActiveFilterId] = useState<string>('portra400');
  const [quickFilters, setQuickFilters] = useState<FilterPreset[]>([]);

  // States
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);
  const [isCapturingBurst, setIsCapturingBurst] = useState(false);
  const [focusBox, setFocusBox] = useState<{ x: number; y: number } | null>(null);
  const [showExposureSlider, setShowExposureSlider] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const swipeStartXRef = useRef<number | null>(null);

  // Build approximate live CSS filter string for video viewfinder preview
  const getLiveVideoFilterCss = () => {
    const expBoost = 100 + exposureCompensation * 15;
    const preset = quickFilters.find((f) => f.id === activeFilterId);
    if (!preset || preset.id === 'none') {
      return `brightness(${expBoost}%)`;
    }
    const p = preset.params;
    const bright = Math.max(50, expBoost + p.brightness * 0.4 + p.exposure * 0.3);
    const cont = Math.max(60, 100 + p.contrast * 0.65);
    const sat = p.grayscale ? 0 : Math.max(0, 100 + p.saturation * 0.8);
    const sepia = p.temperature > 0 ? Math.min(45, p.temperature * 0.45) : 0;
    return `brightness(${bright}%) contrast(${cont}%) saturate(${sat}%) sepia(${sepia}%)`;
  };

  // Load quick filters for bottom carousel
  useEffect(() => {
    const list = filterRegistry.getAllFilters();
    setQuickFilters(list.slice(0, 16));
  }, []);

  // Save settings on changes
  useEffect(() => {
    localStorage.setItem('chup_ne_facing', facingMode);
    localStorage.setItem('chup_ne_ratio', aspectRatio);
    localStorage.setItem('chup_ne_timer', timerDuration.toString());
    localStorage.setItem('chup_ne_grid', showGrid.toString());
    localStorage.setItem('chup_ne_mirror', mirrorSelfie.toString());
    localStorage.setItem('chup_ne_burst', burstCount.toString());
  }, [facingMode, aspectRatio, timerDuration, showGrid, mirrorSelfie, burstCount]);

  // Start Camera Stream
  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt của bạn không hỗ trợ truy cập máy ảnh trực tiếp');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      // Inspect hardware capabilities (torch, zoom)
      if (track && 'getCapabilities' in track) {
        const caps = (track as unknown as { getCapabilities: () => Record<string, unknown> }).getCapabilities();
        if (caps.torch) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }
        if (caps.zoom) {
          setHasZoomSupport(true);
          const zoomCap = caps.zoom as { min: number; max: number };
          setMaxZoom(zoomCap.max || 5);
        }
      }

      setCameraLoading(false);
    } catch (err) {
      console.error('Camera access error:', err);
      const e = err as Error;
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCameraError('Bạn đã từ chối quyền truy cập camera. Vui lòng cấp quyền trong cài đặt trình duyệt hoặc tải ảnh có sẵn để tiếp tục.');
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setCameraError('Không tìm thấy thiết bị camera nào trên máy của bạn.');
      } else {
        setCameraError(`Không thể khởi động camera: ${e.message || 'Lỗi không xác định'}.`);
      }
      setCameraLoading(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  // Keyboard shortcut: Space = Snap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          handleCaptureTrigger();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timerDuration, burstCount, activeFilterId]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!trackRef.current || !hasTorch) return;
    try {
      const next = !torchOn;
      await (trackRef.current as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Change Hardware or Digital Zoom
  const handleZoomChange = async (val: number) => {
    setZoomLevel(val);
    if (trackRef.current && hasZoomSupport) {
      try {
        await (trackRef.current as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
          advanced: [{ zoom: val }],
        });
      } catch {
        // Fallback to CSS digital zoom
      }
    }
  };

  // Tap to Focus / Meter Reticle
  const handleVideoTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setFocusBox({ x, y });
    setShowExposureSlider(true);

    // Hide reticle after 2.5s
    setTimeout(() => {
      setFocusBox(null);
    }, 2500);
  };

  // Capture Single Frame from Video Stream
  const captureRawFrame = (): CapturedPhoto | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    let vw = video.videoWidth;
    let vh = video.videoHeight;

    // Crop according to aspect ratio
    let targetRatio = 4 / 3;
    if (aspectRatio === '1:1') targetRatio = 1;
    else if (aspectRatio === '4:3') targetRatio = 4 / 3;
    else if (aspectRatio === '3:4') targetRatio = 3 / 4;
    else if (aspectRatio === '16:9') targetRatio = 16 / 9;
    else if (aspectRatio === '9:16') targetRatio = 9 / 16;

    let sx = 0, sy = 0, sw = vw, sh = vh;
    const currentVideoRatio = vw / vh;

    if (currentVideoRatio > targetRatio) {
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetRatio;
      sy = (vh - sh) / 2;
    }

    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Mirror if selfie
    if (facingMode === 'user' && mirrorSelfie) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const byteString = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/jpeg' });

    return {
      id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      blob,
      dataUrl,
      width: sw,
      height: sh,
      aspectRatio,
      capturedAt: Date.now(),
      initialFilterId: activeFilterId,
      initialIntensity: 85,
    };
  };

  // Shutter Trigger (Handles Countdown & Burst)
  const handleCaptureTrigger = async () => {
    if (countdown !== null || isCapturingBurst) return;

    // Countdown flow
    if (timerDuration > 0) {
      let count = timerDuration;
      setCountdown(count);
      playCountdownBeep(false);

      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
          playCountdownBeep(false);
        } else {
          clearInterval(interval);
          setCountdown(null);
          playCountdownBeep(true);
          executeShutter();
        }
      }, 1000);
      return;
    }

    executeShutter();
  };

  const executeShutter = async () => {
    setIsCapturingBurst(true);
    const captured: CapturedPhoto[] = [];

    const numShots = burstCount;
    for (let i = 0; i < numShots; i++) {
      // White screen flash effect
      setIsShutterFlashing(true);
      playShutterSound();
      setTimeout(() => setIsShutterFlashing(false), 90);

      const photo = captureRawFrame();
      if (photo) {
        captured.push(photo);
      }

      if (numShots > 1 && i < numShots - 1) {
        await new Promise((r) => setTimeout(r, 220)); // burst cadence
      }
    }

    setIsCapturingBurst(false);
    if (captured.length > 0) {
      onPhotosCaptured(captured);
    }
  };

  // Handle uploaded gallery photo
  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenPhotoPicker(file);
    }
    e.target.value = '';
  };

  // Aspect ratio classes
  const getFrameRatioClass = () => {
    switch (aspectRatio) {
      case '1:1':
        return 'aspect-square max-h-[75vh]';
      case '4:3':
        return 'aspect-[4/3] max-h-[82vh]';
      case '3:4':
        return 'aspect-[3/4] max-h-[85vh]';
      case '16:9':
        return 'aspect-[16/9] max-h-[82vh]';
      case '9:16':
      default:
        return 'aspect-[9/16] h-full';
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-[#FFF9FB] text-[#3D242E] flex flex-col justify-between overflow-hidden select-none">
      {/* ── TOP BAR (Single row, clean thumb-reach) ── */}
      <div className="relative z-30 flex items-center justify-between gap-1.5 px-3 sm:px-4 py-2.5 bg-white/95 backdrop-blur-md border-b border-rose-100">
        {/* Left cluster: Flash & Grid */}
        <div className="flex items-center gap-1 shrink-0">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-full transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center ${
                torchOn ? 'bg-rose-500 text-white' : 'bg-rose-50 text-[#5C3D49] hover:bg-rose-100'
              }`}
              title="Đèn Flash"
            >
              {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded-full transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center ${
              showGrid ? 'bg-rose-500 text-white shadow-xs' : 'bg-rose-50 text-[#5C3D49] hover:bg-rose-100'
            }`}
            title="Lưới bố cục 1/3"
          >
            <Grid3X3 className="w-5 h-5" />
          </button>
        </div>

        {/* Center: Ratio & Timer selectors */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const ratios: AspectRatio[] = ['4:3', '1:1', '16:9', '3:4', '9:16'];
              const next = ratios[(ratios.indexOf(aspectRatio) + 1) % ratios.length];
              setAspectRatio(next);
            }}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-full text-xs font-bold tracking-wider text-rose-600 min-h-[38px] flex items-center justify-center whitespace-nowrap tabular-nums"
          >
            {aspectRatio}
          </button>

          <button
            type="button"
            onClick={() => {
              const next = timerDuration === 0 ? 3 : timerDuration === 3 ? 10 : 0;
              setTimerDuration(next);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold min-h-[38px] flex items-center gap-1 transition-colors whitespace-nowrap ${
              timerDuration > 0
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-rose-50 text-[#5C3D49] border border-rose-100 hover:bg-rose-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {timerDuration > 0 ? `${timerDuration}s` : 'Hẹn giờ'}
          </button>

          <button
            type="button"
            onClick={() => {
              const next = burstCount === 1 ? 3 : burstCount === 3 ? 5 : 1;
              setBurstCount(next);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold min-h-[38px] flex items-center gap-1 transition-colors whitespace-nowrap ${
              burstCount > 1
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-rose-50 text-[#5C3D49] border border-rose-100 hover:bg-rose-100'
            }`}
            title="Chụp liên tiếp"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            {burstCount > 1 ? `${burstCount} ảnh` : 'Đơn'}
          </button>
        </div>

        {/* Right cluster: Mirror selfie & Help */}
        <div className="flex items-center gap-1 shrink-0">
          {facingMode === 'user' && (
            <button
              type="button"
              onClick={() => setMirrorSelfie(!mirrorSelfie)}
              className={`p-2 rounded-full min-w-[40px] min-h-[40px] flex items-center justify-center ${
                mirrorSelfie ? 'bg-rose-500 text-white' : 'bg-rose-50 text-[#5C3D49]'
              }`}
              title="Lật gương selfie"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenHelp}
            className="p-2 bg-rose-50 hover:bg-rose-100 rounded-full text-rose-500 font-bold min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Hướng dẫn sử dụng"
          >
            <span className="text-xs font-bold">?</span>
          </button>
        </div>
      </div>

      {/* ── VIEWFINDER CENTER CANVAS ── */}
      <div
        className="relative flex-1 flex items-center justify-center bg-[#23171C] overflow-hidden cursor-crosshair"
        onClick={handleVideoTap}
        onTouchStart={(e) => {
          swipeStartXRef.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (swipeStartXRef.current === null || quickFilters.length === 0) return;
          const dx = e.changedTouches[0].clientX - swipeStartXRef.current;
          swipeStartXRef.current = null;
          if (Math.abs(dx) > 48) {
            const idx = quickFilters.findIndex((q) => q.id === activeFilterId);
            if (idx !== -1) {
              const nextIdx =
                dx < 0
                  ? (idx + 1) % quickFilters.length
                  : (idx - 1 + quickFilters.length) % quickFilters.length;
              setActiveFilterId(quickFilters[nextIdx].id);
            }
          }
        }}
      >
        {/* Video feed */}
        <div
          className={`relative overflow-hidden transition-all duration-300 flex items-center justify-center ${getFrameRatioClass()}`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover transition-transform"
            style={{
              transform: `scale(${zoomLevel}) ${facingMode === 'user' && mirrorSelfie ? 'scaleX(-1)' : ''}`,
              filter: getLiveVideoFilterCss(),
            }}
          />

          {/* Rule of Thirds Grid Overlay */}
          {showGrid && (
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
              <div className="border-r border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-white/25" />
              <div className="border-r border-white/25" />
              <div />
            </div>
          )}

          {/* Focus Reticle indicator */}
          {focusBox && (
            <div
              className="absolute w-16 h-16 border-2 border-rose-400 rounded-2xl pointer-events-none animate-ping duration-300"
              style={{
                left: focusBox.x - 32,
                top: focusBox.y - 32,
              }}
            />
          )}

          {/* Shutter White Flash animation */}
          {isShutterFlashing && (
            <div className="absolute inset-0 bg-white z-40 pointer-events-none animate-out fade-out duration-100" />
          )}

          {/* Large Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#2B1720]/45 backdrop-blur-xs">
              <span className="text-8xl font-black text-rose-300 drop-shadow-2xl animate-pulse font-mono">
                {countdown}
              </span>
            </div>
          )}
        </div>

        {/* Camera Permission Error / Fallback State (Cute Pastel Cream Welcome) */}
        {cameraError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-[#FFF9FB] text-center overflow-y-auto">
            <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-3xl flex items-center justify-center text-rose-500 mb-4 shadow-sm">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-[#3D242E] mb-1.5">Chưa mở được Camera</h3>
            <p className="text-xs text-[#8C6B77] max-w-sm leading-relaxed mb-5">
              {cameraError}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-sm justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-2xl shadow-md shadow-rose-200 transition-all"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Chọn ảnh từ máy để chỉnh màu</span>
              </button>
              <button
                type="button"
                onClick={startCamera}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-rose-50 border border-rose-200 text-[#3D242E] font-semibold text-xs rounded-2xl transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-rose-500" />
                <span>Thử mở lại</span>
              </button>
            </div>

            {/* Quick Sample Photos on error */}
            <div className="mt-6 pt-5 border-t border-rose-100 w-full max-w-sm">
              <div className="text-xs text-[#8C6B77] mb-3 font-semibold">
                Hoặc thử chỉnh màu ngay với ảnh mẫu xinh xắn
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SAMPLE_PHOTOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSamplePhoto(s)}
                    className="p-1.5 bg-white hover:bg-rose-50 border border-rose-100 rounded-2xl text-center group transition-all shadow-xs"
                  >
                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-rose-50 mb-1.5">
                      <img src={s.url} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                    <span className="text-[11px] text-[#3D242E] font-semibold block truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Zoom & Exposure Controls */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">
          {showExposureSlider && (
            <div className="p-2.5 bg-white/95 backdrop-blur-md rounded-2xl border border-rose-100 shadow-lg flex items-center gap-2">
              <Sun className="w-3.5 h-3.5 text-rose-500" />
              <input
                type="range"
                min={-2}
                max={2}
                step={0.5}
                value={exposureCompensation}
                onChange={(e) => setExposureCompensation(parseFloat(e.target.value))}
                className="w-24 studio-slider"
              />
              <span className="text-[11px] text-[#3D242E] w-7 font-mono tabular-nums font-bold">
                {exposureCompensation > 0 ? `+${exposureCompensation}` : exposureCompensation}
              </span>
            </div>
          )}

          <div className="flex items-center bg-white/90 backdrop-blur-md border border-rose-100 shadow-md rounded-full p-1 gap-1">
            {[1, 2, 5].map((z) => (
              <button
                key={z}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomChange(z);
                }}
                className={`w-8 h-8 rounded-full text-[11px] font-bold transition-all ${
                  zoomLevel === z
                    ? 'bg-rose-500 text-white shadow-xs scale-105'
                    : 'text-[#5C3D49] hover:bg-rose-50'
                }`}
              >
                {z}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR (One-Handed Thumb Optimized) ── */}
      <div className="relative z-30 flex flex-col bg-white border-t border-rose-100 pt-2 pb-safe px-4">
        {/* Quick Filter Horizontal Carousel on Camera */}
        <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar px-1">
          {quickFilters.map((q) => {
            const isSelected = activeFilterId === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setActiveFilterId(q.id)}
                className={`px-3.5 py-1.5 text-xs rounded-full whitespace-nowrap shrink-0 transition-all ${
                  isSelected
                    ? 'bg-rose-500 text-white font-bold shadow-sm shadow-rose-200'
                    : 'bg-rose-50 hover:bg-rose-100 text-[#5C3D49] font-medium'
                }`}
              >
                {q.name}
              </button>
            );
          })}
        </div>

        {/* Shutter and Secondary Controls Row */}
        <div className="flex items-center justify-between py-3.5">
          {/* Gallery Upload Button (Left) */}
          <div className="w-14 flex justify-start">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl text-rose-500 transition-all shadow-xs active:scale-95 min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Chọn ảnh từ máy để chỉnh"
            >
              <ImageIcon className="w-6 h-6" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChosen}
            />
          </div>

          {/* Large Cute Blush Shutter Button (Center) */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleCaptureTrigger}
              disabled={isCapturingBurst}
              className="group relative w-20 h-20 rounded-full border-4 border-rose-200 p-1 flex items-center justify-center transition-transform active:scale-90 min-w-[72px] min-h-[72px] bg-white shadow-md shadow-rose-200/60"
              title="Chụp ảnh (Space)"
            >
              <div className="w-full h-full bg-rose-500 group-hover:bg-rose-600 rounded-full flex items-center justify-center transition-all">
                {isCapturingBurst ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/30 border border-white/60" />
                )}
              </div>
            </button>
            <span className="hidden sm:block text-[10px] text-[#8C6B77] mt-1 font-medium">Phím Space</span>
          </div>

          {/* Flip Camera Button (Right) */}
          <div className="w-14 flex justify-end">
            <button
              type="button"
              onClick={() => setFacingMode(facingMode === 'user' ? 'environment' : 'user')}
              className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl text-[#3D242E] transition-all shadow-xs active:scale-95 min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Đổi camera trước/sau"
            >
              <RefreshCw className="w-6 h-6 text-rose-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
