// Pure logic helpers: Vietnamese price parsing, VND formatting, filename cleanup.

export const CONDITIONS = [
  { value: 'new', label: 'New (Mới)', short: 'New', mult: 1.12 },
  { value: 'like-new', label: 'Like new (Như mới)', short: 'Like new', mult: 1 },
  { value: 'used', label: 'Used (Đã dùng)', short: 'Used', mult: 0.8 },
  { value: 'for-parts', label: 'For parts (Xác)', short: 'For parts', mult: 0.3 },
];

export function conditionLabel(value, short = false) {
  const found = CONDITIONS.find((c) => c.value === value);
  if (!found) return short ? 'Used' : CONDITIONS[2].label;
  return short ? found.short : found.label;
}

export function conditionMultiplier(value) {
  return CONDITIONS.find((c) => c.value === value)?.mult ?? 1;
}

const BRAND_WORDS = new Map(
  Object.entries({
    iphone: 'iPhone',
    ipad: 'iPad',
    ipod: 'iPod',
    imac: 'iMac',
    macbook: 'MacBook',
    macbookair: 'MacBook Air',
    macbookpro: 'MacBook Pro',
    airpods: 'AirPods',
    airpod: 'AirPod',
    apple: 'Apple',
    cccd: 'CCCD',
    cmnd: 'CMND',
    vneid: 'VNeID',
    samsung: 'Samsung',
    galaxy: 'Galaxy',
    xiaomi: 'Xiaomi',
    redmi: 'Redmi',
    poco: 'POCO',
    oppo: 'OPPO',
    vivo: 'vivo',
    realme: 'realme',
    nokia: 'Nokia',
    huawei: 'Huawei',
    honor: 'Honor',
    oneplus: 'OnePlus',
    pixel: 'Pixel',
    google: 'Google',
    asus: 'ASUS',
    acer: 'Acer',
    dell: 'Dell',
    hp: 'HP',
    lenovo: 'Lenovo',
    thinkpad: 'ThinkPad',
    ideapad: 'IdeaPad',
    legion: 'Legion',
    thinkbook: 'ThinkBook',
    zenbook: 'Zenbook',
    vivobook: 'VivoBook',
    rog: 'ROG',
    msi: 'MSI',
    razer: 'Razer',
    microsoft: 'Microsoft',
    surface: 'Surface',
    sony: 'Sony',
    canon: 'Canon',
    nikon: 'Nikon',
    fujifilm: 'Fujifilm',
    panasonic: 'Panasonic',
    olympus: 'Olympus',
    gopro: 'GoPro',
    dji: 'DJI',
    jbl: 'JBL',
    marshall: 'Marshall',
    bose: 'Bose',
    sennheiser: 'Sennheiser',
    logitech: 'Logitech',
    razer: 'Razer',
    anker: 'Anker',
    baseus: 'Baseus',
    ugreen: 'UGREEN',
    nike: 'Nike',
    adidas: 'Adidas',
    puma: 'Puma',
    converse: 'Converse',
    vans: 'Vans',
    newbalance: 'New Balance',
    uniqlo: 'Uniqlo',
    zara: 'Zara',
    hnm: 'H&M',
    levis: 'Levi’s',
    ikea: 'IKEA',
    hermanmiller: 'Herman Miller',
    xiaomimijia: 'Xiaomi Mijia',
    lg: 'LG',
    bosch: 'Bosch',
    toshiba: 'Toshiba',
    sharp: 'Sharp',
    philips: 'Philips',
    electrolux: 'Electrolux',
    tefal: 'Tefal',
    locknlose: 'Lock&Lock',
    elmich: 'Elmich',
    bear: 'Bear',
    roborock: 'Roborock',
    ecovacs: 'Ecovacs',
    dyson: 'Dyson',
    garmin: 'Garmin',
    casio: 'Casio',
    seiko: 'Seiko',
    citizen: 'Citizen',
    swatch: 'Swatch',
    fossil: 'Fossil',
    playstation: 'PlayStation',
    nintendo: 'Nintendo',
    xbox: 'Xbox',
    steamdeck: 'Steam Deck',
    honda: 'Honda',
    yamaha: 'Yamaha',
    suzuki: 'Suzuki',
    vespa: 'Vespa',
    giant: 'Giant',
    trek: 'Trek',
    specialized: 'Specialized',
    martin: 'Martin',
    taylor: 'Taylor',
    roland: 'Roland',
    korg: 'KORG',
  })
);

