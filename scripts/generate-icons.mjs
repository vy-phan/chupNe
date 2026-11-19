import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal PNG encoder in pure Node.js
function createPng(width, height, getPixel) {
  // getPixel: (x, y) => [r, g, b, a]
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const rawData = Buffer.alloc((rowBytes + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const body = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', deflated);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ---- Color helpers ----
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];

const CREAM_A = [255, 249, 251]; // #FFF9FB
const CREAM_B = [255, 232, 240]; // #FFE8F0
const PINK_RING = [251, 207, 232]; // #FBCFE8
const PINK_STROKE = [249, 168, 212]; // #F9A8D4
const ROSE = [244, 63, 94]; // #F43F5E
const BLUSH = [253, 164, 175]; // #FDA4AF
const DARK_PLUM = [76, 38, 52]; // #4C2634

// distance from point (px,py) to segment (x1,y1)-(x2,y2)
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Viewfinder corner brackets matching icon.svg (L-shaped strokes)
const CORNERS = [
  // each corner: two segments [x1,y1,x2,y2]
  [[-0.6875, -0.6875, -0.6875, -0.453], [-0.6875, -0.6875, -0.453, -0.6875]], // top-left
  [[0.6875, -0.6875, 0.6875, -0.453], [0.6875, -0.6875, 0.453, -0.6875]], // top-right
  [[-0.6875, 0.6875, -0.6875, 0.453], [-0.6875, 0.6875, -0.453, 0.6875]], // bottom-left
  [[0.6875, 0.6875, 0.6875, 0.453], [0.6875, 0.6875, 0.453, 0.6875]], // bottom-right
];

function makeIconSampler(rounded) {
  return (x, y, w, h) => {
    const nx = (x / w) * 2 - 1;
    const ny = (y / h) * 2 - 1;
    const dist = Math.hypot(nx, ny);

    // Transparent rounded corners (rx=108 on 512 viewBox)
    if (rounded) {
      const cr = 0.42;
      const cx = 1 - cr, cy = 1 - cr;
      const ax = Math.abs(nx), ay = Math.abs(ny);
      if (ax > cx && ay > cy && Math.hypot(ax - cx, ay - cy) > cr) {
        return [0, 0, 0, 0];
      }
    }

    // 1) Cream-pink diagonal background gradient
    const t = Math.max(0, Math.min(1, (nx + ny) / 2 * 0.5 + 0.5));
    let col = mix(CREAM_A, CREAM_B, t);

    // 2) Outer thin ring (r=190/256)
    if (Math.abs(dist - 0.742) < 0.012) {
      col = PINK_RING;
    }

    // 3) Lens disc (r=160/256) with pink radial fill + stroke
    if (dist < 0.625) {
      if (dist > 0.598) {
        col = PINK_STROKE;
      } else {
        // radial lens gradient: center #FFF5F8 -> edge #FBCFE8
        const lt = Math.min(1, dist / 0.6);
        const c1 = [255, 245, 248], c2 = [251, 207, 232];
        col = mix(c1, c2, lt * lt);
      }
    }

    // 4) Dashed rose aperture ring (r=110/256, dasharray 24 10)
    if (dist > 0.415 && dist < 0.445) {
      const angle = (Math.atan2(ny, nx) + Math.PI) / (Math.PI * 2); // 0..1 around circle
      // dasharray total 34px on circumference 2*pi*110px -> fraction of turn
      const p = 34 / (2 * Math.PI * 110);
      const on = (angle % p) < p * (24 / 34);
      if (on) col = ROSE;
    }

    // 5) Center dark plum disc (r=85/256) with rose glow
    if (dist < 0.332) {
      col = DARK_PLUM;
      // apertureGlow radial at approx (40%,35%) -> nx=-0.125, ny=-0.219, r~0.6
      const gd = Math.hypot(nx + 0.125, ny + 0.219);
      const glow = Math.max(0, 1 - gd / 0.62);
      if (glow > 0) col = mix(col, [251, 113, 133], Math.min(1, glow * 0.95));
    }

    // 6) Lens reflections
    const r1 = Math.hypot(nx + 0.121, ny + 0.121); // (225,225), r=30
    if (r1 < 0.117) {
      col = mix(col, [255, 255, 255], 0.7);
    }
    const r2 = Math.hypot(nx - 0.094, ny - 0.094); // (280,280), r=14
    if (r2 < 0.055) {
      col = mix(col, BLUSH, 0.75);
    }

    // 7) Flash dots: (390,120) r=14 rose, (120,120) r=10 pink
    if (Math.hypot(nx - 0.523, ny + 0.531) < 0.055) col = ROSE;
    if (Math.hypot(nx + 0.531, ny + 0.531) < 0.039) col = PINK_STROKE;

    // 8) Viewfinder corner brackets
    for (const [s1, s2] of CORNERS) {
      if (
        segDist(nx, ny, s1[0], s1[1], s1[2], s1[3]) < 0.016 ||
        segDist(nx, ny, s2[0], s2[1], s2[2], s2[3]) < 0.016
      ) {
        col = ROSE;
      }
    }

    return [col[0], col[1], col[2], 255];
  };
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Generating PWA icons...');
const icon192 = createPng(192, 192, makeIconSampler(true));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);

const icon512 = createPng(512, 512, makeIconSampler(true));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);

// Maskable icons must be full-bleed (no rounded corners / transparency)
const maskable512 = createPng(512, 512, makeIconSampler(false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), maskable512);

const appleTouchIcon = createPng(180, 180, makeIconSampler(true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchIcon);

console.log('Icons generated successfully!');
