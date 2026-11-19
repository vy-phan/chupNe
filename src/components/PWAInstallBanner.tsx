import React, { useState } from 'react';
import { Download, Sparkles, WifiOff, X } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isOnline, install } = usePWA();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || dismissed) {
    if (!isOnline) {
      return (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold shadow-lg backdrop-blur-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Đang offline — toàn bộ màu vẫn dùng bình thường nha!</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold shadow-lg backdrop-blur-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Đang offline — toàn bộ màu vẫn dùng bình thường nha!</span>
        </div>
      )}

      {isInstallable && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-md p-3 bg-white/95 border border-rose-200 rounded-2xl shadow-xl shadow-rose-900/10 backdrop-blur-md flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-rose-50 border border-rose-100 rounded-xl flex items-center justify-center text-rose-500 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#3D242E]">Cài đặt Chụp Nè</div>
              <div className="text-[11px] text-[#8C6B77]">Mở nhanh như app, không cần mạng</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={install}
              className="px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              Cài ngay
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="p-1.5 text-[#8C6B77] hover:text-[#3D242E]"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isIOS && !isInstallable && (
        <>
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-md p-3 bg-white/95 border border-rose-200 rounded-2xl shadow-xl shadow-rose-900/10 backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#3D242E]">Thêm vào Màn hình chính</div>
                <div className="text-[11px] text-[#8C6B77]">Mở nhanh như ứng dụng iPhone</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-200"
              >
                Xem cách cài
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="p-1.5 text-[#8C6B77] hover:text-[#3D242E]"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showIOSGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B1720]/45 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-3xl bg-white border border-rose-100 p-6 shadow-2xl text-left">
                <h3 className="text-base font-bold text-[#3D242E]">Cài trên iPhone / iPad</h3>
                <p className="mt-2.5 text-xs text-[#7A5965] leading-relaxed">
                  1. Nhấn nút <strong>Chia sẻ (Share)</strong> ở thanh dưới Safari.<br />
                  2. Kéo xuống chọn <strong>"Thêm vào MH chính"</strong>.<br />
                  3. Nhấn <strong>Thêm</strong> ở góc trên bên phải là xong nha!
                </p>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="mt-5 w-full rounded-2xl bg-rose-500 hover:bg-rose-600 py-2.5 text-xs font-bold text-white"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
