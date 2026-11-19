import React, { useState } from 'react';
import { Bookmark, Sparkles, X } from 'lucide-react';
import { filterRegistry } from '../services/filterRegistry';
import { FilterParams, FilterPreset } from '../types/filter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentParams: FilterParams;
  currentIntensity: number;
  onSaved: (newFilterId: string) => void;
}

export const CreateFilterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentParams,
  currentIntensity,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('portrait');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('da đẹp, nhẹ nhàng, phim');
  const [intensity, setIntensity] = useState(currentIntensity || 85);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const categories = filterRegistry.getCategories();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const newFilter: FilterPreset = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      category,
      description: description.trim() || 'Công thức màu riêng xinh xắn của bạn.',
      tags: tags.length > 0 ? tags : ['tùy chỉnh', 'tự tạo'],
      type: 'custom',
      version: 1,
      createdAt: new Date().toISOString().split('T')[0],
      defaultIntensity: intensity,
      params: JSON.parse(JSON.stringify(currentParams)),
    };

    await filterRegistry.saveCustomFilter(newFilter);
    setIsSubmitting(false);
    onSaved(newFilter.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#2B1720]/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full sm:max-w-md bg-white border-t sm:border border-rose-100 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-rose-900/15 p-5 safe-pb overflow-hidden">
        <div className="sm:hidden flex justify-center -mt-2 mb-2">
          <div className="w-10 h-1 bg-rose-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-rose-100">
          <div className="flex items-center gap-2 text-[#3D242E] font-bold text-base">
            <Sparkles className="w-5 h-5 text-rose-500" />
            <span>Lưu công thức màu riêng</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] -mr-1.5 flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] rounded-xl hover:bg-rose-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-[#3D242E] mb-1">
              Tên màu mới *
            </label>
            <input
              type="text"
              required
              placeholder="Ví dụ: Má Hồng Pastel, Nắng Chiều Đà Lạt..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFF9FB] border border-rose-200 rounded-xl text-xs text-[#3D242E] placeholder-[#B5929F] focus:outline-none focus:border-rose-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#3D242E] mb-1">
                Nhóm màu
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#FFF9FB] border border-rose-200 rounded-xl text-xs text-[#3D242E] focus:outline-none focus:border-rose-400"
              >
                {categories
                  .filter((c) => c.id !== 'all' && c.id !== 'favorites' && c.id !== 'recent')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                <option value="custom">Màu tự tạo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3D242E] mb-1">
                Độ đậm mặc định: <span className="text-rose-500 tabular-nums">{intensity}%</span>
              </label>
              <input
                type="range"
                min={20}
                max={100}
                value={intensity}
                onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
                className="w-full mt-2.5 studio-slider"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3D242E] mb-1">
              Mô tả ngắn (hợp cảnh nào)
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Da sáng hồng hào, hợp chụp quán cafe..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFF9FB] border border-rose-200 rounded-xl text-xs text-[#3D242E] placeholder-[#B5929F] focus:outline-none focus:border-rose-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3D242E] mb-1">
              Thẻ tìm kiếm (cách nhau bằng dấu phẩy)
            </label>
            <input
              type="text"
              placeholder="dễ thương, sáng da, phim, cafe"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFF9FB] border border-rose-200 rounded-xl text-xs text-[#3D242E] placeholder-[#B5929F] focus:outline-none focus:border-rose-400"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-rose-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 bg-rose-50 hover:bg-rose-100 text-[#5C3D49] text-xs font-semibold rounded-xl"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="min-h-[42px] flex items-center gap-1.5 px-5 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-200 transition-colors"
            >
              <Bookmark className="w-4 h-4" />
              <span>Lưu vào kho màu</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
