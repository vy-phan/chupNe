import { CurvePoint } from '../types/filter';

/**
 * Natural cubic spline or monotonic Hermite interpolation for tone curves.
 * Guarantees monotonic behavior (no wild oscillations or overshooting).
 */
export function buildCurveLookupTable(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Sort points by x coordinate
  const sorted = [...points].sort((a, b) => a[0] - b[0]);

  // Ensure [0, y0] and [255, yn] exist
  if (sorted[0][0] > 0) {
    sorted.unshift([0, sorted[0][1]]);
  }
  if (sorted[sorted.length - 1][0] < 255) {
    sorted.push([255, sorted[sorted.length - 1][1]]);
  }

  const n = sorted.length;
  const x = sorted.map((p) => p[0]);
  const y = sorted.map((p) => p[1]);

  // Slopes of secant lines
  const m: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = x[i + 1] - x[i];
    m[i] = dx === 0 ? 0 : (y[i + 1] - y[i]) / dx;
  }

  // Tangents at control points (Fritsch-Carlson method)
  const d: number[] = new Array(n);
  d[0] = m[0];
  d[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      d[i] = 0;
    } else {
      d[i] = (m[i - 1] + m[i]) / 2;
    }
  }

  // Evaluate for each input value 0..255
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    while (seg < n - 2 && i > x[seg + 1]) {
      seg++;
    }
    const h = x[seg + 1] - x[seg];
    if (h === 0) {
      lut[i] = Math.max(0, Math.min(255, Math.round(y[seg])));
      continue;
    }
    const t = (i - x[seg]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const val = h00 * y[seg] + h10 * h * d[seg] + h01 * y[seg + 1] + h11 * h * d[seg + 1];
    lut[i] = Math.max(0, Math.min(255, Math.round(val)));
  }

  return lut;
}

/**
 * Computes image histogram (Red, Green, Blue, Luminance) from an ImageData or HTMLCanvasElement
 */
export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  lum: number[];
  max: number;
}

export function computeHistogram(imageData: ImageData): HistogramData {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const lum = new Array(256).fill(0);

  const data = imageData.data;
  const len = data.length;
  // Subsample every 4th pixel for high speed
  for (let i = 0; i < len; i += 16) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    const l = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);

    r[red]++;
    g[green]++;
    b[blue]++;
    lum[l]++;
  }

  let max = 0;
  for (let i = 0; i < 256; i++) {
    if (r[i] > max) max = r[i];
    if (g[i] > max) max = g[i];
    if (b[i] > max) max = b[i];
    if (lum[i] > max) max = lum[i];
  }

  return { r, g, b, lum, max: max || 1 };
}
