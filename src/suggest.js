// Local (offline) product-name and market-price suggestions for the Vietnamese
// second-hand market. Deterministic: the same filename always gets the same
// estimate, which makes review less surprising.

import {
  CATEGORY_LABELS,
  clamp,
  detectCategory,
  filenameToName,
  normalizeVi,
  prettyStep,
  roundMoney,
} from './parse.js';

const PROFILES = {
  phone: { typical: 6_500_000, spread: 0.42, min: 1_200_000, max: 25_000_000 },
  laptop: { typical: 13_000_000, spread: 0.48, min: 3_000_000, max: 40_000_000 },
  tablet: { typical: 6_000_000, spread: 0.45, min: 1_500_000, max: 20_000_000 },
  camera: { typical: 11_000_000, spread: 0.5, min: 2_000_000, max: 45_000_000 },
  audio: { typical: 1_400_000, spread: 0.58, min: 120_000, max: 9_000_000 },
  watch: { typical: 2_200_000, spread: 0.55, min: 250_000, max: 15_000_000 },
  console: { typical: 6_500_000, spread: 0.4, min: 1_200_000, max: 18_000_000 },
  tv: { typical: 4_500_000, spread: 0.5, min: 700_000, max: 20_000_000 },
  appliance: { typical: 2_500_000, spread: 0.55, min: 200_000, max: 15_000_000 },
  furniture: { typical: 1_200_000, spread: 0.55, min: 100_000, max: 10_000_000 },
  bike: { typical: 2_200_000, spread: 0.5, min: 350_000, max: 12_000_000 },
  motorbike: { typical: 20_000_000, spread: 0.45, min: 4_000_000, max: 70_000_000 },
  clothing: { typical: 280_000, spread: 0.6, min: 40_000, max: 1_800_000 },
  shoes: { typical: 650_000, spread: 0.55, min: 80_000, max: 3_500_000 },
  bag: { typical: 700_000, spread: 0.6, min: 60_000, max: 5_000_000 },
  book: { typical: 90_000, spread: 0.5, min: 15_000, max: 500_000 },
  toy: { typical: 350_000, spread: 0.6, min: 35_000, max: 3_000_000 },
  cosmetics: { typical: 250_000, spread: 0.65, min: 25_000, max: 2_000_000 },
  default: { typical: 800_000, spread: 0.6, min: 50_000, max: 6_000_000 },
};

const IPHONE_BASE = {
  '4': 1_200_000,
  '5': 1_500_000,
  '6': 1_900_000,
  '7': 2_400_000,
  '8': 2_900_000,
  x: 4_000_000,
  xr: 4_400_000,
  xs: 4_600_000,
  '11': 5_600_000,
  '12': 7_200_000,
  '13': 9_200_000,
  '14': 11_500_000,
  '15': 14_000_000,
  '16': 17_000_000,
  '17': 20_000_000,
};