const UPPER_TOKENS = new Set([
  'gb', 'tb', 'mb', 'kb', 'mm', 'cm', 'ml', 'kg', 'mah', 'kw', 'khz',
  'mhz', 'ghz', 'fps', 'mp', 'lte', 'wifi', 'gps', 'nfc', 'usb', 'hdmi', 'oled',
  'amoled', 'lcd', 'led', 'uhd', 'fhd', 'qhd', 'ips', 'ssd', 'hdd', 'ram', 'cpu',
  'gpu', 'vr', 'ar', 'se', 'x', 'xs', 'xr', 'ff', 'awd', 'mtb', 'ef', 'rf', 'usm',
  'stm', 'gm', 'oss', 'hsm', 'ii', 'iii', 'iv',
]);

const TITLE_WORDS = new Set([
  'pro', 'max', 'plus', 'ultra', 'mini', 'air', 'zoom', 'prime', 'gen', 'mk', 'lite', 'note',
]);

const GENERIC_PREFIX =
  /^(?:img|image|photo|picture|pic|dsc|dscn|dscf|pxl|vid|screenshot|screen shot|zalo|messenger|telegram|received|download|untitled)[\s._-]*\d*[\s._-]*/i;

export function stripDiacritics(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Normalize Vietnamese text for keyword matching. */
export function normalizeVi(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Personal papers are not sellable products. Detect them so the app never
// invents a price for an ID card, passport or similar document.
const DOCUMENT_RE =
  /\b(cccd|cmnd|vneid|id card|identity card|can cuoc(?: cong dan)?|chung minh(?: nhan dan| thu)?|giay to(?: tuy than)?|ho chieu|passport|visa|bang lai(?: xe)?|giay phep lai xe|driver(?: s)? licen[cs]e|driving licen[cs]e|khai sinh|birth certificate|so ho khau|ho khau|the cu tru|residence permit)\b/;
const DOCUMENT_ACCESSORY_RE = /\b(cover|case|holder|protector|op lung|bao da|tui dung)\b/;

function isDocumentText(normalizedText) {
  const padded = ` ${normalizedText} `;
  return DOCUMENT_RE.test(padded) && !DOCUMENT_ACCESSORY_RE.test(padded);
}

/** True when filenames/names/notes describe an ID or personal document. */
export function isPersonalDocument(...values) {
  return isDocumentText(normalizeVi(values.filter(Boolean).join(' ')));
}

/**
 * Parse a price typed the way Vietnamese sellers normally write it.
 * Supports: 4.500.000 / 4,5tr / 4tr5 / 450k / 1tr250 / 2 tỷ / 4.5
 */
export function parsePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;

  let s = String(raw).trim().toLowerCase();
  if (!s) return null;

  // Currency noise, but keep shorthand units tr / k / tỷ / triệu.
  s = s
    .replace(/₫|vnđ|vnd|đồng|dong|đ/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  // Plain grouped number: 1.200.000 or 1,200,000 or 1 200 000.
  if (/^\d{1,3}(?:[.,\s]\d{3})+$/.test(s)) {
    const n = Number(s.replace(/[.,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  const units = [
    { re: /(?:tỷ|ty|ti|tỉ|billion|bil)(?=\s|$|[\d.,])/, mult: 1e9 },
    { re: /(?:triệu|trieu|million|tr|củ|cu)(?=\s|$|[\d.,])/, mult: 1e6 },
    { re: /(?:nghìn|nghin|ngàn|ngan|thousand|k)(?=\s|$|[\d.,])/, mult: 1e3 },
  ];

  for (const unit of units) {
    const match = s.match(unit.re);
    if (!match) continue;
    const before = s.slice(0, match.index).trim();
    const after = s.slice(match.index + match[0].length).trim();
    if (!before && !after) continue;
    const beforeNum = before ? Number(before.replace(/\s/g, '').replace(',', '.')) : 0;
    if (!Number.isFinite(beforeNum)) return null;
    let value = beforeNum;
    if (after) {
      // 4tr5 => 4.5, 1tr250 => 1.25, 450k5 => 450.5k
      const frac = after.replace(/[.,\s]/g, '');
      if (!/^\d+$/.test(frac)) return null;
      value += Number(frac) / Math.pow(10, frac.length);
    }
    const total = value * unit.mult;
    if (!Number.isFinite(total) || total < 0 || total > 1e15) return null;
    return Math.round(total);
  }

  // A single plain number. Small integers are almost always shorthand for
  // thousands (450 -> 450k); decimals under 100 are shorthand for millions
  // (4.5 -> 4.5m). Anything else is taken literally.
  const plain = s.replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)?$/.test(plain)) return null;
  const decimal = plain.includes('.') || plain.includes(',');
  const n = Number(plain.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  let total = n;
  if (!decimal && n > 0 && n < 1000) total = n * 1000;
  else if (decimal && n > 0 && n < 100) total = n * 1e6;
  if (total < 0 || total > 1e15) return null;
  return Math.round(total);
}

export function formatVnd(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parsePrice(value);
  if (n === null || !Number.isFinite(n)) return '';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ₫`;
}

export function formatShortVnd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return `${trimNum(n / 1e9)} tỷ`;
  if (n >= 1e6) return `${trimNum(n / 1e6)} tr`;
  if (n >= 1e3) return `${trimNum(n / 1e3)}k`;
  return `${Math.round(n)} ₫`;
}

function trimNum(n) {
  const dp = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return String(Number(n.toFixed(dp))).replace('.', ',');
}

export function roundMoney(value, step) {
  if (!Number.isFinite(value)) return null;
  const s = step || 1000;
  return Math.max(0, Math.round(value / s) * s);
}

export function prettyStep(value) {
  if (value >= 10_000_000) return 250_000;
  if (value >= 3_000_000) return 100_000;
  if (value >= 1_000_000) return 50_000;
  if (value >= 300_000) return 10_000;
  if (value >= 50_000) return 5_000;
  return 1_000;
}

/**
 * Turn a filename into a clean product title, preserving common brands,
 * units and model numbers.
 */
export function filenameToName(filename, categoryHint = '') {
  let base = String(filename || '').replace(/\.[^.]+$/, '');
  try {
    base = decodeURIComponent(base);
  } catch {
    /* keep original */
  }
  base = base
    .replace(/[+_]+/g, ' ')
    .replace(/[-–—]+/g, ' ')
    .replace(/[{}[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  base = base.replace(GENERIC_PREFIX, '');
  base = base.replace(/^\d{1,3}[ .]+(?=[a-zA-ZÀ-ỹ])/, '');
  // Drop long numeric prefixes used as document/order IDs ("496457 Nguyễn …"),
  // but keep years such as "2023 MacBook Air".
  base = base.replace(/^(\d{4,})\s+(?=\D)/, (match, digits) => {
    const value = Number(digits);
    return value >= 1900 && value <= 2099 ? match : '';
  });
  base = base.replace(/\b\d{10,}\b/g, ' ');
  base = base.replace(/\s+/g, ' ').trim();

  if (!base || /^[\d\s.,]+$/.test(base)) {
    return categoryHint ? CATEGORY_LABELS[categoryHint] || 'Untitled item' : 'Untitled item';
  }

  const words = base.split(' ').filter(Boolean);
  const pretty = words.map((word) => prettyWord(word));
  let name = pretty.join(' ').replace(/\s+/g, ' ').trim();

  // "macbook air m2 8 256" reads much better as "MacBook Air M2 8GB/256GB".
  if (categoryHint === 'laptop') {
    name = name.replace(/\b(4|8|12|16|24|32|36|48|64)\s+(128|256|512)\b(?!\s*(?:gb|tb))/i, '$1GB/$2GB');
  }

  if (name.length > 90) {
    const cut = name.slice(0, 88);
    name = `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
  }
  return name;
}

const LOWER_TOKENS = new Set(['mm', 'cm', 'ml', 'kg', 'g', 'km', 'inch', 'in']);

function prettyWord(word) {
  const lower = word.toLowerCase();
  if (BRAND_WORDS.has(lower)) return BRAND_WORDS.get(lower);
  if (TITLE_WORDS.has(lower)) return capitalize(lower);
  if (LOWER_TOKENS.has(lower)) return lower;
  if (UPPER_TOKENS.has(lower)) return lower.toUpperCase();
  if (/^\d+(?:gb|tb)$/i.test(word)) return word.toUpperCase();
  if (/^\d+(?:g|mb|kb)$/i.test(word)) return word.toUpperCase();
  if (/^[45][gk]$/i.test(word)) return word.toUpperCase();
  if (/^[a-z]\d+[a-z]{2,}$/i.test(word)) {
    return `${word[0].toUpperCase()}${word.slice(1).replace(/[a-z]+$/i, (s) => s.toUpperCase())}`;
  }
  if (/^\d+[a-z]{1,2}$/i.test(word) && /^(?:d|s|x|se)$/i.test(word.slice(-1))) {
    return word.toUpperCase();
  }
  if (/^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word) && word.length <= 5) return word;
  return capitalize(lower);
}

function capitalize(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export const CATEGORY_LABELS = {
  phone: 'Smartphone',
  laptop: 'Laptop',
  tablet: 'Tablet',
  camera: 'Camera',
  audio: 'Audio gear',
  watch: 'Watch',
  console: 'Game console',
  tv: 'TV / monitor',
  appliance: 'Home appliance',
  furniture: 'Furniture',
  bike: 'Bicycle',
  motorbike: 'Motorbike',
  clothing: 'Clothing',
  shoes: 'Shoes',
  bag: 'Bag',
  book: 'Books',
  toy: 'Toy',
  cosmetics: 'Cosmetics',
  document: 'Document / giấy tờ',
  default: 'Product',
};

const CATEGORY_RULES = [
  ['phone', /\b(iphone|dien thoai|smartphone|samsung galaxy|galaxy s|galaxy note|galaxy z|xiaomi|redmi|poco|oppo|vivo|realme|oneplus|pixel|nokia|huawei|honor|sony xperia|blackberry)\b/],
  ['tablet', /\b(ipad|tablet|may tinh bang|galaxy tab|tab s|tab a)\b/],
  ['laptop', /\b(macbook|laptop|notebook|thinkpad|ideapad|legion|zenbook|vivobook|rog|surface|chromebook|may tinh xach tay|xps)\b/],
  ['camera', /\b(camera|may anh|canon|nikon|fujifilm|sony a[0-9]|a7|a6[0-9]{3}|gopro|dji|dslr|mirrorless|lens|ong kinh|osmo|insta360)\b/],
  ['audio', /\b(airpods|tai nghe|headphone|earbuds|loa|speaker|soundbar|marshall|jbl|bose|sennheiser|sony wh|sony wf|beats)\b/],
  ['watch', /\b(dong ho|watch|apple watch|garmin|casio|seiko|citizen|swatch|fossil|smartwatch)\b/],
  ['console', /\b(playstation|ps4|ps5|nintendo|switch|xbox|game console|may game|steam deck)\b/],
  ['tv', /\b(tivi|tv|smart tv|monitor|man hinh|projector|may chieu)\b/],
  ['appliance', /\b(tu lanh|may giat|dieu hoa|may lanh|noi com|noi chien|quat|vacuum|robot hut|hut bui|blender|may xay|microwave|lo vi song|bep|may rua bat|kettle|am sieu toc)\b/],
  ['furniture', /\b(ban |ban$|ghe|sofa|ghe sofa|tu |ke |giuong|chair|desk|table|shelf|ikea|mattress|nem)\b/],
  ['bike', /\b(xe dap|bicycle|road bike|mountain bike|mtb|giant|trek|specialized|fixed gear)\b/],
  ['motorbike', /\b(xe may|xe ga|motorbike|scooter|honda|yamaha|suzuki|vespa|exciter|wave|vision|air blade|lead|sh mode)\b/],
  ['shoes', /\b(giay|sneaker|nike|adidas|puma|converse|vans|new balance|boots|sandal|dep)\b/],
  ['bag', /\b(tui|balo|backpack|handbag|wallet|vi |clutch|tote|luggage|vali)\b/],
  ['clothing', /\b(ao|quan|jacket|hoodie|t shirt|tee|dress|vay|dam|uniqlo|zara|levi|jeans|cardigan|sweater|blazer)\b/],
  ['book', /\b(sach|book|truyen|manga|textbook|novel|comic)\b/],
  ['toy', /\b(do choi|lego|toy|figure|gundam|plush|board game|puzzle)\b/],
  ['cosmetics', /\b(my pham|skincare|son |kem |perfume|nuoc hoa|serum|foundation|lipstick)\b/],
];

export function detectCategory(...values) {
  const text = normalizeVi(values.filter(Boolean).join(' '));
  if (isDocumentText(text)) return 'document';
  const padded = ` ${text} `;
  for (const [category, re] of CATEGORY_RULES) {
    if (re.test(padded)) return category;
  }
  return 'default';
}

export function detectCondition(filename = '') {
  const t = normalizeVi(filename);
  if (/\b(for parts|parts only|broken|loi|xac|khong len nguon|no power)\b/.test(t)) return 'for-parts';
  if (/\b(brand new|new seal|fullbox|full box|nguyen seal|chua dung|moi 100)\b/.test(t)) return 'new';
  if (/\b(new|moi|like new|nhu moi)\b/.test(t)) return 'like-new';
  if (/\b(used|da dung|cu|second hand|secondhand)\b/.test(t)) return 'used';
  return 'used';
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
