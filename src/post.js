// Post-list helpers: marketplace captions and friendly download names.

import { conditionLabel, formatVnd } from './parse.js';

/**
 * Build the text that gets pasted into a Facebook / Chợ Tốt listing.
 * Kept deliberately plain: title, price + condition, then optional notes.
 */
export function buildCaption({ name, price, condition, notes, isDocument = false } = {}) {
  const title = String(name || '').replace(/\s+/g, ' ').trim() || 'Product';
  const lines = [title];

  if (!isDocument) {
    const meta = [];
    const amount = Number(price);
    if (Number.isFinite(amount) && amount > 0) meta.push(formatVnd(amount));
    const conditionText = conditionLabel(condition, false);
    if (conditionText) meta.push(conditionText);
    if (meta.length) lines.push(meta.join(' · '));
  }

  const note = String(notes || '').trim();
  if (note) lines.push('', note);

  return lines.join('\n');
}

/** Turn a product name into a safe, readable filename (keeps Vietnamese readable). */
export function photoFileName(name, extension = 'jpg') {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');

  return `${base || 'photo'}.${extension}`;
}
