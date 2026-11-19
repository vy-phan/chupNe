import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Download, FileImage, Loader2, Share2, Sparkles, X } from 'lucide-react';
import { getCropPixelRect, isFullCrop } from '../engine/cropUtils';
import { exportGradedImage } from '../engine/filterEngine';
import { CropRegion, FilterParams } from '../types/filter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceImage: HTMLImageElement | null;
  cropRegion?: CropRegion;
  params: FilterParams;
  intensity: number;
  filterName: string;
}

export const ExportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  sourceImage,
  cropRegion,
  params,
  intensity,
  filterName,
}) => {
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [dimensionMode, setDimensionMode] = useState<number>(0);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportedResult, setExportedResult] = useState<{
    blob: Blob;
    dataUrl: string;
    width: number;
    height: number;
    sizeBytes: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setExportedResult(null);
      setProgress(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    if (!sourceImage) {
      setErrorMsg('Ảnh đang được tải vào Studio, bạn đợi một chút nhé.');
      return;
    }
    setIsExporting(true);
    setErrorMsg(null);
    setProgress(20);
    try {
      const res = await exportGradedImage(sourceImage, params, intensity, {
        format,
        quality,
        maxDimension: dimensionMode,
        crop: cropRegion,
        onProgress: (p) => setProgress(p),
      });
      setExportedResult(res);
    } catch (err) {
      setErrorMsg(`Xuất ảnh chưa thành công: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!exportedResult) return;
    const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp';
    const filename = `ChupNe_${filterName.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;

    const a = document.createElement('a');
    a.href = exportedResult.dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!exportedResult) return;
    const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp';
    const filename = `ChupNe_${Date.now()}.${ext}`;
    const file = new File([exportedResult.blob], filename, { type: format });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Ảnh chụp từ Chụp Nè',
          text: `Ảnh màu ${filterName} xinh xắn từ Chụp Nè`,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleDownload();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  const { sw: origWidth, sh: origHeight } = sourceImage
    ? getCropPixelRect(sourceImage.naturalWidth, sourceImage.naturalHeight, cropRegion)
    : { sw: 0, sh: 0 };
  const hasCrop = !isFullCrop(cropRegion);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#2B1720]/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full sm:max-w-md bg-white border-t sm:border border-rose-100 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-rose-900/15 overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-rose-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-rose-100 shrink-0">
          <div className="flex items-center gap-2.5 text-[#3D242E] font-bold text-base">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
              <FileImage className="w-4 h-4" />
            </div>
            <span>Lưu ảnh xinh về máy</span>
            {hasCrop && (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-500 border border-rose-200 rounded-full">
                Đã cắt {origWidth}×{origHeight}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] rounded-xl hover:bg-rose-50 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!sourceImage ? (
            <div className="py-10 text-center text-sm text-[#8C6B77]">
              Đang chuẩn bị ảnh để lưu, bạn đợi xíu nha...
            </div>
          ) : !exportedResult ? (
            <>
              {/* Format segmented control */}
              <div>
                <label className="block text-xs font-bold text-[#3D242E] mb-2">
                  Định dạng ảnh
                </label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-rose-50/70 border border-rose-100 rounded-2xl">
                  {[
                    { id: 'image/jpeg', label: 'JPG', sub: 'Khuyên dùng' },
                    { id: 'image/png', label: 'PNG', sub: 'Siêu nét' },
                    { id: 'image/webp', label: 'WebP', sub: 'Nhẹ máy' },
                  ].map((fmt) => {
                    const active = format === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setFormat(fmt.id as typeof format)}
                        className={`min-h-[48px] py-2 px-2 rounded-xl text-center transition-all ${
                          active
                            ? 'bg-rose-500 text-white font-bold shadow-sm shadow-rose-200'
                            : 'text-[#5C3D49] hover:bg-white'
                        }`}
                      >
                        <div className="text-sm font-bold leading-tight whitespace-nowrap">{fmt.label}</div>
                        <div className={`text-[11px] mt-0.5 whitespace-nowrap ${active ? 'text-rose-100' : 'text-[#8C6B77]'}`}>
                          {fmt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quality Slider (JPG / WebP) */}
              {format !== 'image/png' && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-[#3D242E]">Độ sắc nét</span>
                    <span className="font-mono tabular-nums font-bold text-rose-500">
                      {Math.round(quality * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.0}
                    step={0.02}
                    value={quality}
                    onChange={(e) => setQuality(parseFloat(e.target.value))}
                    className="w-full studio-slider"
                  />
                  <div className="flex justify-between text-[11px] text-[#8C6B77] mt-1.5">
                    <span>File nhẹ</span>
                    <span>Cân bằng</span>
                    <span>Nét tối đa</span>
                  </div>
                </div>
              )}

              {/* Dimension Mode */}
              <div>
                <label className="block text-xs font-bold text-[#3D242E] mb-2">
                  Kích thước ảnh
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 0, label: 'Ảnh gốc', desc: `${origWidth}×${origHeight}` },
                    { val: 2048, label: '2048 px', desc: 'Đăng IG/FB' },
                    { val: 1080, label: '1080 px', desc: 'Gửi nhanh' },
                  ].map((d) => {
                    const active = dimensionMode === d.val;
                    return (
                      <button
                        key={d.val}
                        type="button"
                        onClick={() => setDimensionMode(d.val)}
                        className={`min-h-[54px] p-2.5 rounded-2xl border text-center transition-all ${
                          active
                            ? 'bg-rose-50 border-rose-400 text-rose-600 shadow-sm'
                            : 'bg-[#FFF9FB] border-rose-100 text-[#5C3D49] hover:border-rose-200'
                        }`}
                      >
                        <div className="text-xs font-bold whitespace-nowrap">{d.label}</div>
                        <div className="text-[10px] text-[#8C6B77] tabular-nums mt-0.5 truncate">
                          {d.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress bar */}
              {isExporting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[#8C6B77]">
                    <span>Đang xử lý ảnh...</span>
                    <span className="tabular-nums font-mono text-rose-500 font-bold">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-rose-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Rendered Result Preview */
            <div className="space-y-4">
              <div className="relative h-52 bg-[#F7EDF1] rounded-2xl overflow-hidden border border-rose-100 flex items-center justify-center p-2">
                <img
                  src={exportedResult.dataUrl}
                  alt="Ảnh đã kết xuất"
                  className="max-h-full max-w-full object-contain rounded-xl shadow-sm"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[#8C6B77] px-1 tabular-nums">
                <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                  <Check className="w-4 h-4" />
                  Xong rồi nè!
                </span>
                <span>
                  {exportedResult.width} × {exportedResult.height} px · {formatSize(exportedResult.sizeBytes)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom CTA Zone */}
        <div className="px-5 py-4 safe-pb bg-white border-t border-rose-100 shrink-0">
          {!exportedResult ? (
            <button
              type="button"
              onClick={handleStartExport}
              disabled={isExporting || !sourceImage}
              className="w-full h-12 flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-sm rounded-2xl shadow-lg shadow-rose-300/60 transition-all active:scale-[0.98]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tạo ảnh...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Tạo ảnh & Lưu ngay
                </>
              )}
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 h-12 flex items-center justify-center gap-2 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm rounded-2xl shadow-lg shadow-rose-300/60 transition-all active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải về máy</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="h-12 px-4 flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-[#3D242E] font-bold text-sm rounded-2xl border border-rose-200 transition-all active:scale-[0.98]"
                >
                  <Share2 className="w-4 h-4 text-rose-500" />
                  <span>Chia sẻ</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setExportedResult(null)}
                className="w-full h-10 text-xs font-semibold text-[#8C6B77] hover:text-[#3D242E] transition-colors"
              >
                Chọn lại định dạng khác
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
