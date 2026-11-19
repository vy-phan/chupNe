import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderPlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { filterRegistry } from '../services/filterRegistry';
import { parseCubeLUT } from '../services/lutParser';
import { FilterCategory, FilterPreset } from '../types/filter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectFilter?: (filterId: string) => void;
  onCreateNewFilterClick: () => void;
}

export const FilterManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelectFilter,
  onCreateNewFilterClick,
}) => {
  const [filters, setFilters] = useState<FilterPreset[]>([]);
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [undoDeletedFilter, setUndoDeletedFilter] = useState<FilterPreset | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lutInputRef = useRef<HTMLInputElement | null>(null);

  const refreshData = () => {
    setFilters(filterRegistry.getAllFilters(true));
    setCategories(filterRegistry.getCategories());
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      setConfirmDeleteId(null);
      setConfirmRestore(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const unsub = filterRegistry.subscribe(refreshData);
    return unsub;
  }, []);

  if (!isOpen) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const filteredList = filters.filter((f) => {
    if (f.id === 'none') return false;
    if (onlyFavorites && !filterRegistry.isFavorite(f.id)) return false;
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = f.name.toLowerCase().includes(q);
      const matchDesc = f.description.toLowerCase().includes(q);
      const matchTags = f.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchTags) return false;
    }
    return true;
  });

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await filterRegistry.toggleFavorite(id);
  };

  const handleToggleHidden = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isHidden = await filterRegistry.toggleHidden(id);
    showStatus(isHidden ? 'Đã ẩn bộ lọc khỏi thanh chọn' : 'Đã hiện lại bộ lọc');
  };

  const handleDuplicate = async (f: FilterPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    const cloned: FilterPreset = {
      ...f,
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${f.name} (Bản sao)`,
      type: 'custom',
      createdAt: new Date().toISOString().split('T')[0],
    };
    await filterRegistry.saveCustomFilter(cloned);
    showStatus(`Đã nhân bản "${cloned.name}"`);
  };

  const handleDelete = async (f: FilterPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (f.type === 'builtin') {
      showStatus('Bộ lọc mặc định chỉ có thể ẩn, không xóa được nha.');
      return;
    }
    if (confirmDeleteId !== f.id) {
      setConfirmDeleteId(f.id);
      return;
    }
    setConfirmDeleteId(null);
    const deleted = await filterRegistry.deleteCustomFilter(f.id);
    if (deleted) {
      setUndoDeletedFilter(deleted);
      showStatus(`Đã xóa "${f.name}".`);
    }
  };

  const handleUndoDelete = async () => {
    if (undoDeletedFilter) {
      await filterRegistry.saveCustomFilter(undoDeletedFilter);
      showStatus(`Đã khôi phục "${undoDeletedFilter.name}"`);
      setUndoDeletedFilter(null);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!confirmRestore) {
      setConfirmRestore(true);
      setTimeout(() => setConfirmRestore(false), 4000);
      return;
    }
    setConfirmRestore(false);
    await filterRegistry.restoreBuiltinDefaults();
    showStatus('Đã khôi phục toàn bộ cài đặt mặc định');
  };

  const handleExportSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const jsonStr = filterRegistry.exportFilterJSON(id);
      const f = filterRegistry.getFilterById(id);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `filter_${f?.name || id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Đã xuất file filter JSON');
    } catch {
      showStatus('Xuất filter thất bại');
    }
  };

  const handleExportAll = () => {
    const jsonStr = filterRegistry.exportAllJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ChupNe_BoLoc_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Đã xuất toàn bộ kho bộ lọc');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = await filterRegistry.importJSON(text, 'clone');
    if (res.errors.length) {
      showStatus(`Lỗi nhập file: ${res.errors.join(', ')}`);
    } else {
      showStatus(`Đã nhập ${res.imported} bộ lọc thành công!`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportLUT = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const preset = parseCubeLUT(text, file.name);
      await filterRegistry.saveCustomFilter(preset);
      showStatus(`Đã nạp LUT "${preset.name}" thành filter mới!`);
    } catch {
      showStatus('Không thể đọc file .cube này. Bạn kiểm tra lại định dạng nhé.');
    }
    if (lutInputRef.current) lutInputRef.current.value = '';
  };

  const moveFilter = async (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= filteredList.length) return;

    const currentOrder = filters.map((x) => x.id);
    const idA = filteredList[idx].id;
    const idB = filteredList[targetIdx].id;

    const posA = currentOrder.indexOf(idA);
    const posB = currentOrder.indexOf(idB);
    if (posA !== -1 && posB !== -1) {
      const temp = currentOrder[posA];
      currentOrder[posA] = currentOrder[posB];
      currentOrder[posB] = temp;
      await filterRegistry.reorderFilters(currentOrder);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await filterRegistry.addCategory(newCategoryName.trim());
    setNewCategoryName('');
    setShowAddCategory(false);
    showStatus('Đã tạo nhóm màu mới');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-[#2B1720]/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full sm:max-w-4xl max-h-[92dvh] bg-white border-t sm:border border-rose-100 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-rose-900/15 overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-rose-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-rose-100 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#3D242E] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-500" />
              <span>Kho Bộ Lọc Màu</span>
            </h2>
            <p className="text-xs text-[#8C6B77] mt-0.5">
              Tùy biến, yêu thích, sắp xếp và tạo công thức màu riêng
            </p>
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

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[#FFF9FB] border-b border-rose-100 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCreateNewFilterClick}
              className="min-h-[38px] flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-sm shadow-rose-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo màu mới</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-[#3D242E] text-xs font-semibold rounded-xl transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-rose-500" />
              <span>Nhập JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />

            <button
              type="button"
              onClick={() => lutInputRef.current?.click()}
              className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-[#3D242E] text-xs font-semibold rounded-xl transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-rose-500" />
              <span>Nhập .cube LUT</span>
            </button>
            <input
              ref={lutInputRef}
              type="file"
              accept=".cube"
              className="hidden"
              onChange={handleImportLUT}
            />

            <button
              type="button"
              onClick={handleExportAll}
              className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-[#3D242E] text-xs font-semibold rounded-xl transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-rose-500" />
              <span>Xuất tất cả</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleRestoreDefaults}
            className={`min-h-[36px] flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors ${
              confirmRestore
                ? 'bg-rose-500 text-white'
                : 'text-[#8C6B77] hover:text-rose-500 hover:bg-rose-50'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{confirmRestore ? 'Nhấn lại để khôi phục' : 'Khôi phục mặc định'}</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-5 py-3 border-b border-rose-100 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5929F]" />
            <input
              type="text"
              placeholder="Tìm tên màu, thẻ (ấm, phim, ngọt ngào...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#FFF9FB] border border-rose-200 rounded-xl text-xs text-[#3D242E] placeholder-[#B5929F] focus:outline-none focus:border-rose-400"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
            <button
              type="button"
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors shrink-0 ${
                onlyFavorites
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-rose-50 text-[#5C3D49] border border-rose-100 hover:bg-rose-100'
              }`}
            >
              <Star className="w-3.5 h-3.5" fill={onlyFavorites ? 'currentColor' : 'none'} />
              <span>Yêu thích</span>
            </button>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-h-[36px] px-3 py-1.5 bg-[#FFF9FB] border border-rose-200 rounded-xl text-xs text-[#3D242E] font-medium focus:outline-none focus:border-rose-400 shrink-0"
            >
              <option value="all">Tất cả nhóm ({filters.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowAddCategory(!showAddCategory)}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-rose-50 border border-rose-100 rounded-xl text-rose-500 hover:bg-rose-100 transition-colors shrink-0"
              title="Thêm nhóm mới"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Add Category Form */}
        {showAddCategory && (
          <form
            onSubmit={handleAddCategory}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-50/70 border-b border-rose-100 shrink-0"
          >
            <input
              type="text"
              placeholder="Nhập tên nhóm filter mới..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs text-[#3D242E]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-rose-500 text-white text-xs font-bold rounded-xl"
            >
              Tạo nhóm
            </button>
          </form>
        )}

        {/* Notification Toast */}
        {statusMessage && (
          <div className="flex items-center justify-between px-5 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 font-medium shrink-0">
            <span>{statusMessage}</span>
            {undoDeletedFilter && (
              <button
                type="button"
                onClick={handleUndoDelete}
                className="flex items-center gap-1 font-bold underline hover:text-rose-900"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Hoàn tác</span>
              </button>
            )}
          </div>
        )}

        {/* Filter List Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-[#8C6B77] text-sm">
              Chưa tìm thấy bộ lọc nào phù hợp nè.
            </div>
          ) : (
            filteredList.map((f, idx) => {
              const isFav = filterRegistry.isFavorite(f.id);
              const isHid = filterRegistry.isHidden(f.id);

              return (
                <div
                  key={f.id}
                  onClick={() => onSelectFilter?.(f.id)}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isHid
                      ? 'bg-[#FFF9FB] border-rose-100 opacity-60'
                      : 'bg-white hover:bg-rose-50/50 border-rose-100 hover:border-rose-200 shadow-xs'
                  }`}
                >
                  {/* Left: Info */}
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(f.id, e)}
                      className="p-1.5 text-rose-300 hover:text-rose-500 transition-colors"
                      aria-label="Yêu thích"
                    >
                      <Star
                        className="w-4 h-4"
                        fill={isFav ? '#F43F5E' : 'none'}
                        stroke={isFav ? '#F43F5E' : 'currentColor'}
                      />
                    </button>

                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-[#3D242E]">
                        <span>{f.name}</span>
                        {f.type === 'custom' && (
                          <span className="text-[11px] font-semibold text-rose-500">
                            · Tự tạo
                          </span>
                        )}
                        {isHid && (
                          <span className="text-[11px] font-medium text-[#8C6B77]">
                            · Đang ẩn
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#7A5965] mt-0.5 max-w-xl line-clamp-1">
                        {f.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#9E7C88] tabular-nums">
                        <span>Độ đậm gốc: {f.defaultIntensity}%</span>
                        <span>·</span>
                        <span>{f.tags.join(', ')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveFilter(idx, 'up');
                      }}
                      disabled={idx === 0}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] disabled:opacity-30 rounded-xl hover:bg-rose-50 transition-colors"
                      title="Chuyển lên"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveFilter(idx, 'down');
                      }}
                      disabled={idx === filteredList.length - 1}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] disabled:opacity-30 rounded-xl hover:bg-rose-50 transition-colors"
                      title="Chuyển xuống"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    <div className="h-4 w-px bg-rose-100 mx-0.5" />

                    <button
                      type="button"
                      onClick={(e) => handleToggleHidden(f.id, e)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] rounded-xl hover:bg-rose-50 transition-colors"
                      title={isHid ? 'Hiện filter' : 'Ẩn filter'}
                    >
                      {isHid ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDuplicate(f, e)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] rounded-xl hover:bg-rose-50 transition-colors"
                      title="Nhân bản"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleExportSingle(f.id, e)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#8C6B77] hover:text-[#3D242E] rounded-xl hover:bg-rose-50 transition-colors"
                      title="Xuất file JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {f.type === 'custom' && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(f, e)}
                        className={`min-h-[36px] px-2 flex items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                          confirmDeleteId === f.id
                            ? 'bg-rose-500 text-white'
                            : 'text-rose-500 hover:bg-rose-50'
                        }`}
                        title="Xóa bộ lọc"
                      >
                        {confirmDeleteId === f.id ? 'Xóa?' : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 safe-pb border-t border-rose-100 bg-[#FFF9FB] text-xs text-[#8C6B77] shrink-0">
          <span className="tabular-nums">{filteredList.length} công thức màu</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-colors"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};
