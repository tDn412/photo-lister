// Canvas-based image processing: auto-enhance, border/frame and text overlay.

import { clamp, formatVnd } from './parse.js';

export async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> */
    }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name || 'image'}`));
    };
    img.src = url;
  });
}

export function closeBitmap(bitmap) {
  if (bitmap && typeof bitmap.close === 'function') {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
  }
}

function sourceSize(source) {
  return {
    width: source.width || source.naturalWidth || 0,
    height: source.height || source.naturalHeight || 0,
  };
}

function scaledCanvas(source, maxSize) {
  const { width: sw, height: sh } = sourceSize(source);
  if (!sw || !sh) throw new Error('Image has no dimensions');
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx, width, height };
}

function sharpen(ctx, width, height, strength) {
  if (strength <= 0 || width * height > 6_000_000) return;
  const amount = 0.32 * strength;
  let frame;
  try {
    frame = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const src = frame.data;
  const out = ctx.createImageData(width, height);
  const dst = out.data;
  const center = 1 + amount * 4;

  for (let y = 0; y < height; y++) {
    const up = y > 0 ? y - 1 : y;
    const down = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? x - 1 : x;
      const right = x < width - 1 ? x + 1 : x;
      const i = (y * width + x) * 4;
      const iu = (up * width + x) * 4;
      const id = (down * width + x) * 4;
      const il = (y * width + left) * 4;
      const ir = (y * width + right) * 4;
      for (let c = 0; c < 3; c++) {
        dst[i + c] = src[i + c] * center - amount * (src[iu + c] + src[id + c] + src[il + c] + src[ir + c]);
      }
      dst[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function drawScene(source, settings = {}, options = {}) {
  const maxSize = options.maxSize || 1600;
  const { canvas, ctx, width, height } = scaledCanvas(source, maxSize);
  const enhance = Boolean(settings.enhance);
  const strength = clamp((settings.enhanceStrength ?? 55) / 100, 0, 1);

  if (enhance) {
    const brightness = 1 + 0.075 * strength;
    const contrast = 1 + 0.14 * strength;
    const saturation = 1 + 0.18 * strength;
    ctx.filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)})`;
  }
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = 'none';

  if (enhance) sharpen(ctx, width, height, strength);

  if (settings.border && Number(settings.borderWidth) > 0) {
    const bw = clamp(Math.round(Math.min(width, height) * (Number(settings.borderWidth) / 100)), 3, 56);
    ctx.strokeStyle = settings.borderColor || '#ffffff';
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, width - bw, height - bw);
  }

  if (settings.overlay) {
    drawOverlay(ctx, width, height, settings, options);
  }

  return { canvas, width, height };
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid).trimEnd() + ell).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, Math.max(0, lo)).trimEnd()}${ell}`;
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
      continue;
    }
    if (lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${words.slice(i).join(' ')}`;
      break;
    }
  }
  if (current) lines.push(current);

  const limited = lines.slice(0, maxLines);
  return limited.map((line) => ellipsize(ctx, line, maxWidth));
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

function drawOverlay(ctx, width, height, settings, options) {
  const name = String(options.name ?? '').replace(/\s+/g, ' ').trim();
  const price = Number(options.price) > 0 ? formatVnd(Number(options.price)) : '';
  const showName = settings.overlayName !== false && name;
  const showPrice = settings.overlayPrice !== false && price;
  if (!showName && !showPrice) return;

  const scale = clamp((settings.overlayScale ?? 100) / 100, 0.7, 1.5);
  const nameSize = Math.max(12, Math.min(width * 0.042, 62)) * scale;
  const priceSize = nameSize * 1.04;
  const lineHeight = nameSize * 1.16;
  const pad = Math.max(10, Math.round(width * 0.034));
  const maxTextWidth = width - pad * 2;
  const gap = showName && showPrice ? nameSize * 0.32 : 0;

  ctx.save();
  ctx.textBaseline = 'top';

  let nameLines = [];
  if (showName) {
    ctx.font = `600 ${nameSize}px ${FONT_STACK}`;
    nameLines = wrapLines(ctx, name, maxTextWidth, 2);
  }
  const nameHeight = nameLines.length * lineHeight;
  const priceHeight = showPrice ? priceSize * 1.25 : 0;
  const contentHeight = nameHeight + gap + priceHeight;

  const bottom = settings.overlayPosition !== 'top';
  const padding = Math.max(8, Math.round(pad * 0.75));
  const blockTop = bottom ? height - padding - contentHeight : padding;
  const scrimTop = bottom ? Math.max(0, blockTop - pad * 0.9) : 0;
  const scrimBottom = bottom ? height : Math.min(height, blockTop + contentHeight + pad * 1.2);

  const gradient = ctx.createLinearGradient(0, scrimTop, 0, scrimBottom);
  if (bottom) {
    gradient.addColorStop(0, 'rgba(8, 10, 12, 0)');
    gradient.addColorStop(0.55, 'rgba(8, 10, 12, 0.55)');
    gradient.addColorStop(1, 'rgba(8, 10, 12, 0.82)');
  } else {
    gradient.addColorStop(0, 'rgba(8, 10, 12, 0.82)');
    gradient.addColorStop(0.45, 'rgba(8, 10, 12, 0.55)');
    gradient.addColorStop(1, 'rgba(8, 10, 12, 0)');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, scrimTop, width, Math.max(0, scrimBottom - scrimTop));

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.max(2, nameSize * 0.18);
  ctx.shadowOffsetY = Math.max(1, nameSize * 0.04);

  let y = blockTop;
  if (showName) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${nameSize}px ${FONT_STACK}`;
    for (const line of nameLines) {
      ctx.fillText(line, pad, y, maxTextWidth);
      y += lineHeight;
    }
    y += gap;
  }
  if (showPrice) {
    ctx.fillStyle = '#ffd166';
    ctx.font = `800 ${priceSize}px ${FONT_STACK}`;
    ctx.fillText(price, pad, y, maxTextWidth);
  }
  ctx.restore();
}

export function renderProcessed(source, settings = {}, options = {}) {
  const applyProcessing = options.applyProcessing !== false;
  const active = applyProcessing
    ? settings
    : { ...settings, enhance: false, border: false, overlay: false };
  const { canvas, width, height } = drawScene(source, active, options);
  const dataUrl = canvas.toDataURL('image/jpeg', options.quality ?? 0.88);
  return { dataUrl, width, height };
}

/**
 * Render a photo for the post list / clipboard: same enhance + overlay as the
 * preview, but no frame. Frames belong to the Excel sheet, not to marketplace
 * posts. Returns the live canvas so callers can encode PNG or JPEG.
 */
export function renderPostPhoto(source, settings = {}, options = {}) {
  const applyProcessing = options.applyProcessing !== false;
  const active = applyProcessing
    ? { ...settings, border: false }
    : { ...settings, enhance: false, border: false, overlay: false };
  return drawScene(source, active, options);
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      type,
      quality
    );
  });
}

/** A plain, unprocessed JPEG (used to keep file size small for thumbnails/AI). */
export function renderPlain(source, maxSize = 420, quality = 0.85) {
  const { canvas, width, height } = drawScene(
    source,
    { enhance: false, border: false, overlay: false },
    { maxSize }
  );
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height };
}

export function stripDataUrl(dataUrl) {
  const index = String(dataUrl).indexOf(',');
  return index >= 0 ? String(dataUrl).slice(index + 1) : String(dataUrl);
}
