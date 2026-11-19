/**
 * Filter System Data Types for Chụp Nè
 * Professional Color Grading Studio
 */

export interface SplitToningParams {
  shadowHue: number; // 0 - 360
  shadowSat: number; // 0 - 100
  highlightHue: number; // 0 - 360
  highlightSat: number; // 0 - 100
  balance: number; // -100 to 100 (shifts midpoint)
}

export type CurvePoint = [number, number]; // [input 0-255, output 0-255]

export interface ToneCurveParams {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export interface ChannelMixerParams {
  r: [number, number, number]; // R, G, B contribution to Red output
  g: [number, number, number]; // R, G, B contribution to Green output
  b: [number, number, number]; // R, G, B contribution to Blue output
}

export interface FilterParams {
  exposure: number; // -100 to 100
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  vibrance: number; // -100 to 100
  temperature: number; // -100 to 100 (cool to warm)
  tint: number; // -100 to 100 (green to magenta)
  highlights: number; // -100 to 100
  shadows: number; // -100 to 100
  whites: number; // -100 to 100
  blacks: number; // -100 to 100
  fade: number; // 0 to 100 (matte film black lift)
  clarity: number; // -100 to 100
  sharpen: number; // 0 to 100
  grain: {
    amount: number; // 0 to 100
    size: number; // 1 to 5
  };
  vignette: {
    amount: number; // 0 to 100
    feather: number; // 0 to 100
  };
  hueShift: number; // -180 to 180
  grayscale: boolean;
  splitToning?: SplitToningParams;
  toneCurve?: ToneCurveParams;
  channelMixer?: ChannelMixerParams;
}

export interface FilterPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  type: 'builtin' | 'custom';
  version: number;
  createdAt: string;
  updatedAt?: string;
  defaultIntensity: number; // 0 - 100
  params: FilterParams;
}

export interface FilterCategory {
  id: string;
  name: string;
  isBuiltin?: boolean;
}

export interface FilterUserSettings {
  version: number;
  favorites: string[];
  hidden: string[];
  recentlyUsed: string[];
  filterOrder: string[]; // Ordered list of filter IDs
  categoryOrder: string[]; // Ordered list of category IDs
  overrides: Record<string, Partial<FilterPreset>>; // Custom tweaks on built-in filters
}

export interface CapturedPhoto {
  id: string;
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: string;
  capturedAt: number;
  initialFilterId?: string;
  initialIntensity?: number;
}

export interface CropRegion {
  x: number; // 0..1 normalized left
  y: number; // 0..1 normalized top
  width: number; // 0..1 normalized width
  height: number; // 0..1 normalized height
}

export type CropAspectPreset =
  | 'original'
  | 'free'
  | '1:1'
  | '4:5'
  | '9:16'
  | '3:4'
  | '4:3'
  | '16:9';

