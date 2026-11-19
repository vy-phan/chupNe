import { CropRegion, FilterParams } from '../types/filter';
import { createCroppedCanvas, getCropPixelRect, isFullCrop } from './cropUtils';
import { buildCurveLookupTable } from './curveUtils';

// Vertex Shader for Fullscreen Quad
const VS_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Professional Color Grading Fragment Shader
const FS_SOURCE = `
precision highp float;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform sampler2D u_curveTexture; // 256x4 texture: Row 0=Master, 1=R, 2=G, 3=B

uniform float u_intensity; // 0.0 to 1.0
uniform float u_exposure;   // -1.0 to 1.0
uniform float u_brightness; // -1.0 to 1.0
uniform float u_contrast;   // -1.0 to 1.0
uniform float u_saturation; // -1.0 to 1.0
uniform float u_vibrance;   // -1.0 to 1.0
uniform float u_temperature;// -1.0 to 1.0 (cool/warm)
uniform float u_tint;       // -1.0 to 1.0 (green/magenta)
uniform float u_highlights; // -1.0 to 1.0
uniform float u_shadows;    // -1.0 to 1.0
uniform float u_whites;     // -1.0 to 1.0
uniform float u_blacks;     // -1.0 to 1.0
uniform float u_fade;       // 0.0 to 1.0
uniform float u_vignetteAmount;
uniform float u_vignetteFeather;
uniform float u_grainAmount;
uniform float u_grainSize;
uniform int   u_grayscale;
uniform vec2  u_resolution;
uniform float u_time;

// Split toning
uniform float u_shadowHue;       // 0 to 1
uniform float u_shadowSat;       // 0 to 1
uniform float u_highlightHue;    // 0 to 1
uniform float u_highlightSat;    // 0 to 1
uniform float u_splitBalance;    // -1 to 1

// Pseudo-random generator for realistic film grain
float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Convert RGB to HSL
vec3 rgb2hsl(vec3 c) {
  float cMin = min(min(c.r, c.g), c.b);
  float cMax = max(max(c.r, c.g), c.b);
  float delta = cMax - cMin;
  
  float h = 0.0;
  float s = 0.0;
  float l = (cMax + cMin) * 0.5;

  if (delta > 0.00001) {
    s = (l < 0.5) ? (delta / (cMax + cMin)) : (delta / (2.0 - cMax - cMin));
    if (c.r >= cMax) {
      h = (c.g - c.b) / delta + (c.g < c.b ? 6.0 : 0.0);
    } else if (c.g >= cMax) {
      h = (c.b - c.r) / delta + 2.0;
    } else {
      h = (c.r - c.g) / delta + 4.0;
    }
    h /= 6.0;
  }
  return vec3(h, s, l);
}

// Helper for HSL to RGB
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  vec3 rgb;
  if (hsl.y <= 0.0001) {
    rgb = vec3(hsl.z);
  } else {
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    rgb.r = hue2rgb(p, q, hsl.x + 1.0/3.0);
    rgb.g = hue2rgb(p, q, hsl.x);
    rgb.b = hue2rgb(p, q, hsl.x - 1.0/3.0);
  }
  return rgb;
}

void main() {
  vec4 baseColor = texture2D(u_image, v_texCoord);
  vec3 origColor = baseColor.rgb;
  vec3 color = origColor;

  // 1. Exposure (Photographic EV stops)
  color *= pow(2.0, u_exposure * 1.5);

  // 2. Brightness
  color += vec3(u_brightness * 0.35);

  // 3. Contrast (smooth S-curve around midpoint 0.5)
  color = clamp(color, 0.0, 1.0);
  color = (color - 0.5) * (1.0 + u_contrast * 0.75) + 0.5;

  // 4. White Balance (Temperature and Tint)
  // Temperature: Warm (Yellow/Orange) <-> Cool (Blue)
  color.r += u_temperature * 0.18;
  color.b -= u_temperature * 0.18;
  // Tint: Magenta <-> Green
  color.g -= u_tint * 0.15;
  color.r += u_tint * 0.06;
  color.b += u_tint * 0.06;

  // 5. Highlights and Shadows
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  // Shadows affect dark areas smoothly
  float shadowMask = 1.0 - smoothstep(0.0, 0.65, luma);
  color += vec3(u_shadows * 0.28 * shadowMask);
  // Highlights affect bright areas
  float highlightMask = smoothstep(0.35, 1.0, luma);
  color += vec3(u_highlights * 0.25 * highlightMask);

  // Whites & Blacks
  color += vec3(u_whites * 0.2 * smoothstep(0.7, 1.0, luma));
  color += vec3(u_blacks * 0.2 * (1.0 - smoothstep(0.0, 0.3, luma)));

  color = clamp(color, 0.0, 1.0);

  // 6. Tone Curves Lookup (Master, R, G, B)
  // u_curveTexture is 256x4: (y = 0.125: Master, 0.375: R, 0.625: G, 0.875: B)
  float rVal = texture2D(u_curveTexture, vec2(color.r, 0.375)).r;
  float gVal = texture2D(u_curveTexture, vec2(color.g, 0.625)).r;
  float bVal = texture2D(u_curveTexture, vec2(color.b, 0.875)).r;
  vec3 curvedRgb = vec3(rVal, gVal, bVal);
  curvedRgb.r = texture2D(u_curveTexture, vec2(curvedRgb.r, 0.125)).r;
  curvedRgb.g = texture2D(u_curveTexture, vec2(curvedRgb.g, 0.125)).r;
  curvedRgb.b = texture2D(u_curveTexture, vec2(curvedRgb.b, 0.125)).r;
  color = curvedRgb;

  // 7. Fade (Film matte black lift)
  if (u_fade > 0.0) {
    color = mix(color, max(color, vec3(u_fade * 0.25)), u_fade);
  }

  // 8. Grayscale
  if (u_grayscale == 1) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = vec3(gray);
  }

  // 9. Saturation & Vibrance (with skin tone protection)
  float curLuma = dot(color, vec3(0.299, 0.587, 0.114));
  float maxChannel = max(max(color.r, color.g), color.b);
  float minChannel = min(min(color.r, color.g), color.b);
  float currentSat = (maxChannel - minChannel) / max(maxChannel, 0.001);

  // Vibrance boosts less-saturated colors more, protecting skin tones
  float vibranceFactor = u_vibrance * (1.0 - currentSat);
  color = mix(vec3(curLuma), color, 1.0 + (u_saturation * 0.8) + (vibranceFactor * 0.6));

  // 10. Split Toning
  if (u_shadowSat > 0.0 || u_highlightSat > 0.0) {
    float splitLuma = dot(color, vec3(0.299, 0.587, 0.114));
    float balanceMid = 0.5 + (u_splitBalance * 0.25);
    
    // Shadow tint
    if (u_shadowSat > 0.0 && splitLuma < balanceMid) {
      float shadowWeight = (1.0 - (splitLuma / balanceMid)) * u_shadowSat;
      vec3 shadowColor = hsl2rgb(vec3(u_shadowHue, 0.85, 0.5));
      color = mix(color, color * (vec3(1.0) + shadowColor * 0.8), shadowWeight * 0.5);
    }
    // Highlight tint
    if (u_highlightSat > 0.0 && splitLuma >= balanceMid) {
      float hlWeight = ((splitLuma - balanceMid) / (1.0 - balanceMid)) * u_highlightSat;
      vec3 hlColor = hsl2rgb(vec3(u_highlightHue, 0.85, 0.5));
      color = mix(color, color + hlColor * 0.4, hlWeight * 0.45);
    }
  }

  // 11. Vignette (Smooth radial shading)
  if (u_vignetteAmount > 0.0) {
    vec2 coord = v_texCoord - vec2(0.5);
    // Aspect ratio correction for circular vignette
    coord.x *= u_resolution.x / u_resolution.y;
    float dist = length(coord);
    float start = max(0.1, 0.7 - (u_vignetteFeather * 0.5));
    float vig = smoothstep(0.85, start, dist);
    color *= mix(1.0 - (u_vignetteAmount * 0.95), 1.0, vig);
  }

  // 12. Procedural Film Grain
  if (u_grainAmount > 0.0) {
    vec2 grainCoord = floor(v_texCoord * u_resolution / max(1.0, u_grainSize));
    float noise = (rand(grainCoord + vec2(u_time * 0.01, u_time * 0.02)) - 0.5) * 2.0;
    // Grain is more noticeable in midtones, less in pure black/white
    float midtoneMask = 1.0 - 2.0 * abs(dot(color, vec3(0.299, 0.587, 0.114)) - 0.5);
    color += noise * (u_grainAmount * 0.16) * max(0.2, midtoneMask);
  }

  color = clamp(color, 0.0, 1.0);

  // 13. Blend with Original using Intensity
  vec3 finalColor = mix(origColor, color, u_intensity);

  gl_FragColor = vec4(finalColor, baseColor.a);
}
`;

