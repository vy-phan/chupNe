import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Crop as CropIcon,
  Eye,
  FileImage,
  Image as ImageIcon,
  ImagePlus,
  Palette,
  Redo2,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  Sparkles,
  TrendingUp,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  CROP_PRESETS,
  FULL_CROP,
  computeAspectCrop,
  createCroppedCanvas,
  getCropPixelRect,
  isFullCrop,
} from '../engine/cropUtils';
import { generateFilterThumbnails, WebGLFilterEngine } from '../engine/filterEngine';
import { filterRegistry } from '../services/filterRegistry';
import { SAMPLE_PHOTOS, SamplePhotoItem } from '../data/samplePhotos';
import {
  CapturedPhoto,
  CropAspectPreset,
  CropRegion,
  FilterCategory,
  FilterParams,
  FilterPreset,
} from '../types/filter';
import { CreateFilterModal } from './CreateFilterModal';
import { CropOverlay } from './CropOverlay';
import { ExportModal } from './ExportModal';
import { FilterManagerModal } from './FilterManagerModal';
import { HistogramView } from './HistogramView';
import { ToneCurvesEditor } from './ToneCurvesEditor';

interface Props {
  currentPhoto: CapturedPhoto;
  onBackToCamera: () => void;
  onOpenPhotoPicker: (file: File) => void;
  onSelectSamplePhoto: (sample: SamplePhotoItem) => void;
  onOpenHelp: () => void;
}

type StudioTab = 'filters' | 'tune' | 'curves' | 'split' | 'crop';

interface HistoryState {
  filterId: string;
  intensity: number;
  params: FilterParams;
  crop: CropRegion;
  cropAspect: CropAspectPreset;
}

