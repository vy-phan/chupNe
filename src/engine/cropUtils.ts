import { CropAspectPreset, CropRegion } from '../types/filter';

export const FULL_CROP: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

export const CROP_PRESETS: {
  id: CropAspectPreset;
  label: string;
  hint: string;
  boxClass: string;
}[] = [
  { id: 'original', label: 'Gốc', hint: 'Toàn ảnh', boxClass: 'w-4 h-3.5' },
  { id: 'free', label: 'Tự do', hint: 'Tùy chỉnh', boxClass: 'w-4 h-3.5 border-dashed' },
  { id: '1:1', label: '1:1', hint: 'Vuông · IG', boxClass: 'w-3.5 h-3.5' },
  { id: '4:5', label: '4:5', hint: 'Chân dung', boxClass: 'w-3 h-4' },
  { id: '9:16', label: '9:16', hint: 'Story · TikTok', boxClass: 'w-2.5 h-4' },
  { id: '3:4', label: '3:4', hint: 'Dọc 3:4', boxClass: 'w-3 h-4' },
  { id: '4:3', label: '4:3', hint: 'Ngang 4:3', boxClass: 'w-4 h-3' },
  { id: '16:9', label: '16:9', hint: 'Rộng 16:9', boxClass: 'w-4 h-2.5' },
];

export function isFullCrop(crop?: CropRegion | null): boolean {
  if (!crop) return true;
  return (
    crop.x <= 0.001 &&
    crop.y <= 0.001 &&
    crop.width >= 0.999 &&
    crop.height >= 0.999
  );
}

export function clampCrop(crop: CropRegion): CropRegion {
  const minSize = 0.06;
  const width = Math.max(minSize, Math.min(1, crop.width));
  const height = Math.max(minSize, Math.min(1, crop.height));
  const x = Math.max(0, Math.min(1 - width, crop.x));
  const y = Math.max(0, Math.min(1 - height, crop.y));
  return { x, y, width, height };
}

export function getAspectRatioNumeric(
  preset: CropAspectPreset,
  imgWidth: number,
  imgHeight: number
): number | null {
  switch (preset) {
    case 'free':
      return null;
    case 'original':
      return imgHeight > 0 ? imgWidth / imgHeight : 1;
    case '1:1':
      return 1;
    case '4:5':
      return 4 / 5;
    case '9:16':
      return 9 / 16;
    case '3:4':
      return 3 / 4;
    case '4:3':
      return 4 / 3;
    case '16:9':
      return 16 / 9;
    default:
      return null;
  }
}

export function computeAspectCrop(
  imgWidth: number,
  imgHeight: number,
  preset: CropAspectPreset,
  currentCrop?: CropRegion
): CropRegion {
  if (preset === 'original') {
    return { ...FULL_CROP };
  }
  if (preset === 'free') {
    return currentCrop ? clampCrop(currentCrop) : { ...FULL_CROP };
  }

  const targetPixelRatio = getAspectRatioNumeric(preset, imgWidth, imgHeight);
  if (!targetPixelRatio || imgWidth <= 0 || imgHeight <= 0) {
    return { ...FULL_CROP };
  }

  const imgRatio = imgWidth / imgHeight;
  // Normalized aspect ratio: crop.width / crop.height
  const normRatio = targetPixelRatio / imgRatio;

  let width: number;
  let height: number;
  if (normRatio >= 1) {
    width = 1;
    height = 1 / normRatio;
  } else {
    height = 1;
    width = normRatio;
  }

  // Center around current crop's center if available, otherwise center of image
  const cx = currentCrop ? currentCrop.x + currentCrop.width / 2 : 0.5;
  const cy = currentCrop ? currentCrop.y + currentCrop.height / 2 : 0.5;

  return clampCrop({
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  });
}

export function getCropPixelRect(
  naturalWidth: number,
  naturalHeight: number,
  crop?: CropRegion | null
): { sx: number; sy: number; sw: number; sh: number } {
  if (!crop || isFullCrop(crop) || naturalWidth <= 0 || naturalHeight <= 0) {
    return {
      sx: 0,
      sy: 0,
      sw: Math.max(1, naturalWidth),
      sh: Math.max(1, naturalHeight),
    };
  }

  const sx = Math.max(0, Math.min(naturalWidth - 1, Math.round(crop.x * naturalWidth)));
  const sy = Math.max(0, Math.min(naturalHeight - 1, Math.round(crop.y * naturalHeight)));
  const sw = Math.max(1, Math.min(naturalWidth - sx, Math.round(crop.width * naturalWidth)));
  const sh = Math.max(1, Math.min(naturalHeight - sy, Math.round(crop.height * naturalHeight)));
  return { sx, sy, sw, sh };
}

export function createCroppedCanvas(
  sourceImage: HTMLImageElement,
  crop?: CropRegion | null,
  targetWidth?: number,
  targetHeight?: number
): HTMLCanvasElement {
  const { sx, sy, sw, sh } = getCropPixelRect(
    sourceImage.naturalWidth || sourceImage.width,
    sourceImage.naturalHeight || sourceImage.height,
    crop
  );

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth || sw;
  canvas.height = targetHeight || sh;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}