export class WebGLFilterEngine {
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram | null = null;
  private imageTexture: WebGLTexture | null = null;
  private curveTexture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private isContextLost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  private initWebGL(): boolean {
    try {
      const gl = (this.canvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
      }) ||
        this.canvas.getContext('experimental-webgl', {
          preserveDrawingBuffer: true,
          premultipliedAlpha: false,
        })) as WebGLRenderingContext | null;

      if (!gl) {
        console.warn('WebGL not supported, falling back to 2D canvas');
        return false;
      }

      this.gl = gl;

      // Handle context lost & restored
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.isContextLost = true;
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.isContextLost = false;
        this.initWebGL();
      });

      // Compile shaders
      const vs = this.compileShader(gl.VERTEX_SHADER, VS_SOURCE);
      const fs = this.compileShader(gl.FRAGMENT_SHADER, FS_SOURCE);
      if (!vs || !fs) return false;

      const program = gl.createProgram();
      if (!program) return false;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return false;
      }
      this.program = program;

      // Fullscreen quad [-1, -1] to [1, 1]
      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
        ]),
        gl.STATIC_DRAW
      );

      // Texture coords: WebGL has flipped Y compared to Canvas
      this.texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          0, 1,
          1, 1,
          0, 0,
          0, 0,
          1, 1,
          1, 0,
        ]),
        gl.STATIC_DRAW
      );

      // Setup textures
      gl.activeTexture(gl.TEXTURE0);
      this.imageTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      gl.activeTexture(gl.TEXTURE1);
      this.curveTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Leave TEXTURE0 active by default
      gl.activeTexture(gl.TEXTURE0);

      return true;
    } catch (err) {
      console.warn('WebGL init failed:', err);
      return false;
    }
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Uploads tone curves as a 256x4 8-bit texture
   * Row 0: Master curve, Row 1: Red, Row 2: Green, Row 3: Blue
   */
  private updateCurveTexture(params: FilterParams) {
    if (!this.gl || !this.curveTexture) return;
    const gl = this.gl;

    const masterCurve = buildCurveLookupTable(params.toneCurve?.master || [[0, 0], [255, 255]]);
    const rCurve = buildCurveLookupTable(params.toneCurve?.r || [[0, 0], [255, 255]]);
    const gCurve = buildCurveLookupTable(params.toneCurve?.g || [[0, 0], [255, 255]]);
    const bCurve = buildCurveLookupTable(params.toneCurve?.b || [[0, 0], [255, 255]]);

    const textureData = new Uint8Array(256 * 4); // 256 pixels, 4 rows (luminance/LUM)
    textureData.set(masterCurve, 0);
    textureData.set(rCurve, 256);
    textureData.set(gCurve, 512);
    textureData.set(bCurve, 768);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      256,
      4,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      textureData
    );
  }

  /**
   * Renders image source with given filter parameters and intensity to the canvas
   */
  public render(
    imageSource: TexImageSource,
    params: FilterParams,
    intensity: number = 100,
    width?: number,
    height?: number
  ): boolean {
    if (!this.gl || !this.program || this.isContextLost) {
      return this.renderCanvas2DFallback(imageSource, params, intensity, width, height);
    }

    const gl = this.gl;
    let w = width || (imageSource as HTMLImageElement).naturalWidth || (imageSource as HTMLVideoElement).videoWidth || (imageSource as HTMLCanvasElement).width || 800;
    let h = height || (imageSource as HTMLImageElement).naturalHeight || (imageSource as HTMLVideoElement).videoHeight || (imageSource as HTMLCanvasElement).height || 600;

    // Guard against exceeding GPU MAX_TEXTURE_SIZE
    const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    let uploadSource: TexImageSource = imageSource;
    if (w > maxTexSize || h > maxTexSize) {
      const scale = Math.min(maxTexSize / w, maxTexSize / h);
      const scaledW = Math.floor(w * scale);
      const scaledH = Math.floor(h * scale);
      const tmp = document.createElement('canvas');
      tmp.width = scaledW;
      tmp.height = scaledH;
      const tctx = tmp.getContext('2d');
      if (tctx) {
        tctx.drawImage(imageSource as CanvasImageSource, 0, 0, scaledW, scaledH);
        uploadSource = tmp;
        w = scaledW;
        h = scaledH;
      }
    }

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    try {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

      // Bind Image Texture (Texture unit 0)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);

      // Bind Curves Texture (Texture unit 1)
      gl.activeTexture(gl.TEXTURE1);
      this.updateCurveTexture(params);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_curveTexture'), 1);

      // Set Uniforms
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_intensity'), Math.max(0, Math.min(1, intensity / 100)));
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_exposure'), params.exposure / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_brightness'), params.brightness / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_contrast'), params.contrast / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_saturation'), params.saturation / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_vibrance'), params.vibrance / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_temperature'), params.temperature / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_tint'), params.tint / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_highlights'), params.highlights / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_shadows'), params.shadows / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_whites'), params.whites / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_blacks'), params.blacks / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_fade'), params.fade / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_vignetteAmount'), (params.vignette?.amount || 0) / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_vignetteFeather'), (params.vignette?.feather || 50) / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_grainAmount'), (params.grain?.amount || 0) / 100);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_grainSize'), params.grain?.size || 2);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_grayscale'), params.grayscale ? 1 : 0);
      gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), w, h);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), performance.now() % 10000);

      // Split toning
      const split = params.splitToning;
      if (split) {
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_shadowHue'), split.shadowHue / 360);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_shadowSat'), split.shadowSat / 100);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_highlightHue'), split.highlightHue / 360);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_highlightSat'), split.highlightSat / 100);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_splitBalance'), split.balance / 100);
      } else {
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_shadowSat'), 0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_highlightSat'), 0);
      }

      // Bind Attributes
      const posAttr = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(posAttr);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      const texAttr = gl.getAttribLocation(this.program, 'a_texCoord');
      gl.enableVertexAttribArray(texAttr);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 0, 0);

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    } catch (err) {
      console.warn('WebGL render error, falling back:', err);
      return false;
    }
  }

  /**
   * High quality 2D canvas fallback in case WebGL is unavailable
   */
  private renderCanvas2DFallback(
    imageSource: TexImageSource,
    params: FilterParams,
    intensity: number,
    width?: number,
    height?: number
  ): boolean {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return false;

    const w = width || (imageSource as HTMLImageElement).naturalWidth || 800;
    const h = height || (imageSource as HTMLImageElement).naturalHeight || 600;
    this.canvas.width = w;
    this.canvas.height = h;

    const blend = intensity / 100;

    // CSS filter approximation for fast 2D draw
    const b = 100 + (params.brightness + params.exposure * 0.5) * blend;
    const c = 100 + params.contrast * blend;
    const s = params.grayscale ? (100 - 100 * blend) : 100 + params.saturation * blend;
    const sepia = params.temperature > 0 ? (params.temperature * 0.4 * blend) : 0;

    ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) sepia(${sepia}%)`;
    ctx.drawImage(imageSource as CanvasImageSource, 0, 0, w, h);
    ctx.filter = 'none';

    // Vignette overlay
    if (params.vignette?.amount && params.vignette.amount > 0) {
      const vigAmount = (params.vignette.amount / 100) * blend;
      const grad = ctx.createRadialGradient(w / 2, h / 2, (Math.min(w, h) / 3), w / 2, h / 2, Math.max(w, h) / 1.4);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${vigAmount * 0.85})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    return true;
  }

  public destroy() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.curveTexture) gl.deleteTexture(this.curveTexture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
  }
}

/**
 * Generates thumbnail data URLs for a given source image and list of filter presets.
 * Renders on a downscaled canvas (~140x140) for lightning-fast performance!
 */
export async function generateFilterThumbnails(
  sourceImage: HTMLImageElement,
  presets: { id: string; params: FilterParams; defaultIntensity: number }[],
  size: number = 140
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!sourceImage || !presets.length) return result;

  const natW = sourceImage.naturalWidth || sourceImage.width || 800;
  const natH = sourceImage.naturalHeight || sourceImage.height || 600;
  if (natW <= 0 || natH <= 0) return result;

  // Offscreen canvas for thumbnail rendering
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  // Create square crop source first
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = size;
  cropCanvas.height = size;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return result;

  const minDim = Math.min(natW, natH);
  const sx = (natW - minDim) / 2;
  const sy = (natH - minDim) / 2;
  try {
    cropCtx.drawImage(sourceImage, sx, sy, minDim, minDim, 0, 0, size, size);
  } catch (err) {
    console.warn('cropCtx drawImage failed:', err);
    return result;
  }

  let engine: WebGLFilterEngine | null = null;
  try {
    engine = new WebGLFilterEngine(canvas);
  } catch {
    engine = null;
  }

  for (const preset of presets) {
    let success = false;
    if (engine) {
      try {
        success = engine.render(cropCanvas, preset.params, preset.defaultIntensity, size, size);
        if (success) {
          result.set(preset.id, canvas.toDataURL('image/jpeg', 0.82));
        }
      } catch {
        success = false;
      }
    }
    if (!success) {
      result.set(preset.id, cropCanvas.toDataURL('image/jpeg', 0.8));
    }
  }

  if (engine) engine.destroy();
  return result;
}

/**
 * High-resolution export processor
 */
export interface ExportOptions {
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number; // 0.1 to 1.0
  maxDimension?: number; // e.g. 0 (original), 2048, 1080
  crop?: CropRegion;
  onProgress?: (progress: number) => void;
}

export async function exportGradedImage(
  sourceImage: HTMLImageElement,
  params: FilterParams,
  intensity: number,
  options: ExportOptions
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number; sizeBytes: number }> {
  const hasCrop = !isFullCrop(options.crop);
  const { sw, sh } = getCropPixelRect(
    sourceImage.naturalWidth,
    sourceImage.naturalHeight,
    options.crop
  );

  let w = sw;
  let h = sh;

  if (options.maxDimension && options.maxDimension > 0) {
    const max = options.maxDimension;
    if (w > max || h > max) {
      if (w > h) {
        h = Math.round((h * max) / w);
        w = max;
      } else {
        w = Math.round((w * max) / h);
        h = max;
      }
    }
  }

  options.onProgress?.(30);

  const renderInput: TexImageSource = hasCrop
    ? createCroppedCanvas(sourceImage, options.crop, w, h)
    : sourceImage;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const engine = new WebGLFilterEngine(canvas);
  engine.render(renderInput, params, intensity, w, h);

  options.onProgress?.(70);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        engine.destroy();
        if (!blob) {
          reject(new Error('Không thể tạo file ảnh từ canvas'));
          return;
        }
        const dataUrl = canvas.toDataURL(options.format, options.quality);
        options.onProgress?.(100);
        resolve({
          blob,
          dataUrl,
          width: w,
          height: h,
          sizeBytes: blob.size,
        });
      },
      options.format,
      options.quality
    );
  });
}