export const StudioScreen: React.FC<Props> = ({
  currentPhoto,
  onBackToCamera,
  onOpenPhotoPicker,
  onSelectSamplePhoto,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<WebGLFilterEngine | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const croppedSourceRef = useRef<HTMLCanvasElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Filter & Registry state
  const [allFilters, setAllFilters] = useState<FilterPreset[]>([]);
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedFilterId, setSelectedFilterId] = useState<string>(
    currentPhoto.initialFilterId || 'portra400'
  );
  const [filterIntensity, setFilterIntensity] = useState<number>(
    currentPhoto.initialIntensity || 85
  );
  const [customParams, setCustomParams] = useState<FilterParams>(() => {
    const f = filterRegistry.getFilterById(currentPhoto.initialFilterId || 'portra400');
    return f ? JSON.parse(JSON.stringify(f.params)) : { ...filterRegistry.getFilterById('none')!.params };
  });

  // Crop state
  const [cropRegion, setCropRegion] = useState<CropRegion>(FULL_CROP);
  const [cropAspect, setCropAspect] = useState<CropAspectPreset>('original');
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imageReadyTick, setImageReadyTick] = useState(0);

  // UI state
  const [activeTab, setActiveTab] = useState<StudioTab>('filters');
  const [isComparingOriginal, setIsComparingOriginal] = useState(false);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);
  const [showMobileSourceSheet, setShowMobileSourceSheet] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Modals
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUndoRedoAction = useRef(false);

  // Measure Stage Container for exact canvas & CropOverlay pixel alignment
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setStageSize({
        w: Math.max(0, rect.width - padX),
        h: Math.max(0, rect.height - padY),
      });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab]);

  // Load Source Image Element
  useEffect(() => {
    let active = true;
    setCropRegion(FULL_CROP);
    setCropAspect('original');
    croppedSourceRef.current = null;

    const initFilterId = currentPhoto.initialFilterId || 'portra400';
    const initIntensity = currentPhoto.initialIntensity || 85;
    const initPreset = filterRegistry.getFilterById(initFilterId) || filterRegistry.getFilterById('none')!;
    const initParams = JSON.parse(JSON.stringify(initPreset.params));
    setHistory([
      {
        filterId: initFilterId,
        intensity: initIntensity,
        params: initParams,
        crop: FULL_CROP,
        cropAspect: 'original',
      },
    ]);
    setHistoryIndex(0);

    const img = new Image();
    img.onload = () => {
      if (!active) return;
      sourceImageRef.current = img;
      setImageReadyTick((t) => t + 1);
      if (canvasRef.current) {
        if (!engineRef.current) {
          engineRef.current = new WebGLFilterEngine(canvasRef.current);
        }
        renderCurrentState();
      }
      generateThumbnails(img);
    };
    img.onerror = (e) => {
      console.error('Failed to load current photo into Image:', e);
    };
    img.src = currentPhoto.dataUrl;

    return () => {
      active = false;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [currentPhoto.id, currentPhoto.dataUrl]);

  // Load Filter Registry
  const refreshFilters = () => {
    setAllFilters(filterRegistry.getAllFilters());
    setCategories(filterRegistry.getCategories());
  };

  useEffect(() => {
    refreshFilters();
    const unsub = filterRegistry.subscribe(refreshFilters);
    return unsub;
  }, []);

  // Generate Real-Image Thumbnails
  const generateThumbnails = async (img: HTMLImageElement) => {
    const filters = filterRegistry.getAllFilters();
    const map = await generateFilterThumbnails(img, filters, 130);
    setThumbnails(map);
  };

  // Push History Snapshot
  const pushHistory = (newState: HistoryState) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, newState]);
    setHistoryIndex(truncated.length);
  };

  // Handle Filter Selection
  const selectFilter = (id: string) => {
    const preset = filterRegistry.getFilterById(id);
    if (!preset) return;

    setSelectedFilterId(id);
    setFilterIntensity(preset.defaultIntensity);
    const newParams = JSON.parse(JSON.stringify(preset.params));
    setCustomParams(newParams);

    filterRegistry.recordRecent(id);

    pushHistory({
      filterId: id,
      intensity: preset.defaultIntensity,
      params: newParams,
      crop: cropRegion,
      cropAspect,
    });
  };

  // Update Individual Adjustment Param
  const updateParam = (key: keyof FilterParams, value: unknown) => {
    setCustomParams((prev: FilterParams) => {
      const updated = { ...prev, [key]: value };
      pushHistory({
        filterId: selectedFilterId,
        intensity: filterIntensity,
        params: updated,
        crop: cropRegion,
        cropAspect,
      });
      return updated;
    });
  };

  // Rebuild cached cropped source canvas whenever cropRegion changes
  useEffect(() => {
    const img = sourceImageRef.current;
    if (!img || !img.complete || img.naturalWidth <= 0) return;

    if (isFullCrop(cropRegion)) {
      croppedSourceRef.current = null;
    } else {
      croppedSourceRef.current = createCroppedCanvas(img, cropRegion);
    }
  }, [cropRegion, imageReadyTick]);

  // Render Canvas with WebGL (with 2D canvas fallback)
  const renderCurrentState = useCallback(() => {
    if (!sourceImageRef.current || !canvasRef.current) return;
    const img = sourceImageRef.current;
    if (!img.complete || img.naturalWidth <= 0) return;

    if (!engineRef.current) {
      engineRef.current = new WebGLFilterEngine(canvasRef.current);
    }

    // In Crop mode, always display full uncropped image so user can frame freely
    const renderSource: TexImageSource =
      activeTab === 'crop' || isFullCrop(cropRegion)
        ? img
        : croppedSourceRef.current || createCroppedCanvas(img, cropRegion);

    try {
      if (isComparingOriginal) {
        const noneParams = filterRegistry.getFilterById('none')!.params;
        engineRef.current.render(renderSource, noneParams, 100);
      } else {
        engineRef.current.render(renderSource, customParams, filterIntensity);
      }
    } catch (err) {
      console.warn('WebGL render error, falling back to 2D draw:', err);
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const rw =
          renderSource instanceof HTMLImageElement
            ? renderSource.naturalWidth
            : (renderSource as HTMLCanvasElement).width;
        const rh =
          renderSource instanceof HTMLImageElement
            ? renderSource.naturalHeight
            : (renderSource as HTMLCanvasElement).height;
        canvasRef.current.width = rw;
        canvasRef.current.height = rh;
        ctx.drawImage(renderSource as CanvasImageSource, 0, 0);
      }
    }
  }, [activeTab, cropRegion, customParams, filterIntensity, isComparingOriginal]);

  useEffect(() => {
    renderCurrentState();
  }, [renderCurrentState, imageReadyTick]);

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const target = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setSelectedFilterId(target.filterId);
      setFilterIntensity(target.intensity);
      setCustomParams(JSON.parse(JSON.stringify(target.params)));
      setCropRegion(target.crop || FULL_CROP);
      setCropAspect(target.cropAspect || 'original');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const target = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setSelectedFilterId(target.filterId);
      setFilterIntensity(target.intensity);
      setCustomParams(JSON.parse(JSON.stringify(target.params)));
      setCropRegion(target.crop || FULL_CROP);
      setCropAspect(target.cropAspect || 'original');
    }
  };

  // Reset to Filter Defaults
  const handleReset = () => {
    const preset = filterRegistry.getFilterById(selectedFilterId);
    if (preset) {
      setFilterIntensity(preset.defaultIntensity);
      setCustomParams(JSON.parse(JSON.stringify(preset.params)));
    }
  };

  // Crop Handlers
  const handleSelectCropPreset = (preset: CropAspectPreset) => {
    const natW = sourceImageRef.current?.naturalWidth || currentPhoto.width;
    const natH = sourceImageRef.current?.naturalHeight || currentPhoto.height;
    const nextCrop = computeAspectCrop(natW, natH, preset, cropRegion);
    setCropAspect(preset);
    setCropRegion(nextCrop);
    pushHistory({
      filterId: selectedFilterId,
      intensity: filterIntensity,
      params: customParams,
      crop: nextCrop,
      cropAspect: preset,
    });
  };

  const handleCommitCrop = useCallback(
    (finalCrop: CropRegion) => {
      setCropRegion(finalCrop);
      pushHistory({
        filterId: selectedFilterId,
        intensity: filterIntensity,
        params: customParams,
        crop: finalCrop,
        cropAspect,
      });
    },
    [selectedFilterId, filterIntensity, customParams, cropAspect, history, historyIndex]
  );

  const handleResetCrop = () => {
    setCropAspect('original');
    setCropRegion(FULL_CROP);
    pushHistory({
      filterId: selectedFilterId,
      intensity: filterIntensity,
      params: customParams,
      crop: FULL_CROP,
      cropAspect: 'original',
    });
  };

  // Keyboard Shortcuts: Arrows for filters, \ for compare, Ctrl+Z for undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((document.activeElement?.tagName || '').toLowerCase())) return;
      if (isExportOpen || isManagerOpen || isCreateOpen) return;

      if (e.key === '\\') {
        setIsComparingOriginal(true);
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentList = displayedFilters;
        const currentIdx = currentList.findIndex((f: FilterPreset) => f.id === selectedFilterId);
        if (currentIdx !== -1) {
          const nextIdx =
            e.key === 'ArrowRight'
              ? (currentIdx + 1) % currentList.length
              : (currentIdx - 1 + currentList.length) % currentList.length;
          selectFilter(currentList[nextIdx].id);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') {
        setIsComparingOriginal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedFilterId, historyIndex, history, cropRegion, cropAspect, isExportOpen, isManagerOpen, isCreateOpen]);

  // Filter displayed list according to category
  const displayedFilters = allFilters.filter((f: FilterPreset) => {
    if (f.id === 'none') return true;
    if (activeCategory === 'all') return true;
    if (activeCategory === 'favorites') return filterRegistry.isFavorite(f.id);
    if (activeCategory === 'recent') return filterRegistry.getRecentlyUsed().includes(f.id);
    return f.category === activeCategory;
  });

  const activeFilterPreset =
    filterRegistry.getFilterById(selectedFilterId) || filterRegistry.getFilterById('none')!;

  // Shared Fine-Tune Sliders Content
  const renderFineTuneContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-rose-100">
        <span className="text-xs font-bold text-[#3D242E]">Tinh chỉnh màu sắc nhẹ nhàng</span>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#8C6B77] hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Đặt lại</span>
        </button>
      </div>

      <HistogramView sourceImage={croppedSourceRef.current || sourceImageRef.current} />

      <div className="space-y-4 text-xs">
        {[
          { key: 'exposure', label: 'Ánh sáng tổng (Exposure)', min: -100, max: 100 },
          { key: 'brightness', label: 'Độ sáng (Brightness)', min: -100, max: 100 },
          { key: 'contrast', label: 'Tương phản (Contrast)', min: -100, max: 100 },
          { key: 'saturation', label: 'Độ rực màu (Saturation)', min: -100, max: 100 },
          { key: 'vibrance', label: 'Tươi tắn màu da (Vibrance)', min: -100, max: 100 },
          { key: 'temperature', label: 'Nhiệt độ màu (Mát / Ấm)', min: -100, max: 100 },
          { key: 'tint', label: 'Sắc thái (Xanh / Hồng)', min: -100, max: 100 },
          { key: 'highlights', label: 'Vùng sáng (Highlights)', min: -100, max: 100 },
          { key: 'shadows', label: 'Vùng tối (Shadows)', min: -100, max: 100 },
          { key: 'fade', label: 'Phủ sương dịu (Fade Film)', min: 0, max: 100 },
        ].map((item) => {
          const val = (customParams[item.key as keyof FilterParams] as number) || 0;
          return (
            <div key={item.key}>
              <div className="flex justify-between text-[#5C3D49] font-medium mb-1.5">
                <span>{item.label}</span>
                <span className="font-mono tabular-nums text-rose-500 font-bold">{val}</span>
              </div>
              <input
                type="range"
                min={item.min}
                max={item.max}
                value={val}
                onChange={(e) => updateParam(item.key as keyof FilterParams, parseInt(e.target.value, 10))}
                className="w-full studio-slider"
              />
            </div>
          );
        })}

        {/* Grain Amount */}
        <div>
          <div className="flex justify-between text-[#5C3D49] font-medium mb-1.5">
            <span>Hạt phim vintage (Film Grain)</span>
            <span className="font-mono tabular-nums text-rose-500 font-bold">
              {customParams.grain?.amount || 0}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={customParams.grain?.amount || 0}
            onChange={(e) =>
              updateParam('grain', {
                ...(customParams.grain || { amount: 0, size: 2 }),
                amount: parseInt(e.target.value, 10),
              })
            }
            className="w-full studio-slider"
          />
        </div>

        {/* Vignette Amount */}
        <div>
          <div className="flex justify-between text-[#5C3D49] font-medium mb-1.5">
            <span>Tối góc nhẹ (Vignette)</span>
            <span className="font-mono tabular-nums text-rose-500 font-bold">
              {customParams.vignette?.amount || 0}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={customParams.vignette?.amount || 0}
            onChange={(e) =>
              updateParam('vignette', {
                ...(customParams.vignette || { amount: 0, feather: 50 }),
                amount: parseInt(e.target.value, 10),
              })
            }
            className="w-full studio-slider"
          />
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold text-xs rounded-2xl transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Lưu công thức màu riêng</span>
        </button>
      </div>
    </div>
  );

  // Shared Split Toning Content
  const renderSplitToningContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-rose-100">
        <span className="text-xs font-bold text-[#3D242E]">Phân tông màu (Split Toning)</span>
      </div>

      {/* Shadows Tint */}
      <div className="space-y-3 p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl">
        <div className="text-xs font-bold text-[#3D242E]">Tông vùng tối (Shadows)</div>
        <div>
          <div className="flex justify-between text-xs text-[#8C6B77] mb-1.5">
            <span>Sắc độ (Hue)</span>
            <span className="font-mono tabular-nums text-rose-500 font-semibold">
              {customParams.splitToning?.shadowHue || 0}°
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={customParams.splitToning?.shadowHue || 0}
            onChange={(e) =>
              updateParam('splitToning', {
                ...(customParams.splitToning || {
                  shadowHue: 210,
                  shadowSat: 0,
                  highlightHue: 40,
                  highlightSat: 0,
                  balance: 0,
                }),
                shadowHue: parseInt(e.target.value, 10),
              })
            }
            className="w-full studio-slider"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-[#8C6B77] mb-1.5">
            <span>Độ đậm (Saturation)</span>
            <span className="font-mono tabular-nums text-rose-500 font-semibold">
              {customParams.splitToning?.shadowSat || 0}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={customParams.splitToning?.shadowSat || 0}
            onChange={(e) =>
              updateParam('splitToning', {
                ...(customParams.splitToning || {
                  shadowHue: 210,
                  shadowSat: 0,
                  highlightHue: 40,
                  highlightSat: 0,
                  balance: 0,
                }),
                shadowSat: parseInt(e.target.value, 10),
              })
            }
            className="w-full studio-slider"
          />
        </div>
      </div>

      {/* Highlights Tint */}
      <div className="space-y-3 p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl">
        <div className="text-xs font-bold text-[#3D242E]">Tông vùng sáng (Highlights)</div>
        <div>
          <div className="flex justify-between text-xs text-[#8C6B77] mb-1.5">
            <span>Sắc độ (Hue)</span>
            <span className="font-mono tabular-nums text-rose-500 font-semibold">
              {customParams.splitToning?.highlightHue || 0}°
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={customParams.splitToning?.highlightHue || 0}
            onChange={(e) =>
              updateParam('splitToning', {
                ...(customParams.splitToning || {
                  shadowHue: 210,
                  shadowSat: 0,
                  highlightHue: 40,
                  highlightSat: 0,
                  balance: 0,
                }),
                highlightHue: parseInt(e.target.value, 10),
              })
            }
            className="w-full studio-slider"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-[#8C6B77] mb-1.5">
            <span>Độ đậm (Saturation)</span>
            <span className="font-mono tabular-nums text-rose-500 font-semibold">
              {customParams.splitToning?.highlightSat || 0}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={customParams.splitToning?.highlightSat || 0}
            onChange={(e) =>
              updateParam('splitToning', {
                ...(customParams.splitToning || {
                  shadowHue: 210,
                  shadowSat: 0,
                  highlightHue: 40,
                  highlightSat: 0,
                  balance: 0,
                }),
                highlightSat: parseInt(e.target.value, 10),
              })
            }
            className="w-full studio-slider"
          />
        </div>
      </div>

      {/* Balance */}
      <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl">
        <div className="flex justify-between text-xs text-[#5C3D49] font-medium mb-1.5">
          <span>Cân bằng chuyển tiếp (Balance)</span>
          <span className="font-mono tabular-nums text-rose-500 font-semibold">
            {customParams.splitToning?.balance || 0}
          </span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={customParams.splitToning?.balance || 0}
          onChange={(e) =>
            updateParam('splitToning', {
              ...(customParams.splitToning || {
                shadowHue: 210,
                shadowSat: 0,
                highlightHue: 40,
                highlightSat: 0,
                balance: 0,
              }),
              balance: parseInt(e.target.value, 10),
            })
          }
          className="w-full studio-slider"
        />
      </div>
    </div>
  );

  // Shared Crop & Aspect Ratio Panel Content
  const natW = sourceImageRef.current?.naturalWidth || currentPhoto.width;
  const natH = sourceImageRef.current?.naturalHeight || currentPhoto.height;
  const croppedPixel = getCropPixelRect(natW, natH, cropRegion);
  const cropChanged = !isFullCrop(cropRegion) || cropAspect !== 'original';

  // Compute exact fitted wrapper dimensions inside Photo Stage so canvas & CropOverlay match 1:1
  const dispNatW = activeTab === 'crop' ? natW : croppedPixel.sw;
  const dispNatH = activeTab === 'crop' ? natH : croppedPixel.sh;
  let fittedBoxStyle: React.CSSProperties | undefined;
  if (stageSize.w > 0 && stageSize.h > 0 && dispNatW > 0 && dispNatH > 0) {
    const scale = Math.min(stageSize.w / dispNatW, stageSize.h / dispNatH);
    fittedBoxStyle = {
      width: Math.max(40, Math.floor(dispNatW * scale)),
      height: Math.max(40, Math.floor(dispNatH * scale)),
    };
  }

  const renderCropContent = (compact = false) => (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-center justify-between pb-2 border-b border-rose-100">
        <div>
          <div className="text-xs font-bold text-[#3D242E]">Cắt ảnh & Chọn tỷ lệ</div>
          <div className="text-[11px] text-[#8C6B77] tabular-nums mt-0.5">
            Kích thước xuất: <span className="font-mono font-semibold text-rose-500">{croppedPixel.sw} × {croppedPixel.sh} px</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResetCrop}
          disabled={!cropChanged}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#8C6B77] hover:text-rose-500 disabled:opacity-40 rounded-xl hover:bg-rose-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Đặt lại</span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {CROP_PRESETS.map((preset) => {
          const active = cropAspect === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectCropPreset(preset.id)}
              className={`min-h-[58px] px-1.5 py-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                active
                  ? 'bg-rose-500 border-rose-500 text-white shadow-sm shadow-rose-200'
                  : 'bg-[#FFF9FB] border-rose-100 text-[#3D242E] hover:bg-rose-50 hover:border-rose-200'
              }`}
            >
              <div className="h-4 flex items-center justify-center">
                <span
                  className={`inline-block rounded-[3px] border-[1.5px] ${preset.boxClass} ${
                    active ? 'border-white bg-white/20' : 'border-rose-400 bg-rose-50'
                  }`}
                />
              </div>
              <span className="text-[11px] font-bold leading-none whitespace-nowrap">
                {preset.label}
              </span>
              {!compact && (
                <span
                  className={`text-[9.5px] leading-none truncate max-w-full ${
                    active ? 'text-rose-100' : 'text-[#8C6B77]'
                  }`}
                >
                  {preset.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-[#8C6B77] leading-snug">
          Kéo góc khung hoặc chạm giữ để di chuyển bố cục
        </span>
        <button
          type="button"
          onClick={() => setActiveTab('filters')}
          className="min-h-[38px] px-3.5 py-1.5 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-2xl shadow-sm shadow-rose-200 shrink-0 transition-all active:scale-95"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Áp dụng</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-[100dvh] bg-[#FFF9FB] text-[#3D242E] flex flex-col overflow-hidden select-none">
      {/* Hidden file input for upload */}
      <input
        type="file"
        ref={uploadInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onOpenPhotoPicker(file);
          }
          e.target.value = '';
        }}
      />

      {/* ── TOP HEADER ── */}
      <header className="relative z-30 h-14 px-3 lg:px-5 flex items-center justify-between gap-2 lg:gap-6 bg-white/95 backdrop-blur-md border-b border-rose-100 shrink-0">
        {/* Left Zone */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToCamera}
            className="min-w-[40px] min-h-[40px] lg:min-w-0 lg:px-3.5 lg:py-2 flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-[#3D242E] text-xs font-semibold rounded-2xl border border-rose-100 transition-colors"
            title="Quay lại Camera"
            aria-label="Quay lại Camera"
          >
            <ArrowLeft className="w-4 h-4 text-rose-500 lg:hidden" />
            <Camera className="w-4 h-4 text-rose-500 hidden lg:block" />
            <span className="hidden lg:inline whitespace-nowrap">Chụp mới</span>
          </button>

          {/* Mobile: Unified "Đổi ảnh" button opening clean Bottom Sheet */}
          <button
            type="button"
            onClick={() => setShowMobileSourceSheet(true)}
            className="lg:hidden min-h-[40px] px-3 flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-[#3D242E] text-xs font-semibold rounded-2xl border border-rose-100 transition-colors whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4 text-rose-500" />
            <span>Đổi ảnh</span>
          </button>

          {/* Desktop: Quick Upload & Sample Dropdown */}
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-[#3D242E] text-xs font-semibold rounded-2xl border border-rose-100 transition-colors whitespace-nowrap"
            title="Tải ảnh từ máy tính"
          >
            <Upload className="w-4 h-4 text-rose-500" />
            <span>Tải ảnh</span>
          </button>

          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setShowSampleDropdown((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-[#3D242E] text-xs font-semibold rounded-2xl border border-rose-100 transition-colors whitespace-nowrap"
              title="Chọn ảnh mẫu thử màu"
            >
              <ImageIcon className="w-4 h-4 text-rose-500" />
              <span>Ảnh mẫu</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#8C6B77]" />
            </button>

            {showSampleDropdown && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-rose-100 rounded-2xl shadow-xl shadow-rose-900/10 p-2 z-50 flex flex-col gap-1">
                <div className="text-xs font-semibold text-[#8C6B77] px-2 py-1">
                  Chọn ảnh mẫu thử màu
                </div>
                {SAMPLE_PHOTOS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      setShowSampleDropdown(false);
                      onSelectSamplePhoto(sample);
                    }}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-rose-50 text-left transition-colors"
                  >
                    <img
                      src={sample.url}
                      alt={sample.name}
                      className="w-10 h-10 rounded-xl object-cover border border-rose-100"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#3D242E]">{sample.name}</div>
                      <div className="text-[11px] text-[#8C6B77]">{sample.category}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="font-bold text-sm text-[#3D242E] hidden xl:block ml-2 whitespace-nowrap">
            Chụp Nè <span className="text-[#8C6B77] font-medium text-xs">· Studio</span>
          </div>
        </div>

        {/* Center Zone: Desktop Studio Mode Tabs */}
        <div className="hidden lg:flex items-center gap-1 p-1 bg-rose-50/80 border border-rose-100 rounded-2xl shrink-0">
          {[
            { id: 'filters', label: 'Bộ lọc', icon: Sparkles },
            { id: 'tune', label: 'Tinh chỉnh', icon: Sliders },
            { id: 'curves', label: 'Đường cong', icon: TrendingUp },
            { id: 'split', label: 'Phân tông', icon: Palette },
            { id: 'crop', label: 'Cắt ảnh', icon: CropIcon },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as StudioTab)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                  active
                    ? 'bg-rose-500 text-white shadow-sm shadow-rose-300/60'
                    : 'text-[#8C6B77] hover:text-[#3D242E]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Zone: Undo / Redo + Settings + Export CTA */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#6E4F5B] hover:text-[#3D242E] disabled:opacity-30 rounded-2xl hover:bg-rose-50 transition-colors"
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#6E4F5B] hover:text-[#3D242E] disabled:opacity-30 rounded-2xl hover:bg-rose-50 transition-colors"
            title="Làm lại (Ctrl+Shift+Z)"
            aria-label="Làm lại"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsManagerOpen(true)}
            className="hidden lg:flex min-w-[40px] min-h-[40px] items-center justify-center text-[#6E4F5B] hover:text-rose-500 rounded-2xl hover:bg-rose-50 transition-colors"
            title="Quản lý kho bộ lọc"
            aria-label="Quản lý kho bộ lọc"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-2xl shadow-md shadow-rose-300/60 transition-all active:scale-[0.97] whitespace-nowrap shrink-0"
          >
            <FileImage className="w-3.5 h-3.5 shrink-0" />
            <span>Xuất ảnh</span>
          </button>
        </div>
      </header>

      {/* ── MAIN WORKSPACE ── */}
      <div className="relative flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Photo Stage Column */}
        <div
          className={`relative flex-1 flex flex-col min-h-0 bg-[#F7EDF1] overflow-hidden transition-colors ${
            isDragOver ? 'bg-rose-100/70' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) {
              onOpenPhotoPicker(file);
            }
          }}
        >
          {/* Centered Image Viewport */}
          <div
            ref={stageContainerRef}
            className="relative flex-1 min-h-0 flex items-center justify-center p-2.5 sm:p-5 overflow-hidden"
          >
            <div
              style={fittedBoxStyle || { maxWidth: '100%', maxHeight: '100%' }}
              className={`relative flex items-center justify-center shadow-xl shadow-rose-900/10 rounded-2xl overflow-hidden border transition-colors bg-white ${
                isDragOver ? 'border-dashed border-rose-500 scale-[1.01]' : 'border-rose-200/70'
              }`}
              onTouchStart={() => {
                if (activeTab !== 'crop') setIsComparingOriginal(true);
              }}
              onTouchEnd={() => {
                if (activeTab !== 'crop') setIsComparingOriginal(false);
              }}
            >
              <canvas
                ref={canvasRef}
                className={
                  fittedBoxStyle
                    ? 'block w-full h-full object-contain rounded-2xl'
                    : 'block w-auto h-auto max-w-full max-h-full object-contain rounded-2xl'
                }
              />

              {activeTab === 'crop' && (
                <CropOverlay
                  crop={cropRegion}
                  aspectPreset={cropAspect}
                  imgWidth={natW}
                  imgHeight={natH}
                  onChange={setCropRegion}
                  onCommit={handleCommitCrop}
                />
              )}

              {isDragOver && (
                <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center text-rose-500 gap-2 z-30">
                  <Upload className="w-10 h-10 animate-bounce" />
                  <span className="text-sm font-bold">Thả ảnh vào đây để chỉnh màu nha</span>
                </div>
              )}

              {isComparingOriginal && (
                <div className="absolute top-3 left-3 z-20 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-xs font-bold text-rose-600 border border-rose-200 shadow-sm">
                  Ảnh gốc
                </div>
              )}
            </div>
          </div>

          {/* Dedicated Compare & Intensity Bar BELOW Photo */}
          <div className="shrink-0 w-full px-3 sm:px-6 py-2 bg-white border-t border-rose-100 flex items-center justify-center">
            <div className="w-full max-w-lg flex items-center gap-3">
              <button
                type="button"
                onMouseDown={() => setIsComparingOriginal(true)}
                onMouseUp={() => setIsComparingOriginal(false)}
                onMouseLeave={() => setIsComparingOriginal(false)}
                onTouchStart={() => setIsComparingOriginal(true)}
                onTouchEnd={() => setIsComparingOriginal(false)}
                className={`min-h-[40px] px-3.5 py-1.5 flex items-center gap-1.5 text-xs font-bold rounded-2xl transition-all shrink-0 active:scale-95 whitespace-nowrap ${
                  isComparingOriginal
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-rose-50 hover:bg-rose-100 text-[#3D242E] border border-rose-100'
                }`}
                title="Nhấn giữ để xem ảnh gốc (phím \)"
              >
                <Eye className={`w-3.5 h-3.5 ${isComparingOriginal ? 'text-white' : 'text-rose-500'}`} />
                <span className="sm:hidden">Ảnh gốc</span>
                <span className="hidden sm:inline">So sánh (\)</span>
              </button>

              <div className="flex-1 flex items-center gap-2.5">
                <span className="text-xs text-[#8C6B77] font-medium shrink-0 hidden sm:inline">Độ đậm</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={filterIntensity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setFilterIntensity(val);
                  pushHistory({
                    filterId: selectedFilterId,
                    intensity: val,
                    params: customParams,
                    crop: cropRegion,
                    cropAspect,
                  });
                }}
                  className="w-full studio-slider"
                />
                <span className="text-xs font-mono tabular-nums font-bold text-rose-500 w-9 text-right shrink-0">
                  {filterIntensity}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── MOBILE TOOL TRAY ── */}
        <div className="lg:hidden shrink-0 bg-white border-t border-rose-100 flex flex-col">
          {activeTab === 'filters' && (
            <div className="flex flex-col">
              {/* Category Strip + Filter Manager Trigger */}
              <div className="flex items-center border-b border-rose-100">
                <div className="flex-1 flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar">
                  {categories.map((c: FilterCategory) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCategory(c.id)}
                      className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                        activeCategory === c.id
                          ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                          : 'bg-rose-50 text-[#8C6B77] hover:text-[#3D242E]'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsManagerOpen(true)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#8C6B77] hover:text-rose-500 border-l border-rose-100 shrink-0"
                  title="Quản lý bộ lọc"
                  aria-label="Quản lý bộ lọc"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              {/* Single-row Horizontal Swipeable Filter Thumbnails */}
              <div className="flex items-start gap-2.5 px-3 py-2.5 overflow-x-auto no-scrollbar snap-x">
                {displayedFilters.map((f: FilterPreset) => {
                  const isSelected = selectedFilterId === f.id;
                  const thumb = thumbnails.get(f.id) || currentPhoto.dataUrl;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectFilter(f.id)}
                      className="snap-start flex flex-col items-center w-[72px] shrink-0 group"
                    >
                      <div
                        className={`relative w-[72px] h-[72px] rounded-2xl overflow-hidden bg-rose-50 border-2 transition-all ${
                          isSelected
                            ? 'border-rose-500 shadow-md shadow-rose-300/60 scale-[1.03]'
                            : 'border-rose-100'
                        }`}
                      >
                        <img
                          src={thumb}
                          alt={f.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <span
                        className={`text-[11px] mt-1 truncate w-full text-center ${
                          isSelected ? 'text-rose-600 font-bold' : 'text-[#5C3D49] font-medium'
                        }`}
                      >
                        {f.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quiet Active Filter Strip */}
              <div className="px-3 py-1.5 bg-[#FFF9FB] border-t border-rose-100 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-[#3D242E] shrink-0">{activeFilterPreset.name}</span>
                  <span className="text-rose-300 shrink-0">·</span>
                  <span className="text-[11px] text-[#8C6B77] truncate">
                    {activeFilterPreset.description}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-rose-500 font-bold shrink-0 px-2.5 py-1 rounded-xl hover:bg-rose-50"
                >
                  <Save className="w-3 h-3" />
                  <span>Lưu màu</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'tune' && (
            <div className="h-[34vh] min-h-[210px] max-h-[38vh] overflow-y-auto px-4 py-3">
              {renderFineTuneContent()}
            </div>
          )}

          {activeTab === 'curves' && (
            <div className="h-[34vh] min-h-[210px] max-h-[38vh] overflow-y-auto px-4 py-3 space-y-3">
              <div className="text-xs font-bold text-[#3D242E]">Đường cong ánh sáng (Curves)</div>
              <ToneCurvesEditor
                curves={
                  customParams.toneCurve || {
                    master: [[0, 0], [255, 255]],
                    r: [[0, 0], [255, 255]],
                    g: [[0, 0], [255, 255]],
                    b: [[0, 0], [255, 255]],
                  }
                }
                onChange={(updated) => updateParam('toneCurve', updated)}
              />
            </div>
          )}

          {activeTab === 'split' && (
            <div className="h-[34vh] min-h-[210px] max-h-[38vh] overflow-y-auto px-4 py-3">
              {renderSplitToningContent()}
            </div>
          )}

          {activeTab === 'crop' && (
            <div className="max-h-[38vh] overflow-y-auto px-4 py-3">
              {renderCropContent(true)}
            </div>
          )}
        </div>

        {/* ── MOBILE FIXED BOTTOM TAB BAR ── */}
        <nav
          aria-label="Chế độ chỉnh ảnh"
          className="lg:hidden grid grid-cols-5 bg-white border-t border-rose-100 safe-pb shrink-0 z-30"
        >
          {[
            { id: 'filters', label: 'Bộ lọc', icon: Sparkles },
            { id: 'tune', label: 'Tinh chỉnh', icon: Sliders },
            { id: 'curves', label: 'Đường cong', icon: TrendingUp },
            { id: 'split', label: 'Phân tông', icon: Palette },
            { id: 'crop', label: 'Cắt ảnh', icon: CropIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as StudioTab)}
                className={`min-h-[54px] py-1.5 flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-rose-500' : 'text-[#9E7C88] hover:text-[#3D242E]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={`text-[10.5px] whitespace-nowrap ${active ? 'font-bold' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── DESKTOP RIGHT SIDEBAR ── */}
        <aside className="hidden lg:flex w-96 xl:w-[420px] bg-white border-l border-rose-100 flex-col justify-between overflow-hidden">
          {activeTab === 'filters' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-rose-100 overflow-x-auto no-scrollbar">
                {categories.map((c: FilterCategory) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCategory(c.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                      activeCategory === c.id
                        ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                        : 'bg-rose-50 text-[#8C6B77] hover:text-[#3D242E]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start">
                {displayedFilters.map((f: FilterPreset) => {
                  const isSelected = selectedFilterId === f.id;
                  const thumb = thumbnails.get(f.id) || currentPhoto.dataUrl;

                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectFilter(f.id)}
                      className={`group relative flex flex-col items-center p-1.5 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'border-rose-500 bg-rose-50 shadow-md shadow-rose-200/60'
                          : 'border-rose-100 bg-[#FFF9FB] hover:bg-rose-50/70 hover:border-rose-200'
                      }`}
                    >
                      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-rose-50">
                        <img
                          src={thumb}
                          alt={f.name}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm ring-2 ring-white" />
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-semibold mt-1.5 truncate w-full text-center ${
                          isSelected ? 'text-rose-600 font-bold' : 'text-[#3D242E]'
                        }`}
                      >
                        {f.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3.5 bg-[#FFF9FB] border-t border-rose-100 flex items-center justify-between text-xs">
                <div className="flex-1 pr-2 min-w-0">
                  <div className="font-bold text-[#3D242E] truncate">{activeFilterPreset.name}</div>
                  <div className="text-[11px] text-[#8C6B77] truncate">
                    {activeFilterPreset.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-500 font-bold hover:bg-rose-100/70 rounded-xl shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu màu</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'tune' && (
            <div className="flex-1 overflow-y-auto p-4">{renderFineTuneContent()}</div>
          )}

          {activeTab === 'curves' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                <span className="text-xs font-bold text-[#3D242E]">Đường cong ánh sáng (Curves)</span>
              </div>
              <ToneCurvesEditor
                curves={
                  customParams.toneCurve || {
                    master: [[0, 0], [255, 255]],
                    r: [[0, 0], [255, 255]],
                    g: [[0, 0], [255, 255]],
                    b: [[0, 0], [255, 255]],
                  }
                }
                onChange={(updated) => updateParam('toneCurve', updated)}
              />
            </div>
          )}

          {activeTab === 'split' && (
            <div className="flex-1 overflow-y-auto p-4">{renderSplitToningContent()}</div>
          )}

          {activeTab === 'crop' && (
            <div className="flex-1 overflow-y-auto p-4">{renderCropContent(false)}</div>
          )}
        </aside>
      </div>

      {/* ── MOBILE PHOTO SOURCE BOTTOM SHEET ── */}
      {showMobileSourceSheet && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-[#2B1720]/45 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMobileSourceSheet(false);
          }}
        >
          <div className="w-full bg-white border-t border-rose-100 rounded-t-3xl p-5 safe-pb space-y-4 shadow-2xl">
            <div className="flex justify-center -mt-2 mb-1">
              <div className="w-10 h-1 bg-rose-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#3D242E]">Chọn ảnh để chỉnh màu</span>
              <button
                type="button"
                onClick={() => setShowMobileSourceSheet(false)}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] rounded-xl"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowMobileSourceSheet(false);
                  uploadInputRef.current?.click();
                }}
                className="min-h-[54px] flex items-center justify-center gap-2 p-3 bg-rose-500 text-white font-bold text-xs rounded-2xl shadow-md shadow-rose-200 active:scale-[0.98]"
              >
                <Upload className="w-4 h-4" />
                <span>Tải ảnh từ máy</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMobileSourceSheet(false);
                  onBackToCamera();
                }}
                className="min-h-[54px] flex items-center justify-center gap-2 p-3 bg-rose-50 text-[#3D242E] font-bold text-xs rounded-2xl border border-rose-200 active:scale-[0.98]"
              >
                <Camera className="w-4 h-4 text-rose-500" />
                <span>Chụp ảnh mới</span>
              </button>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#8C6B77] mb-2.5">
                Hoặc thử nhanh với ảnh mẫu xinh
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SAMPLE_PHOTOS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      setShowMobileSourceSheet(false);
                      onSelectSamplePhoto(sample);
                    }}
                    className="p-1.5 bg-[#FFF9FB] border border-rose-100 rounded-2xl text-center active:scale-95 transition-transform"
                  >
                    <div className="w-full aspect-square rounded-xl overflow-hidden mb-1">
                      <img
                        src={sample.url}
                        alt={sample.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-[11px] font-semibold text-[#3D242E] truncate">
                      {sample.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        sourceImage={sourceImageRef.current}
        cropRegion={cropRegion}
        params={customParams}
        intensity={filterIntensity}
        filterName={activeFilterPreset.name}
      />

      <FilterManagerModal
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        onSelectFilter={(id) => {
          selectFilter(id);
          setIsManagerOpen(false);
        }}
        onCreateNewFilterClick={() => {
          setIsManagerOpen(false);
          setIsCreateOpen(true);
        }}
      />

      <CreateFilterModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        currentParams={customParams}
        currentIntensity={filterIntensity}
        onSaved={(newId) => {
          refreshFilters();
          selectFilter(newId);
        }}
      />
    </div>
  );
};
