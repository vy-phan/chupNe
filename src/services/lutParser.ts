import { DEFAULT_FILTER_PARAMS } from '../data/builtinFilters';
import { FilterParams, FilterPreset } from '../types/filter';

/**
 * Parses Adobe / DaVinci Resolve .cube LUT text format into a native FilterPreset
 */
export function parseCubeLUT(cubeText: string, fileName: string): FilterPreset {
  const lines = cubeText.split(/\r?\n/);
  let title = fileName.replace(/\.cube$/i, '');
  let lutSize = 0;
  const rgbData: [number, number, number][] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      const match = line.match(/TITLE\s+"?([^"]+)"?/i);
      if (match && match[1]) title = match[1].trim();
    } else if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      if (parts[1]) lutSize = parseInt(parts[1], 10);
    } else if (line.startsWith('LUT_1D_SIZE')) {
      const parts = line.split(/\s+/);
      if (parts[1]) lutSize = parseInt(parts[1], 10);
    } else {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          rgbData.push([r, g, b]);
        }
      }
    }
  }

  // Analyze RGB transformations from the LUT points
  const params: FilterParams = JSON.parse(JSON.stringify(DEFAULT_FILTER_PARAMS));

  if (rgbData.length > 0) {
    // Sample black point, midpoint, white point
    const blackPt = rgbData[0]; // Input (0,0,0)
    const midIdx = Math.floor(rgbData.length / 2);
    const midPt = rgbData[midIdx];
    const whitePt = rgbData[rgbData.length - 1]; // Input (1,1,1)

    // Contrast estimation: difference in slope between midpoint and edges
    const midLuma = 0.299 * midPt[0] + 0.587 * midPt[1] + 0.114 * midPt[2];
    const blackLuma = 0.299 * blackPt[0] + 0.587 * blackPt[1] + 0.114 * blackPt[2];
    const whiteLuma = 0.299 * whitePt[0] + 0.587 * whitePt[1] + 0.114 * whitePt[2];

    // Fade / Lifted blacks
    if (blackLuma > 0.03) {
      params.fade = Math.min(60, Math.round(blackLuma * 120));
      params.shadows = Math.round(blackLuma * 40);
    }

    // Midtone brightness / exposure
    if (midLuma > 0.55) {
      params.brightness = Math.round((midLuma - 0.5) * 40);
    } else if (midLuma < 0.45) {
      params.brightness = Math.round((midLuma - 0.5) * 40);
    }

    // Temperature & Tint
    const rShift = midPt[0] - midLuma;
    const bShift = midPt[2] - midLuma;
    const gShift = midPt[1] - midLuma;

    params.temperature = Math.max(-50, Math.min(50, Math.round((rShift - bShift) * 60)));
    params.tint = Math.max(-50, Math.min(50, Math.round((-gShift + (rShift + bShift) * 0.5) * 60)));

    // Contrast
    const span = whiteLuma - blackLuma;
    if (span > 0.95) {
      params.contrast = Math.round((span - 0.9) * 80);
    } else if (span < 0.85) {
      params.contrast = Math.round((span - 0.9) * 80);
    }

    // Generate custom Tone Curve from sampled points
    params.toneCurve = {
      master: [
        [0, Math.min(255, Math.max(0, Math.round(blackLuma * 255)))],
        [64, Math.min(255, Math.max(0, Math.round(blackLuma * 180 + midLuma * 80)))],
        [128, Math.min(255, Math.max(0, Math.round(midLuma * 255)))],
        [192, Math.min(255, Math.max(0, Math.round(midLuma * 100 + whiteLuma * 160)))],
        [255, Math.min(255, Math.max(0, Math.round(whiteLuma * 255)))],
      ],
      r: [
        [0, Math.round(blackPt[0] * 255)],
        [128, Math.round(midPt[0] * 255)],
        [255, Math.round(whitePt[0] * 255)],
      ],
      g: [
        [0, Math.round(blackPt[1] * 255)],
        [128, Math.round(midPt[1] * 255)],
        [255, Math.round(whitePt[1] * 255)],
      ],
      b: [
        [0, Math.round(blackPt[2] * 255)],
        [128, Math.round(midPt[2] * 255)],
        [255, Math.round(whitePt[2] * 255)],
      ],
    };
  }

  const id = `lut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id,
    name: title,
    category: 'custom',
    description: `Filter nhập từ file 3D LUT ${fileName} (kích thước ${lutSize}x${lutSize}x${lutSize})`,
    tags: ['lut', 'custom', 'nhập ngoài', '3d lut'],
    type: 'custom',
    version: 1,
    createdAt: new Date().toISOString().split('T')[0],
    defaultIntensity: 85,
    params,
  };
}