function hash01(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function softGoods(category) {
  return ['clothing', 'shoes', 'bag', 'book', 'toy', 'cosmetics'].includes(category);
}

export function conditionFactor(category, condition) {
  if (condition === 'new') return 1.15;
  if (condition === 'like-new') return 1;
  if (condition === 'for-parts') return softGoods(category) ? 0.25 : 0.28;
  return softGoods(category) ? 0.62 : 0.8;
}

function storageMultiplier(text) {
  if (/\b(1 ?tb|1024 ?gb)\b/.test(text)) return 1.18;
  if (/\b512 ?gb\b/.test(text)) return 1.12;
  if (/\b256 ?gb\b/.test(text)) return 1.05;
  if (/\b128 ?gb\b/.test(text)) return 1;
  if (/\b64 ?gb\b/.test(text)) return 0.92;
  return 1;
}

function iphoneMatch(text) {
  const m = text.match(/\biphone\s*(xr|xs(?:\s*max)?|x|\d{1,2})(?:\s*(pro\s*max|pro|plus|mini))?/);
  if (!m) return null;
  const modelKey = m[1].replace(/\s+/g, ' ');
  const variant = m[2] || '';
  let base = IPHONE_BASE[modelKey];
  if (!base) return null;
  if (variant === 'pro max') base *= 1.28;
  else if (variant === 'pro') base *= 1.13;
  else if (variant === 'plus') base *= 1.08;
  else if (variant === 'mini') base *= 0.9;
  base *= storageMultiplier(text);
  const label = `iPhone ${modelKey.toUpperCase() === 'X' ? 'X' : modelKey}${variant ? ` ${variant.replace(/\b\w/g, (c) => c.toUpperCase())}` : ''}`;
  return { base, label, spread: 0.12, confidence: 'medium' };
}

function macbookMatch(text) {
  if (!/\bmacbook\b/.test(text)) return null;
  let base = 12_500_000;
  let label = 'MacBook Air';
  if (/\bmacbook\s*pro\b/.test(text) || /\bpro\b/.test(text)) {
    base = 19_000_000;
    label = 'MacBook Pro';
  }
  if (/\bm1\b/.test(text)) base *= 0.85;
  else if (/\bm2\b/.test(text)) base *= 1;
  else if (/\bm3\b/.test(text)) base *= 1.14;
  else if (/\bm4\b/.test(text)) base *= 1.28;
  else if (/\bm5\b/.test(text)) base *= 1.4;
  if (/\b16\s*(inch|in)?\b/.test(text)) base *= 1.2;
  else if (/\b14\s*(inch|in)?\b/.test(text)) base *= 1.1;
  base *= storageMultiplier(text);
  return { base, label, spread: 0.15, confidence: 'medium' };
}

function ipadMatch(text) {
  if (!/\bipad\b/.test(text)) return null;
  let base = 6_000_000;
  let label = 'iPad';
  if (/\bipad\s*pro\b/.test(text)) {
    base = 12_000_000;
    label = 'iPad Pro';
  } else if (/\bipad\s*air\b/.test(text)) {
    base = 8_500_000;
    label = 'iPad Air';
  } else if (/\bipad\s*mini\b/.test(text)) {
    base = 5_500_000;
    label = 'iPad mini';
  }
  base *= storageMultiplier(text);
  return { base, label, spread: 0.15, confidence: 'medium' };
}

function samsungMatch(text) {
  if (!/\b(samsung|galaxy)\b/.test(text)) return null;
  let base = 6_000_000;
  let label = 'Samsung Galaxy';
  if (/\bgalaxy\s*z\s*fold\b/.test(text) || /\bfold\b/.test(text)) {
    base = 16_000_000;
    label = 'Samsung Galaxy Z Fold';
  } else if (/\bgalaxy\s*z\s*flip\b/.test(text) || /\bflip\b/.test(text)) {
    base = 9_000_000;
    label = 'Samsung Galaxy Z Flip';
  } else if (/\bgalaxy\s*(s2[0-9]|s1[0-9]|note)\b/.test(text)) {
    base = 9_000_000;
    label = 'Samsung Galaxy S';
  } else if (/\bgalaxy\s*a[0-9]/.test(text)) {
    base = 4_000_000;
    label = 'Samsung Galaxy A';
  }
  base *= storageMultiplier(text);
  return { base, label, spread: 0.18, confidence: 'medium' };
}

function xiaomiMatch(text) {
  if (!/\b(xiaomi|redmi|poco)\b/.test(text)) return null;
  let base = 4_500_000;
  let label = 'Xiaomi';
  if (/\bredmi\s*note\b/.test(text)) {
    base = 3_200_000;
    label = 'Xiaomi Redmi Note';
  } else if (/\bpoco\b/.test(text)) {
    base = 4_000_000;
    label = 'POCO';
  } else if (/\bredmi\b/.test(text)) {
    base = 3_000_000;
    label = 'Redmi';
  } else if (/\bxiaomi\s*(1[2-9]|[2-9]\d)\b/.test(text)) {
    base = 7_000_000;
    label = 'Xiaomi';
  }
  base *= storageMultiplier(text);
  return { base, label, spread: 0.2, confidence: 'medium' };
}

function airpodsMatch(text) {
  if (!/\bairpods\b/.test(text)) return null;
  let base = 1_600_000;
  let label = 'AirPods';
  if (/\bairpods\s*max\b/.test(text)) {
    base = 4_800_000;
    label = 'AirPods Max';
  } else if (/\bairpods\s*pro\b/.test(text)) {
    base = 3_400_000;
    label = 'AirPods Pro';
  } else if (/\b(gen\s*3|3rd)\b/.test(text)) {
    base = 2_500_000;
    label = 'AirPods Gen 3';
  }
  return { base, label, spread: 0.2, confidence: 'medium' };
}

function consoleMatch(text) {
  if (/\b(ps5|playstation\s*5)\b/.test(text)) {
    return { base: 8_000_000, label: 'PlayStation 5', spread: 0.15, confidence: 'medium' };
  }
  if (/\b(ps4|playstation\s*4)\b/.test(text)) {
    return { base: 4_000_000, label: 'PlayStation 4', spread: 0.2, confidence: 'medium' };
  }
  if (/\b(nintendo\s*switch|switch\s*oled)\b/.test(text)) {
    return { base: 4_800_000, label: 'Nintendo Switch', spread: 0.2, confidence: 'medium' };
  }
  if (/\bxbox\b/.test(text)) {
    return { base: 6_000_000, label: 'Xbox', spread: 0.2, confidence: 'medium' };
  }
  return null;
}

function cameraMatch(text) {
  if (/\bsony\s*a7\s*(iii|3)\b/.test(text) || /\ba7iii\b/.test(text)) {
    return { base: 24_000_000, label: 'Sony A7 III', spread: 0.15, confidence: 'medium' };
  }
  if (/\bcanon\s*(5d|6d|r6|r5)\b/.test(text)) {
    return { base: 18_000_000, label: 'Canon EOS', spread: 0.3, confidence: 'medium' };
  }
  if (/\bnikon\s*(z6|z7|d750|d850)\b/.test(text)) {
    return { base: 18_000_000, label: 'Nikon', spread: 0.3, confidence: 'medium' };
  }
  return null;
}

function lensMatch(text) {
  if (!/\b(lens|ong kinh)\b/.test(text)) return null;
  if (/\b(70\s*200|70-200)\b/.test(text)) {
    return { base: 18_000_000, label: '70–200mm lens', spread: 0.25, confidence: 'medium' };
  }
  if (/\b(24\s*70|24-70)\b/.test(text)) {
    return { base: 15_000_000, label: '24–70mm lens', spread: 0.25, confidence: 'medium' };
  }
  if (/\b50\s*mm\b/.test(text)) {
    return { base: 2_800_000, label: '50mm lens', spread: 0.22, confidence: 'medium' };
  }
  return { base: 5_000_000, label: 'Camera lens', spread: 0.35, confidence: 'low' };
}

function modelOverride(text, category) {
  if (category === 'phone' || /\biphone\b/.test(text)) {
    const match = iphoneMatch(text) || samsungMatch(text) || xiaomiMatch(text);
    if (match) return match;
  }
  if (category === 'laptop') {
    const match = macbookMatch(text);
    if (match) return match;
  }
  if (category === 'tablet') {
    const match = ipadMatch(text);
    if (match) return match;
  }
  if (category === 'audio') {
    const match = airpodsMatch(text);
    if (match) return match;
  }
  if (category === 'console') {
    const match = consoleMatch(text);
    if (match) return match;
  }
  if (category === 'camera') {
    const match = cameraMatch(text) || lensMatch(text);
    if (match) return match;
  }
  return null;
}

/**
 * Build a local suggestion. No network required.
 * @param {{filename?: string, name?: string, condition?: string}} input
 */
export function suggestLocal({ filename = '', name = '', condition = 'used' } = {}) {
  const haystack = `${filename} ${name}`;
  const category = detectCategory(haystack);
  const text = normalizeVi(haystack);

  if (category === 'document') {
    let suggestedName = filenameToName(filename, category);
    if (!suggestedName || /^untitled/i.test(suggestedName)) {
      suggestedName = name.trim() || 'Personal document';
    }
    return {
      name: suggestedName,
      price: null,
      range: null,
      category,
      confidence: 'high',
      source: 'local',
      note: 'Personal document — no price suggested. Avoid sharing or uploading.',
    };
  }

  const profile = PROFILES[category] || PROFILES.default;
  const factor = conditionFactor(category, condition);
  const override = modelOverride(text, category);

  const spread = override?.spread ?? profile.spread;
  let typical = (override?.base ?? profile.typical) * factor;

  // Deterministic variation so 10 similar photos don't all show one price.
  const jitterRange = override ? 0.06 : 0.14;
  const jitter = 1 - jitterRange + hash01(text || 'photo') * jitterRange * 2;
  typical *= jitter;

  const rawMin = Math.max(profile.min * factor * 0.75, (override?.base ?? profile.typical) * (1 - spread) * factor);
  const rawMax = Math.min(profile.max * factor * 1.25, (override?.base ?? profile.typical) * (1 + spread) * factor);
  typical = clamp(typical, rawMin, rawMax);

  const step = prettyStep(typical);
  const price = roundMoney(typical, step);
  let min = roundMoney(Math.max(10_000, rawMin), step);
  let max = roundMoney(Math.max(rawMax, price * 1.05), step);
  if (min > price) min = roundMoney(price * 0.9, step);
  if (max < price) max = roundMoney(price * 1.1, step);

  let suggestedName = filenameToName(filename, category);
  if (!suggestedName || /^untitled/i.test(suggestedName)) {
    suggestedName = name.trim() || CATEGORY_LABELS[category] || 'Product';
  }

  const confidence = override?.confidence ?? (category === 'default' ? 'low' : 'low');
  const modelNote = override?.label ? `${override.label} detected` : `${CATEGORY_LABELS[category]} · category estimate`;

  return {
    name: suggestedName,
    price,
    range: { min, max },
    category,
    confidence,
    source: 'local',
    note: modelNote,
  };
}

export { hash01 };
