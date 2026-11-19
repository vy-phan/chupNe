import React, { useState } from 'react';
import { Camera, Check, ChevronRight, Sliders, Sparkles } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      icon: Camera,
      badge: 'Bước 1/3',
      title: 'Chụp ảnh siêu xinh',
      desc: 'Chọn khung 1:1, 4:3, 16:9, lật gương selfie, hẹn giờ 3s/10s hoặc chụp liên tiếp 5 tấm. Vuốt ngang trên màn hình chụp để xem trước màu ngay lập tức!',
    },
    {
      icon: Sparkles,
      badge: 'Bước 2/3',
      title: 'Hơn 47 công thức màu ngọt ngào',
      desc: 'Từ phim Nhật nhẹ nhàng, da hồng hào tự nhiên đến tone điện ảnh cổ điển. Mọi ô xem trước đều dùng chính ảnh của bạn nên chọn màu cực dễ.',
    },
    {
      icon: Sliders,
      badge: 'Bước 3/3',
      title: 'Chỉnh nhẹ nhàng & Lưu ảnh nét căng',
      desc: 'Kéo thanh độ đậm màu, nhấn giữ "Ảnh gốc" để so sánh, tự tạo công thức màu riêng và lưu ảnh chất lượng cao hoàn toàn riêng tư trên máy bạn.',
    },
  ];

  const current = steps[step];
  const IconComp = current.icon;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem('chup_ne_onboarding_done', 'true');
      onClose();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('chup_ne_onboarding_done', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1720]/45 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-white border border-rose-100 rounded-3xl shadow-2xl shadow-rose-900/15 p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-rose-500">
            {current.badge}
          </span>
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs font-medium text-[#8C6B77] hover:text-[#3D242E] transition-colors px-2 py-1"
          >
            Bỏ qua
          </button>
        </div>

        <div className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-500 mb-4">
          <IconComp className="w-7 h-7" />
        </div>

        <h3 className="text-lg font-bold text-[#3D242E] mb-2">{current.title}</h3>
        <p className="text-xs leading-relaxed text-[#7A5965] mb-6">{current.desc}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-rose-500' : 'w-1.5 bg-rose-200'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-2xl shadow-md shadow-rose-200 transition-all active:scale-[0.98]"
          >
            {step === steps.length - 1 ? (
              <>
                <Check className="w-4 h-4" />
                <span>Bắt đầu thôi!</span>
              </>
            ) : (
              <>
                <span>Tiếp tục</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
