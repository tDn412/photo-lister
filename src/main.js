import {
  CONDITIONS,
  conditionLabel,
  detectCategory,
  detectCondition,
  filenameToName,
  formatShortVnd,
  formatVnd,
  isPersonalDocument,
  parsePrice,
} from './parse.js';
import { suggestLocal } from './suggest.js';
import { requestAiSuggestion, testAiConnection } from './ai.js';
import { canvasToBlob, closeBitmap, loadBitmap, renderPlain, renderPostPhoto, renderProcessed } from './imaging.js';
import { buildWorkbookBuffer } from './export-xlsx.js';
import { buildCaption, photoFileName } from './post.js';

const SETTINGS_KEY = 'photoLister.settings.v1';
const DRAFTS_KEY = 'photoLister.drafts.v1';

const DEFAULT_SETTINGS = {
  aiEnabled: true,
  aiMode: 'local',
  aiAuto: true,
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o-mini',
  processEnabled: true,
  enhance: true,
  enhanceStrength: 55,
  border: false,
  borderColor: '#ffffff',
  borderWidth: 2,
  overlay: false,
  overlayName: true,
  overlayPrice: true,
  overlayPosition: 'bottom',
  overlayScale: 100,
};

const PRESETS = {
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  openrouter: { base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  ollama: { base: 'http://localhost:11434/v1', model: 'qwen2.5vl:7b' },
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

const $ = (id) => document.getElementById(id);
const el = {
  workspace: $('workspace'),
  listing: $('listing'),
  navReview: $('nav-review'),
  navList: $('nav-list'),
  navListCount: $('nav-list-count'),
  postList: $('post-list'),
  listingEmpty: $('listing-empty'),
  listingStats: $('listing-stats'),
  btnBackReview: $('btn-back-review'),
  progressPill: $('progress-pill'),
  progressFill: $('progress-fill'),
  progressText: $('progress-text'),
  btnAi: $('btn-ai'),
  aiState: $('ai-state'),
  btnSettings: $('btn-settings'),
  btnExport: $('btn-export'),
  exportLabel: $('export-label'),
  btnAdd: $('btn-add'),
  btnFolder: $('btn-folder'),
  fileInput: $('file-input'),
  folderInput: $('folder-input'),
  deckCount: $('deck-count'),
  filmstrip: $('filmstrip'),
  sidebarEmpty: $('sidebar-empty'),
  btnDemo: $('btn-demo'),
  btnClear: $('btn-clear'),
  emptyState: $('empty-state'),
  dropCard: $('drop-card'),
  btnEmptyAdd: $('btn-empty-add'),
  btnEmptyFolder: $('btn-empty-folder'),
  btnDemoEmpty: $('btn-demo-empty'),
  review: $('review'),
  fileIndex: $('file-index'),
  fileName: $('file-name'),
  fileSize: $('file-size'),
  viewToggle: $('view-toggle'),
  btnRemove: $('btn-remove'),
  previewImg: $('preview-img'),
  previewLoading: $('preview-loading'),
  statusChip: $('status-chip'),
  deckPosition: $('deck-position'),
  editorEmpty: $('editor-empty'),
  editorBody: $('editor-body'),
  editorFoot: $('editor-foot'),
  tabs: document.querySelector('.tabs'),
  tabItem: $('tab-item'),
  tabImage: $('tab-image'),
  fName: $('f-name'),
  fPrice: $('f-price'),
  priceHint: $('price-hint'),
  fCondition: $('f-condition'),
  fNotes: $('f-notes'),
  suggestCard: $('suggest-card'),
  suggestSource: $('suggest-source'),
  suggestLoading: $('suggest-loading'),
  suggestDismiss: $('suggest-dismiss'),
  suggestName: $('suggest-name'),
  suggestMeta: $('suggest-meta'),
  suggestApply: $('suggest-apply'),
  suggestUndo: $('suggest-undo'),
  suggestApplied: $('suggest-applied'),
  btnSuggest: $('btn-suggest'),
  aiCaption: $('ai-caption'),
  sProcess: $('s-process'),
  processingControls: $('processing-controls'),
  sEnhance: $('s-enhance'),
  enhanceRow: $('enhance-row'),
  sEnhanceStrength: $('s-enhance-strength'),
  enhanceStrengthOut: $('enhance-strength-out'),
  sBorder: $('s-border'),
  borderControls: $('border-controls'),
  borderSwatches: $('border-swatches'),
  sBorderWidth: $('s-border-width'),
  borderWidthOut: $('border-width-out'),
  sOverlay: $('s-overlay'),
  overlayControls: $('overlay-controls'),
  sOverlayName: $('s-overlay-name'),
  sOverlayPrice: $('s-overlay-price'),
  sOverlayPosition: $('s-overlay-position'),
  sOverlayScale: $('s-overlay-scale'),
  overlayScaleOut: $('overlay-scale-out'),
  sSkipItem: $('s-skip-item'),
  btnPrev: $('btn-prev'),
  btnSkip: $('btn-skip'),
  btnNext: $('btn-next'),
  footStatus: $('foot-status'),
  settingsDialog: $('settings-dialog'),
  settingsForm: $('settings-form'),
  cloudSettings: $('cloud-settings'),
  sApiBase: $('s-api-base'),
  sApiModel: $('s-api-model'),
  sApiKey: $('s-api-key'),
  btnTestAi: $('btn-test-ai'),
  aiTestStatus: $('ai-test-status'),
  sAiAuto: $('s-ai-auto'),
  btnClearDrafts: $('btn-clear-drafts'),
  btnSaveSettings: $('btn-save-settings'),
  settingsStatus: $('settings-status'),
  busyOverlay: $('busy-overlay'),
  busyTitle: $('busy-title'),
  busyDetail: $('busy-detail'),
  busyFill: $('busy-fill'),
  dropOverlay: $('drop-overlay'),
  toasts: $('toasts'),
};

const state = {
  items: [],
  activeId: null,
  mode: 'review',
  settings: loadSettings(),
  drafts: loadDrafts(),
  view: 'processed',
  tab: 'item',
  exporting: false,
  dragDepth: 0,
  cloudFailToasted: false,
  documentWarned: false,
  previewErrorToasted: new Set(),
};

let idSeq = 0;
let previewSeq = 0;
let previewTimer = null;
let saveTimer = null;
let toastSeq = 0;
let postPreviewSeq = 0;

init();

function init() {
  bindImport();
  bindGlobalActions();
  bindEditor();
  bindImageTab();
  bindSettings();
  bindViews();
  bindKeyboard();
  bindDragAndDrop();
  syncSettingsUI();
  syncAiUI();
  syncUI();
  updateProgress();
  registerServiceWorkerHint();
}

/* ───────────────────────── Storage ───────────────────────── */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* localStorage unavailable: the app still works for this session */
  }
}

function loadDrafts() {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function persistItem(item) {
  if (!item) return;
  state.drafts[item.key] = {
    name: item.name,
    nameAuto: item.nameAuto,
    priceRaw: item.priceRaw,
    priceAuto: item.priceAuto,
    condition: item.condition,
    notes: item.notes,
    status: item.status,
    skipProcessing: item.skipProcessing,
  };
}

function storeDrafts() {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(state.drafts));
    return true;
  } catch {
    el.footStatus.textContent = 'Draft not saved (storage full)';
    return false;
  }
}

function scheduleDraftSave() {
  const item = activeItem();
  if (item) persistItem(item);
  el.footStatus.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (storeDrafts()) {
      el.footStatus.textContent = 'Draft saved locally';
    }
  }, 300);
}

function flushDrafts() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const item = activeItem();
  if (item) persistItem(item);
  if (storeDrafts()) el.footStatus.textContent = 'Draft saved locally';
}

/* ───────────────────────── Import / batch ───────────────────────── */

function bindImport() {
  el.btnAdd.addEventListener('click', () => el.fileInput.click());
  el.btnEmptyAdd.addEventListener('click', () => el.fileInput.click());
  el.btnFolder.addEventListener('click', () => el.folderInput.click());
  el.btnEmptyFolder.addEventListener('click', () => el.folderInput.click());
  el.fileInput.addEventListener('change', () => {
    addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });
  el.folderInput.addEventListener('change', () => {
    addFiles(el.folderInput.files);
    el.folderInput.value = '';
  });
  el.btnDemo.addEventListener('click', loadDemo);
  el.btnDemoEmpty.addEventListener('click', loadDemo);
  el.btnClear.addEventListener('click', clearBatch);
}

function isImageFile(file) {
  return file && (String(file.type).startsWith('image/') || IMAGE_EXT.test(file.name || ''));
}

function fileKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

async function addFiles(fileList) {
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;

  const heic = incoming.filter((file) => HEIC_EXT.test(file.name));
  const images = incoming.filter((file) => isImageFile(file) && !HEIC_EXT.test(file.name));
  if (heic.length) {
    toast(`${heic.length} HEIC/HEIF photo${heic.length > 1 ? 's were' : ' was'} skipped. Export them as JPG first.`, 'info', 5500);
  }
  const unsupported = incoming.length - images.length - heic.length;
  if (unsupported > 0) {
    toast(`${unsupported} non-image file${unsupported > 1 ? 's were' : ' was'} skipped.`, 'info');
  }
  if (!images.length) return;

  const existing = new Set(state.items.map((item) => item.key));
  const seen = new Set();
  const newFiles = [];
  for (const file of images) {
    const key = fileKey(file);
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    newFiles.push(file);
  }
  if (!newFiles.length) {
    toast('Those photos are already in the batch.', 'info');
    return;
  }

  let restored = 0;
  const newItems = newFiles.map((file) => {
    const item = makeItem(file);
    if (state.drafts[fileKey(file)]) restored++;
    return item;
  });
  state.items.push(...newItems);
  renderFilmstrip();
  syncUI();
  updateProgress();

  if (!state.activeId || !activeItem()) {
    setActive(newItems[0].id, { force: true });
  }

  const pieces = [`Added ${newItems.length} photo${newItems.length > 1 ? 's' : ''}`];
  if (restored) pieces.push(`${restored} draft${restored > 1 ? 's' : ''} restored`);
  toast(pieces.join(' · '), 'success');
}

function makeItem(file) {
  const key = fileKey(file);
  const saved = state.drafts[key];
  const autoName = filenameToName(file.name, detectCategory(file.name));
  return {
    id: `photo-${++idSeq}`,
    file,
    key,
    url: URL.createObjectURL(file),
    name: typeof saved?.name === 'string' ? saved.name : autoName,
    nameAuto: saved ? Boolean(saved.nameAuto) : true,
    priceRaw: typeof saved?.priceRaw === 'string' ? saved.priceRaw : '',
    priceAuto: saved ? Boolean(saved.priceAuto) : false,
    condition: saved?.condition && CONDITIONS.some((c) => c.value === saved.condition) ? saved.condition : detectCondition(file.name),
    notes: typeof saved?.notes === 'string' ? saved.notes : '',
    status: ['done', 'skipped'].includes(saved?.status) ? saved.status : 'pending',
    skipProcessing: Boolean(saved?.skipProcessing),
    bitmapPromise: null,
    suggestion: null,
    suggestionApplied: null,
    suggestionDismissed: false,
    aiState: 'idle',
    previewFailed: false,
  };
}

function renderFilmstrip() {
  const fragment = document.createDocumentFragment();
  state.items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.dataset.id = item.id;
    button.title = `${index + 1}. ${item.name || item.file.name}`;
    button.setAttribute('aria-label', `Photo ${index + 1}: ${item.name || item.file.name}`);

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => button.classList.add('is-error'));
    button.append(img);

    const number = document.createElement('span');
    number.className = 'thumb-index';
    number.textContent = String(index + 1);
    button.append(number);

    const status = document.createElement('span');
    status.className = 'thumb-status';
    status.textContent = '✓';
    button.append(status);

    button.addEventListener('click', () => {
      if (state.activeId === item.id) return;
      flushDrafts();
      setActive(item.id);
    });
    fragment.append(button);
  });
  el.filmstrip.replaceChildren(fragment);
  refreshThumbStates();
}

function refreshThumbStates() {
  for (const button of el.filmstrip.querySelectorAll('.thumb')) {
    const item = state.items.find((it) => it.id === button.dataset.id);
    if (!item) continue;
    button.classList.toggle('is-active', item.id === state.activeId);
    button.classList.toggle('is-done', item.status === 'done');
    button.classList.toggle('is-skipped', item.status === 'skipped');
    button.title = `${state.items.indexOf(item) + 1}. ${item.name || item.file.name}`;
  }
}

function scrollActiveThumb() {
  const active = el.filmstrip.querySelector('.thumb.is-active');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function loadDemo() {
  const buttons = [el.btnDemo, el.btnDemoEmpty];
  buttons.forEach((b) => {
    b.disabled = true;
    b.dataset.label = b.textContent;
    b.textContent = 'Loading demo…';
  });
  try {
    const response = await fetch('./samples/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Manifest not found');
    const manifest = await response.json();
    const names = Array.isArray(manifest) ? manifest : manifest.files;
    if (!Array.isArray(names) || !names.length) throw new Error('No demo files listed');
    const files = [];
    for (const name of names) {
      const res = await fetch(`./samples/${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load ${name}`);
      const blob = await res.blob();
      files.push(new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: 1_700_000_000_000 }));
    }
    await addFiles(files);
  } catch (error) {
    console.error(error);
    toast('Could not load the demo photos. Run the app from its folder over http://localhost.', 'error', 6000);
  } finally {
    buttons.forEach((b) => {
      b.disabled = false;
      if (b.dataset.label) b.textContent = b.dataset.label;
    });
  }
}

function clearBatch() {
  if (!state.items.length) return;
  const ok = window.confirm(
    `Clear all ${state.items.length} photos from this batch?\n\nYour saved text drafts stay in this browser and will return if you re-add the same files.`
  );
  if (!ok) return;
  for (const item of state.items) {
    URL.revokeObjectURL(item.url);
    releaseBitmap(item);
  }
  state.items = [];
  state.activeId = null;
  state.previewErrorToasted.clear();
  el.filmstrip.replaceChildren();
  syncUI();
  updateProgress();
  toast('Batch cleared. Saved drafts are still available.', 'info');
}

/* ───────────────────────── Selection / review ───────────────────────── */

function activeItem() {
  return state.items.find((item) => item.id === state.activeId) || null;
}

function setActive(id, { force = false } = {}) {
  const next = state.items.find((item) => item.id === id);
  if (!next) return;
  const previous = activeItem();
  if (previous && previous.id !== id) releaseBitmap(previous);

  const changed = state.activeId !== id;
  state.activeId = id;
  if (changed) {
    syncUI();
    refreshThumbStates();
    scrollActiveThumb();
    hideSuggestionCard();
  }
  fillEditor(next);
  renderStageMeta(next);
  updateStatusChip(next);
  updateNavButtons();
  renderSuggestion(next);
  updatePreview();
  maybeAutoSuggest(next);
}

function syncUI() {
  const hasItems = state.items.length > 0;
  el.emptyState.hidden = hasItems;
  el.review.hidden = !hasItems;
  el.editorEmpty.hidden = hasItems;
  el.editorBody.hidden = !hasItems;
  el.editorFoot.hidden = !hasItems;
  el.sidebarEmpty.hidden = hasItems;
  el.btnClear.hidden = !hasItems;
  el.btnDemo.hidden = hasItems;
  el.btnDemoEmpty.hidden = hasItems;
  el.deckCount.textContent = String(state.items.length);
  el.btnExport.disabled = !hasItems || state.exporting;
  el.exportLabel.textContent = state.exporting
    ? 'Preparing…'
    : hasItems
      ? `Export Excel (${state.items.filter((item) => item.status !== 'skipped').length})`
      : 'Export Excel';
  el.navListCount.textContent = String(state.items.filter((item) => item.status !== 'skipped').length);
  if (!hasItems) {
    el.filmstrip.replaceChildren();
    el.previewImg.removeAttribute('src');
  }
  updateAiCaption();
  if (state.mode === 'list') renderPostList();
}

function displayName(item) {
  return item.name.trim() || filenameToName(item.file.name, detectCategory(item.file.name));
}

function itemIsDocument(item) {
  return Boolean(item) && isPersonalDocument(item.file.name, item.name, item.notes);
}

/* ───────────────────────── Post list ───────────────────────── */

function bindViews() {
  el.navReview.addEventListener('click', () => setMode('review'));
  el.navList.addEventListener('click', () => setMode('list'));
  el.btnBackReview.addEventListener('click', () => setMode('review'));
  el.postList.addEventListener('click', onPostListClick);
}

function setMode(mode) {
  if (mode !== 'review' && mode !== 'list') return;
  if (state.mode === mode) return;
  state.mode = mode;
  document.body.classList.toggle('mode-list', mode === 'list');
  el.workspace.hidden = mode !== 'review';
  el.listing.hidden = mode !== 'list';
  el.navReview.classList.toggle('is-active', mode === 'review');
  el.navList.classList.toggle('is-active', mode === 'list');
  el.navReview.setAttribute('aria-pressed', String(mode === 'review'));
  el.navList.setAttribute('aria-pressed', String(mode === 'list'));

  if (mode === 'list') {
    flushDrafts();
    renderPostList();
    el.listing.scrollTop = 0;
  } else {
    postPreviewSeq++;
    updatePreview();
  }
}

function postSignature(item) {
  const s = state.settings;
  return JSON.stringify([
    s.processEnabled,
    item.skipProcessing,
    s.enhance,
    s.enhanceStrength,
    s.overlay,
    s.overlayName,
    s.overlayPrice,
    s.overlayPosition,
    s.overlayScale,
    item.name,
    item.priceRaw,
  ]);
}

function renderPostList() {
  const items = state.items.filter((item) => item.status !== 'skipped');
  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => fragment.append(buildPostCard(item, index)));
  el.postList.replaceChildren(fragment);
  el.postList.hidden = items.length === 0;
  el.listingEmpty.hidden = items.length > 0;
  updateListingStats(items);

  const token = ++postPreviewSeq;
  queuePostPreviews(items, token);
}

function updateListingStats(items) {
  const ready = items.filter((item) => item.status === 'done').length;
  const drafts = items.length - ready;
  const skipped = state.items.length - items.length;
  const stats = [];

  const add = (label, value, className = '') => {
    const pill = document.createElement('span');
    pill.className = `listing-stat${className ? ` ${className}` : ''}`;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    pill.append(strong, document.createTextNode(` ${label}`));
    stats.push(pill);
  };

  add(items.length === 1 ? 'item' : 'items', items.length);
  add('ready', ready, 'is-ready');
  if (drafts) add(drafts === 1 ? 'draft' : 'drafts', drafts);
  if (skipped) add('skipped', skipped, 'is-skipped');
  el.listingStats.replaceChildren(...stats);
}

function buildPostCard(item, index) {
  const name = displayName(item);
  const price = parsePrice(item.priceRaw);
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.id = item.id;
  card.setAttribute('role', 'listitem');

  const media = document.createElement('div');
  media.className = 'post-media';
  const img = document.createElement('img');
  img.className = 'post-img';
  img.alt = name;
  img.loading = 'lazy';
  const cached = item.postPreview?.signature === postSignature(item);
  img.src = cached ? item.postPreview.dataUrl : item.url;
  if (!cached && state.settings.processEnabled && !item.skipProcessing) img.classList.add('is-loading');

  const indexBadge = document.createElement('span');
  indexBadge.className = 'post-index';
  indexBadge.textContent = String(index + 1).padStart(2, '0');

  const status = document.createElement('span');
  const ready = item.status === 'done';
  status.className = `post-badge${ready ? ' is-ready' : ''}`;
  status.textContent = ready ? 'Ready' : 'Draft';

  media.append(img, indexBadge, status);

  const body = document.createElement('div');
  body.className = 'post-body';

  const title = document.createElement('h3');
  title.className = 'post-name';
  title.textContent = name;

  const priceNode = document.createElement('div');
  priceNode.className = `post-price${price > 0 ? '' : ' is-empty'}`;
  priceNode.textContent = price > 0 ? formatVnd(price) : 'No price yet';

  const tags = document.createElement('div');
  tags.className = 'post-tags';
  const condition = document.createElement('span');
  condition.className = 'post-tag is-condition';
  condition.textContent = conditionLabel(item.condition, true);
  tags.append(condition);

  const notes = document.createElement('p');
  notes.className = 'post-notes';
  const noteText = item.notes.trim();
  if (noteText) {
    notes.textContent = noteText;
  } else {
    notes.hidden = true;
  }

  const actions = document.createElement('div');
  actions.className = 'post-actions';
  const copyPhoto = document.createElement('button');
  copyPhoto.type = 'button';
  copyPhoto.className = 'btn btn-primary';
  copyPhoto.dataset.action = 'copy-photo';
  copyPhoto.textContent = 'Copy photo';
  const copyCaption = document.createElement('button');
  copyCaption.type = 'button';
  copyCaption.className = 'btn btn-ghost';
  copyCaption.dataset.action = 'copy-caption';
  copyCaption.textContent = 'Copy caption';
  actions.append(copyPhoto, copyCaption);

  const foot = document.createElement('div');
  foot.className = 'post-foot';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'link-btn';
  edit.dataset.action = 'edit';
  edit.textContent = 'Edit details';
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'link-btn';
  download.dataset.action = 'download';
  download.textContent = 'Download JPG';
  foot.append(edit, download);

  body.append(title, priceNode, tags, notes, actions, foot);
  card.append(media, body);
  return card;
}

async function queuePostPreviews(items, token) {
  const pending = items.filter((item) => item.postPreview?.signature !== postSignature(item));
  if (!pending.length) return;

  const queue = pending.slice();
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length && token === postPreviewSeq) {
      const item = queue.shift();
      await renderPostPreview(item, token);
    }
  });
  await Promise.all(workers);
}

async function renderPostPreview(item, token) {
  const findImage = () => el.postList.querySelector(`.post-card[data-id="${item.id}"] .post-img`);
  const image = findImage();
  const signature = postSignature(item);

  if (item.postPreview?.signature === signature) {
    if (image) {
      image.src = item.postPreview.dataUrl;
      image.classList.remove('is-loading');
    }
    return;
  }

  if (!state.settings.processEnabled || item.skipProcessing) {
    item.postPreview = { signature, dataUrl: item.url };
    if (image) {
      image.src = item.url;
      image.classList.remove('is-loading');
    }
    return;
  }

  try {
    const bitmap = await getBitmap(item);
    if (token !== postPreviewSeq) return;
    const { canvas } = renderPostPhoto(bitmap, state.settings, {
      maxSize: 640,
      name: displayName(item),
      price: parsePrice(item.priceRaw),
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    if (token !== postPreviewSeq) return;
    item.postPreview = { signature, dataUrl };
    const live = findImage();
    if (live) {
      live.src = dataUrl;
      live.classList.remove('is-loading');
    }
  } catch (error) {
    console.error(error);
    const live = findImage();
    if (live) live.classList.remove('is-loading');
  } finally {
    if (item.id !== state.activeId) releaseBitmap(item);
  }
}

function onPostListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.post-card');
  const item = state.items.find((entry) => entry.id === card?.dataset.id);
  if (!item) return;

  switch (button.dataset.action) {
    case 'copy-photo':
      copyPostPhoto(item, button);
      break;
    case 'copy-caption':
      copyPostCaption(item, button);
      break;
    case 'download':
      downloadPostPhoto(item, button);
      break;
    case 'edit':
      editPostItem(item);
      break;
  }
}

function captionFor(item) {
  return buildCaption({
    name: displayName(item),
    price: parsePrice(item.priceRaw),
    condition: item.condition,
    notes: item.notes,
    isDocument: itemIsDocument(item),
  });
}

function postPngPromise(item) {
  return (async () => {
    const bitmap = await getBitmap(item);
    try {
      const { canvas } = renderPostPhoto(bitmap, state.settings, {
        maxSize: 1800,
        name: displayName(item),
        price: parsePrice(item.priceRaw),
        applyProcessing: state.settings.processEnabled && !item.skipProcessing,
      });
      return await canvasToBlob(canvas, 'image/png');
    } finally {
      if (item.id !== state.activeId) releaseBitmap(item);
    }
  })();
}

async function copyPostPhoto(item, button) {
  if (!navigator.clipboard?.write || typeof window.ClipboardItem === 'undefined') {
    downloadPostPhoto(item, button);
    toast('This browser cannot copy images — the photo is downloading instead.', 'info', 5500);
    return;
  }

  const png = postPngPromise(item);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    flashButton(button, 'Copied photo');
    toast('Photo copied — paste it into your post.', 'success', 2400);
  } catch (error) {
    console.warn(error);
    try {
      const blob = await png;
      downloadBlob(blob, photoFileName(displayName(item), 'png'));
      toast('Could not use the clipboard — the photo was downloaded instead.', 'info', 5500);
    } catch (fallbackError) {
      console.error(fallbackError);
      toast('Could not prepare that photo. Try the Download JPG link.', 'error', 5000);
    }
  }
}

async function copyPostCaption(item, button) {
  const text = captionFor(item);
  try {
    await navigator.clipboard.writeText(text);
    flashButton(button, 'Copied caption');
    toast('Caption copied — paste it into the description.', 'success', 2400);
  } catch (error) {
    console.warn(error);
    if (fallbackCopyText(text)) {
      flashButton(button, 'Copied caption');
      toast('Caption copied — paste it into the description.', 'success', 2400);
    } else {
      toast('Could not copy the caption. Select the text and copy it manually.', 'error', 5000);
    }
  }
}

function fallbackCopyText(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

function flashButton(button, label) {
  if (!button.isConnected) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  clearTimeout(Number(button.dataset.flashTimer || 0));
  button.textContent = label;
  button.classList.add('is-copied');
  const timer = setTimeout(() => {
    if (!button.isConnected) return;
    button.textContent = button.dataset.label;
    button.classList.remove('is-copied');
  }, 1800);
  button.dataset.flashTimer = String(timer);
}

async function downloadPostPhoto(item, button) {
  try {
    const bitmap = await getBitmap(item);
    try {
      const { canvas } = renderPostPhoto(bitmap, state.settings, {
        maxSize: 2200,
        name: displayName(item),
        price: parsePrice(item.priceRaw),
        applyProcessing: state.settings.processEnabled && !item.skipProcessing,
      });
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      downloadBlob(blob, photoFileName(displayName(item)));
      if (button) flashButton(button, 'Downloaded');
      toast('Photo downloaded.', 'success', 2400);
    } finally {
      if (item.id !== state.activeId) releaseBitmap(item);
    }
  } catch (error) {
    console.error(error);
    toast('Could not download that photo.', 'error', 5000);
  }
}

function editPostItem(item) {
  setMode('review');
  setActive(item.id, { force: true });
  selectTab('item');
  requestAnimationFrame(() => {
    el.fName.focus();
    el.fName.select();
  });
}

function renderStageMeta(item) {
  const index = state.items.indexOf(item);
  el.fileIndex.textContent = `${index + 1} / ${state.items.length}`;
  el.fileName.textContent = item.file.name;
  el.fileSize.textContent = formatBytes(item.file.size);
  el.deckPosition.textContent = `${index + 1} of ${state.items.length}`;
  el.previewImg.alt = item.name ? `Preview: ${item.name}` : `Preview: ${item.file.name}`;
}

function fillEditor(item) {
  el.fName.value = item.name;
  el.fPrice.value = item.priceRaw;
  el.fCondition.value = item.condition;
  el.fNotes.value = item.notes;
  el.sSkipItem.checked = item.skipProcessing;
  el.sSkipItem.disabled = !state.settings.processEnabled;
  updatePriceHint(item);
  updateAiCaption();
  updateSuggestButton(item);
}

function updateStatusChip(item) {
  if (!item) return;
  el.statusChip.classList.remove('is-done', 'is-skipped');
  if (item.status === 'done') {
    el.statusChip.textContent = 'Ready';
    el.statusChip.classList.add('is-done');
  } else if (item.status === 'skipped') {
    el.statusChip.textContent = 'Skipped';
    el.statusChip.classList.add('is-skipped');
  } else {
    el.statusChip.textContent = 'Draft';
  }
  el.statusChip.title =
    item.status === 'done'
      ? 'Saved into the post list'
      : item.status === 'skipped'
        ? 'Excluded from the post list and export — click Save & next to include it'
        : 'Not marked ready yet';
}

function updateProgress() {
  const total = state.items.length;
  const done = state.items.filter((item) => item.status === 'done').length;
  const skipped = state.items.filter((item) => item.status === 'skipped').length;
  el.progressText.textContent = `${done} / ${total} ready`;
  el.progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';
  el.progressPill.title = `${done} ready · ${skipped} skipped · ${Math.max(0, total - done - skipped)} left`;
  el.deckCount.textContent = String(total);
  el.navListCount.textContent = String(Math.max(0, total - skipped));
  if (!state.exporting) {
    const eligible = state.items.filter((item) => item.status !== 'skipped').length;
    el.exportLabel.textContent = total ? `Export Excel (${eligible})` : 'Export Excel';
  }
}

function updateNavButtons() {
  const index = state.items.findIndex((item) => item.id === state.activeId);
  el.btnPrev.disabled = index <= 0;
  el.btnSkip.disabled = index < 0;
  el.btnNext.disabled = index < 0;
}

function goNext() {
  const item = activeItem();
  if (!item) return;
  if (!item.name.trim()) {
    item.name = filenameToName(item.file.name, detectCategory(`${item.file.name} ${item.notes}`));
    item.nameAuto = true;
    if (state.activeId === item.id) el.fName.value = item.name;
  }
  item.status = 'done';
  updateStatusChip(item);
  refreshThumbStates();
  updateProgress();
  flushDrafts();

  const index = state.items.findIndex((it) => it.id === item.id);
  if (index >= 0 && index < state.items.length - 1) {
    setActive(state.items[index + 1].id);
  } else {
    updateNavButtons();
    const remaining = state.items.filter((it) => it.status === 'pending').length;
    if (!remaining) {
      toast('Last photo reviewed. Your post list is ready.', 'success', 5000);
    } else {
      toast(`Last photo saved. ${remaining} still need a decision.`, 'info');
    }
  }
}

function goPrev() {
  const index = state.items.findIndex((item) => item.id === state.activeId);
  if (index <= 0) return;
  flushDrafts();
  setActive(state.items[index - 1].id);
}

function skipCurrent() {
  const item = activeItem();
  if (!item) return;
  item.status = 'skipped';
  updateStatusChip(item);
  refreshThumbStates();
  updateProgress();
  flushDrafts();
  const index = state.items.findIndex((it) => it.id === item.id);
  if (index >= 0 && index < state.items.length - 1) {
    setActive(state.items[index + 1].id);
  } else {
    updateNavButtons();
    toast('Photo skipped — it will be left out of the post list and Excel.', 'info');
  }
}

function removeActive() {
  const item = activeItem();
  if (!item) return;
  const ok = window.confirm(`Remove “${item.file.name}” from this batch?`);
  if (!ok) return;
  flushDrafts();
  const index = state.items.findIndex((it) => it.id === item.id);
  URL.revokeObjectURL(item.url);
  releaseBitmap(item);
  state.items = state.items.filter((it) => it.id !== item.id);
  delete state.drafts[item.key];
  storeDrafts();
  if (state.items.length) {
    const next = state.items[Math.min(index, state.items.length - 1)];
    state.activeId = null;
    renderFilmstrip();
    syncUI();
    updateProgress();
    setActive(next.id, { force: true });
  } else {
    state.activeId = null;
    renderFilmstrip();
    syncUI();
    updateProgress();
    toast('No photos in the batch.', 'info');
  }
}

/* ───────────────────────── Bitmap / preview ───────────────────────── */

function getBitmap(item) {
  if (!item.bitmapPromise) {
    item.bitmapPromise = loadBitmap(item.file).catch((error) => {
      item.bitmapPromise = null;
      throw error;
    });
  }
  return item.bitmapPromise;
}

function releaseBitmap(item) {
  if (!item.bitmapPromise) return;
  const promise = item.bitmapPromise;
  item.bitmapPromise = null;
  promise.then((bitmap) => closeBitmap(bitmap)).catch(() => {});
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => updatePreview(), 220);
}

async function updatePreview() {
  const item = activeItem();
  if (!item) return;
  const token = ++previewSeq;
  const useOriginal = state.view === 'original' || !state.settings.processEnabled || item.skipProcessing;
  if (useOriginal) {
    el.previewLoading.hidden = true;
    el.previewImg.classList.remove('is-loading');
    el.previewImg.src = item.url;
    return;
  }

  el.previewLoading.hidden = false;
  el.previewImg.classList.add('is-loading');
  try {
    const bitmap = await getBitmap(item);
    if (token !== previewSeq || state.activeId !== item.id) return;
    const result = renderPostPhoto(bitmap, state.settings, {
      maxSize: 1400,
      name: item.name,
      price: parsePrice(item.priceRaw),
    });
    if (token !== previewSeq || state.activeId !== item.id) return;
    el.previewImg.src = result.canvas.toDataURL('image/jpeg', 0.9);
    item.previewFailed = false;
  } catch (error) {
    if (token !== previewSeq) return;
    console.error(error);
    el.previewImg.src = item.url;
    if (!state.previewErrorToasted.has(item.id)) {
      state.previewErrorToasted.add(item.id);
      toast(`Could not process ${item.file.name}. Showing the original photo.`, 'error', 5000);
    }
  } finally {
    if (token === previewSeq) {
      el.previewLoading.hidden = true;
      el.previewImg.classList.remove('is-loading');
    }
  }
}

function updatePriceHint(item = activeItem()) {
  if (!item) return;
  const raw = item.priceRaw.trim();
  el.priceHint.classList.remove('is-error', 'is-price', 'is-warning');
  if (!raw) {
    if (isPersonalDocument(item.file.name, item.name, item.notes)) {
      el.priceHint.textContent = 'Personal document — no price suggested';
      el.priceHint.classList.add('is-warning');
    } else if (item.suggestion?.range) {
      el.priceHint.textContent = `Est. ${formatShortVnd(item.suggestion.range.min)} – ${formatShortVnd(item.suggestion.range.max)}`;
    } else {
      el.priceHint.textContent = 'Type 450k, 4.5tr or 4.500.000';
    }
    return;
  }
  const value = parsePrice(raw);
  if (value === null) {
    el.priceHint.textContent = "Can't read that price — try 450k or 4.5tr";
    el.priceHint.classList.add('is-error');
  } else {
    el.priceHint.textContent = `= ${formatVnd(value)}`;
    el.priceHint.classList.add('is-price');
  }
}

function updateViewToggle() {
  for (const button of el.viewToggle.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.view === state.view);
  }
}

/* ───────────────────────── Editor events ───────────────────────── */

function bindEditor() {
  el.fName.addEventListener('input', () => {
    const item = activeItem();
    if (!item) return;
    item.name = el.fName.value;
    item.nameAuto = false;
    item.suggestionApplied = null;
    renderSuggestion(item);
    const thumb = el.filmstrip.querySelector(`.thumb[data-id="${item.id}"]`);
    if (thumb) thumb.title = `${state.items.indexOf(item) + 1}. ${item.name || item.file.name}`;
    el.previewImg.alt = item.name ? `Preview: ${item.name}` : `Preview: ${item.file.name}`;
    if (state.settings.processEnabled && state.settings.overlay && !item.skipProcessing) schedulePreview();
    scheduleDraftSave();
  });

  el.fPrice.addEventListener('input', () => {
    const item = activeItem();
    if (!item) return;
    item.priceRaw = el.fPrice.value;
    item.priceAuto = false;
    item.suggestionApplied = null;
    updatePriceHint(item);
    renderSuggestion(item);
    if (state.settings.processEnabled && state.settings.overlay && !item.skipProcessing) schedulePreview();
    scheduleDraftSave();
  });

  el.fCondition.addEventListener('change', () => {
    const item = activeItem();
    if (!item) return;
    item.condition = el.fCondition.value;
    updatePriceHint(item);
    scheduleDraftSave();
  });

  el.fNotes.addEventListener('input', () => {
    const item = activeItem();
    if (!item) return;
    item.notes = el.fNotes.value;
    scheduleDraftSave();
  });

  el.sSkipItem.addEventListener('change', () => {
    const item = activeItem();
    if (!item) return;
    item.skipProcessing = el.sSkipItem.checked;
    scheduleDraftSave();
    updatePreview();
  });

  el.btnNext.addEventListener('click', goNext);
  el.btnPrev.addEventListener('click', goPrev);
  el.btnSkip.addEventListener('click', skipCurrent);
  el.btnRemove.addEventListener('click', removeActive);

  for (const button of el.viewToggle.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      updateViewToggle();
      updatePreview();
    });
  }

  el.tabs.addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (!button) return;
    selectTab(button.dataset.tab);
  });
}

function selectTab(tab) {
  state.tab = tab;
  for (const button of el.tabs.querySelectorAll('.tab')) {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  el.tabItem.hidden = tab !== 'item';
  el.tabImage.hidden = tab !== 'image';
}

/* ───────────────────────── Suggestions ───────────────────────── */

function maybeAutoSuggest(item) {
  if (!state.settings.aiEnabled || !state.settings.aiAuto) return;
  if (!item || item.suggestion || item.suggestionDismissed || item.aiState === 'loading') return;
  requestSuggestion(item, { manual: false });
}

async function requestSuggestion(item, { manual = false } = {}) {
  if (!item || item.aiState === 'loading') return;
  if (!state.settings.aiEnabled) {
    toast('AI assist is off. Turn it on in the top bar first.', 'info');
    return;
  }
  item.aiState = 'loading';
  item.suggestionDismissed = false;
  if (state.activeId === item.id) {
    renderSuggestion(item);
    updateSuggestButton(item);
  }

  const settings = state.settings;
  let suggestion = null;
  try {
    if (settings.aiMode === 'cloud') {
      const localHint = suggestLocal({ filename: item.file.name, name: item.name, condition: item.condition });
      if (isPersonalDocument(item.file.name, item.name, item.notes)) {
        // Never send ID cards, passports or similar personal papers to a
        // third-party vision endpoint. Keep the local, price-free proposal.
        suggestion = localHint;
        if (!state.documentWarned) {
          toast('Personal document detected — kept off cloud AI. No price suggested.', 'info', 7000);
          state.documentWarned = true;
        }
      } else {
        const bitmap = await getBitmap(item);
        if (!state.items.includes(item)) return;
        const image = renderPlain(bitmap, 768, 0.8);
        suggestion = await requestAiSuggestion({
          imageDataUrl: image.dataUrl,
          filename: item.file.name,
          condition: item.condition,
          hint: `${localHint.name} ~ ${formatShortVnd(localHint.price)}`,
          settings,
        });
      }
    } else {
      suggestion = suggestLocal({
        filename: item.file.name,
        name: item.name,
        condition: item.condition,
      });
    }
    if (!state.items.includes(item)) return;
    if (item.suggestionDismissed) return;
    if (manual) {
      // An explicit request proposes values; it never overwrites what the
      // seller typed. The card's "Use suggestion" button applies them.
      item.suggestion = suggestion;
      item.suggestionDismissed = false;
      item.suggestionApplied = null;
      if (state.activeId === item.id) renderSuggestion(item);
      scheduleDraftSave();
    } else {
      applySuggestion(item, suggestion);
    }
  } catch (error) {
    console.error(error);
    if (item.suggestionDismissed) return;
    const fallback = suggestLocal({ filename: item.file.name, name: item.name, condition: item.condition });
    if (state.items.includes(item)) {
      if (manual) {
        item.suggestion = fallback;
        item.suggestionDismissed = false;
        item.suggestionApplied = null;
        if (state.activeId === item.id) renderSuggestion(item);
        scheduleDraftSave();
      } else {
        applySuggestion(item, fallback);
      }
      if (manual || !state.cloudFailToasted) {
        toast(`${error.message} Showing a local estimate instead.`, 'error', 6500);
        state.cloudFailToasted = true;
      }
    }
  } finally {
    if (state.items.includes(item)) {
      item.aiState = 'idle';
      if (state.activeId === item.id) {
        renderSuggestion(item);
        updateSuggestButton(item);
      }
    }
  }
}

function applySuggestion(item, suggestion, { force = false } = {}) {
  if (!suggestion) return;
  const before = {
    name: item.name,
    priceRaw: item.priceRaw,
    nameAuto: item.nameAuto,
    priceAuto: item.priceAuto,
  };
  item.suggestion = suggestion;
  item.suggestionDismissed = false;

  let changed = false;
  if (suggestion.name && (force || !item.name.trim() || item.nameAuto)) {
    if (item.name !== suggestion.name) {
      item.name = suggestion.name;
      item.nameAuto = true;
      changed = true;
    }
  }
  if (suggestion.price && (force || !item.priceRaw.trim() || item.priceAuto)) {
    const raw = String(suggestion.price);
    if (item.priceRaw !== raw) {
      item.priceRaw = raw;
      item.priceAuto = true;
      changed = true;
    }
  }
  if (changed) item.suggestionApplied = before;
  else if (!item.suggestionApplied) item.suggestionApplied = null;

  if (state.activeId === item.id) {
    el.fName.value = item.name;
    el.fPrice.value = item.priceRaw;
    updatePriceHint(item);
    renderSuggestion(item);
    if (state.settings.processEnabled && state.settings.overlay && !item.skipProcessing) schedulePreview();
  }
  scheduleDraftSave();
}

function undoSuggestion() {
  const item = activeItem();
  if (!item?.suggestionApplied) return;
  const before = item.suggestionApplied;
  item.name = before.name;
  item.nameAuto = before.nameAuto;
  item.priceRaw = before.priceRaw;
  item.priceAuto = before.priceAuto;
  item.suggestionApplied = null;
  el.fName.value = item.name;
  el.fPrice.value = item.priceRaw;
  updatePriceHint(item);
  renderSuggestion(item);
  schedulePreview();
  scheduleDraftSave();
}

function dismissSuggestion() {
  const item = activeItem();
  if (!item) return;
  item.suggestionDismissed = true;
  hideSuggestionCard();
}

function hideSuggestionCard() {
  el.suggestCard.hidden = true;
}

function renderSuggestion(item) {
  if (!item) {
    hideSuggestionCard();
    return;
  }
  const loading = item.aiState === 'loading';
  if (!loading && (!item.suggestion || item.suggestionDismissed)) {
    hideSuggestionCard();
    return;
  }
  el.suggestCard.hidden = false;
  el.suggestLoading.hidden = !loading;

  const suggestion = item.suggestion;
  const isAi = suggestion?.source === 'ai';
  const isDocument = suggestion?.category === 'document';
  el.suggestSource.textContent = isDocument ? 'Document' : isAi ? 'Cloud AI' : 'Local';
  el.suggestSource.classList.toggle('is-ai', Boolean(isAi));
  el.suggestSource.classList.toggle('is-document', Boolean(isDocument));
  el.suggestCard.classList.toggle('is-document', Boolean(isDocument));

  if (loading && !suggestion) {
    el.suggestName.textContent = state.settings.aiMode === 'cloud' ? 'Reading the photo with cloud AI…' : 'Estimating name and price…';
    el.suggestMeta.textContent = 'You can keep typing; suggestions only fill empty fields.';
    el.suggestApply.hidden = true;
    el.suggestUndo.hidden = true;
    el.suggestApplied.hidden = true;
    return;
  }
  if (!suggestion) {
    hideSuggestionCard();
    return;
  }

  el.suggestName.textContent = suggestion.name || 'No name suggested';
  const parts = [];
  if (suggestion.price) parts.push(formatVnd(suggestion.price));
  if (suggestion.range) parts.push(`est. ${formatShortVnd(suggestion.range.min)}–${formatShortVnd(suggestion.range.max)}`);
  if (suggestion.note) parts.push(suggestion.note);
  el.suggestMeta.textContent = parts.join(' · ');

  const applied = Boolean(item.suggestionApplied);
  el.suggestApplied.hidden = !applied;
  el.suggestApply.hidden = applied || loading;
  el.suggestUndo.hidden = !applied;
  el.suggestApply.disabled = loading;
  if (!applied && !loading) {
    const nameDiff = suggestion.name && suggestion.name !== item.name;
    const priceDiff = suggestion.price && String(suggestion.price) !== item.priceRaw.trim();
    el.suggestApply.textContent = nameDiff || priceDiff ? 'Use suggestion' : 'Already matches';
  }
}

function updateSuggestButton(item = activeItem()) {
  const loading = item?.aiState === 'loading';
  el.btnSuggest.disabled = loading;
  el.btnSuggest.textContent = loading ? '✦ Reading photo…' : '✦ Suggest name & price';
}

function updateAiCaption() {
  const s = state.settings;
  if (!s.aiEnabled) {
    el.aiCaption.textContent = 'AI assist is off';
    return;
  }
  if (s.aiMode === 'cloud') {
    el.aiCaption.textContent = `Cloud · ${s.apiModel || 'not configured'}`;
  } else {
    el.aiCaption.textContent = 'Local estimate · no upload';
  }
}

function syncAiUI() {
  const s = state.settings;
  el.btnAi.classList.toggle('is-on', s.aiEnabled);
  el.btnAi.classList.toggle('is-off', !s.aiEnabled);
  el.btnAi.classList.toggle('is-local', s.aiMode === 'local');
  el.btnAi.classList.toggle('is-cloud', s.aiMode === 'cloud');
  el.btnAi.setAttribute('aria-pressed', String(s.aiEnabled));
  el.aiState.textContent = s.aiEnabled ? (s.aiMode === 'cloud' ? 'Cloud' : 'Local') : 'Off';
  el.btnAi.title = s.aiEnabled
    ? `AI assist is on (${s.aiMode === 'cloud' ? `cloud: ${s.apiModel}` : 'local estimates'}). Click to turn off.`
    : 'AI assist is off. Click to turn on.';
  updateAiCaption();
}

function bindGlobalActions() {
  el.btnSuggest.addEventListener('click', () => {
    const item = activeItem();
    if (item) requestSuggestion(item, { manual: true });
  });
  el.suggestApply.addEventListener('click', () => {
    const item = activeItem();
    if (item?.suggestion) applySuggestion(item, item.suggestion, { force: true });
  });
  el.suggestUndo.addEventListener('click', undoSuggestion);
  el.suggestDismiss.addEventListener('click', dismissSuggestion);

  el.btnAi.addEventListener('click', () => {
    state.settings.aiEnabled = !state.settings.aiEnabled;
    saveSettings();
    syncAiUI();
    updateAiCaption();
    if (state.settings.aiEnabled) {
      toast(
        state.settings.aiMode === 'local'
          ? 'AI assist on — local name and price estimates.'
          : `AI assist on — cloud model ${state.settings.apiModel}.`,
        'info'
      );
      const item = activeItem();
      if (item) maybeAutoSuggest(item);
    } else {
      toast('AI assist off. Everything stays editable.', 'info');
    }
  });

  el.btnExport.addEventListener('click', exportWorkbook);
  el.btnSettings.addEventListener('click', openSettings);
}

/* ───────────────────────── Image settings ───────────────────────── */

function bindImageTab() {
  el.sProcess.addEventListener('change', () => {
    updateSetting('processEnabled', el.sProcess.checked);
    syncImageControls();
    updatePreview();
  });
  el.sEnhance.addEventListener('change', () => {
    updateSetting('enhance', el.sEnhance.checked);
    syncImageControls();
    updatePreview();
  });
  el.sEnhanceStrength.addEventListener('input', () => {
    updateSetting('enhanceStrength', Number(el.sEnhanceStrength.value));
    el.enhanceStrengthOut.textContent = `${el.sEnhanceStrength.value}%`;
    schedulePreview();
  });
  el.sBorder.addEventListener('change', () => {
    updateSetting('border', el.sBorder.checked);
    syncImageControls();
    updatePreview();
  });
  el.borderSwatches.addEventListener('click', (event) => {
    const button = event.target.closest('.swatch');
    if (!button) return;
    updateSetting('borderColor', button.dataset.color);
    syncImageControls();
    updatePreview();
  });
  el.sBorderWidth.addEventListener('input', () => {
    updateSetting('borderWidth', Number(el.sBorderWidth.value));
    el.borderWidthOut.textContent = `${Number(el.sBorderWidth.value).toFixed(1).replace('.0', '')}%`;
    schedulePreview();
  });
  el.sOverlay.addEventListener('change', () => {
    updateSetting('overlay', el.sOverlay.checked);
    syncImageControls();
    updatePreview();
  });
  el.sOverlayName.addEventListener('change', () => {
    updateSetting('overlayName', el.sOverlayName.checked);
    schedulePreview();
  });
  el.sOverlayPrice.addEventListener('change', () => {
    updateSetting('overlayPrice', el.sOverlayPrice.checked);
    schedulePreview();
  });
  el.sOverlayPosition.addEventListener('change', () => {
    updateSetting('overlayPosition', el.sOverlayPosition.value);
    updatePreview();
  });
  el.sOverlayScale.addEventListener('input', () => {
    updateSetting('overlayScale', Number(el.sOverlayScale.value));
    el.overlayScaleOut.textContent = `${el.sOverlayScale.value}%`;
    schedulePreview();
  });
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
}

function syncImageControls() {
  const s = state.settings;
  el.sProcess.checked = s.processEnabled;
  el.sEnhance.checked = s.enhance;
  el.sEnhanceStrength.value = String(s.enhanceStrength);
  el.enhanceStrengthOut.textContent = `${s.enhanceStrength}%`;
  el.sBorder.checked = s.border;
  el.sBorderWidth.value = String(s.borderWidth);
  el.borderWidthOut.textContent = `${Number(s.borderWidth).toFixed(1).replace('.0', '')}%`;
  el.sOverlay.checked = s.overlay;
  el.sOverlayName.checked = s.overlayName;
  el.sOverlayPrice.checked = s.overlayPrice;
  el.sOverlayPosition.value = s.overlayPosition;
  el.sOverlayScale.value = String(s.overlayScale);
  el.overlayScaleOut.textContent = `${s.overlayScale}%`;

  for (const swatch of el.borderSwatches.querySelectorAll('.swatch')) {
    swatch.classList.toggle('is-active', swatch.dataset.color.toLowerCase() === String(s.borderColor).toLowerCase());
  }

  el.enhanceRow.hidden = !s.enhance || !s.processEnabled;
  el.borderControls.hidden = !s.border || !s.processEnabled;
  el.overlayControls.hidden = !s.overlay || !s.processEnabled;
  el.processingControls.classList.toggle('is-disabled', !s.processEnabled);
  el.processingControls.querySelectorAll('input, select, button').forEach((input) => {
    input.disabled = !s.processEnabled;
  });
  const item = activeItem();
  el.sSkipItem.disabled = !item || !s.processEnabled;
  el.sSkipItem.checked = Boolean(item?.skipProcessing);
}

function syncSettingsUI() {
  el.sAiAuto.checked = state.settings.aiAuto;
  el.sApiBase.value = state.settings.apiBase;
  el.sApiModel.value = state.settings.apiModel;
  el.sApiKey.value = state.settings.apiKey;
  for (const radio of el.settingsForm.querySelectorAll('input[name="aiMode"]')) {
    radio.checked = radio.value === state.settings.aiMode;
  }
  el.cloudSettings.hidden = state.settings.aiMode !== 'cloud';
  syncImageControls();
}

/* ───────────────────────── Settings dialog ───────────────────────── */

function bindSettings() {
  for (const button of document.querySelectorAll('[data-close-settings]')) {
    button.addEventListener('click', () => el.settingsDialog.close());
  }
  el.settingsDialog.addEventListener('click', (event) => {
    if (event.target === el.settingsDialog) el.settingsDialog.close();
  });
  el.settingsForm.addEventListener('submit', (event) => event.preventDefault());

  for (const radio of el.settingsForm.querySelectorAll('input[name="aiMode"]')) {
    radio.addEventListener('change', () => {
      el.cloudSettings.hidden = radio.value !== 'cloud' || !radio.checked;
    });
  }
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.addEventListener('click', () => {
      const preset = PRESETS[button.dataset.preset];
      if (!preset) return;
      const cloudRadio = el.settingsForm.querySelector('input[name="aiMode"][value="cloud"]');
      if (cloudRadio) cloudRadio.checked = true;
      el.cloudSettings.hidden = false;
      el.sApiBase.value = preset.base;
      el.sApiModel.value = preset.model;
      el.aiTestStatus.textContent = '';
      el.aiTestStatus.className = 'test-status';
    });
  }
  el.btnTestAi.addEventListener('click', testConnection);
  el.btnSaveSettings.addEventListener('click', saveSettingsFromDialog);
  el.btnClearDrafts.addEventListener('click', clearDrafts);
}

function currentDialogSettings() {
  const mode = el.settingsForm.querySelector('input[name="aiMode"]:checked')?.value || 'local';
  return {
    ...state.settings,
    aiMode: mode,
    apiBase: el.sApiBase.value.trim(),
    apiModel: el.sApiModel.value.trim(),
    apiKey: el.sApiKey.value.trim(),
  };
}

function openSettings() {
  syncSettingsUI();
  el.settingsStatus.textContent = '';
  el.aiTestStatus.textContent = '';
  el.aiTestStatus.className = 'test-status';
  el.settingsDialog.showModal();
}

async function testConnection() {
  const candidate = currentDialogSettings();
  if (!candidate.apiBase || !candidate.apiModel) {
    el.aiTestStatus.textContent = 'Add a base URL and model first.';
    el.aiTestStatus.className = 'test-status err';
    return;
  }
  el.btnTestAi.disabled = true;
  el.aiTestStatus.textContent = 'Testing…';
  el.aiTestStatus.className = 'test-status';
  try {
    const reply = await testAiConnection(candidate);
    el.aiTestStatus.textContent = `Connected — “${reply}”`;
    el.aiTestStatus.className = 'test-status ok';
  } catch (error) {
    el.aiTestStatus.textContent = error.message;
    el.aiTestStatus.className = 'test-status err';
  } finally {
    el.btnTestAi.disabled = false;
  }
}

function saveSettingsFromDialog() {
  const candidate = currentDialogSettings();
  if (candidate.aiMode === 'cloud') {
    if (!candidate.apiBase || !candidate.apiModel) {
      el.settingsStatus.textContent = 'Cloud mode needs an API base URL and model name.';
      return;
    }
    try {
      const url = new URL(candidate.apiBase);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      el.settingsStatus.textContent = 'Enter a valid http(s) base URL.';
      return;
    }
  }
  state.settings = {
    ...state.settings,
    ...candidate,
    aiAuto: el.sAiAuto.checked,
  };
  saveSettings();
  syncAiUI();
  syncImageControls();
  el.settingsDialog.close();
  const item = activeItem();
  if (item && state.settings.aiEnabled && state.settings.aiAuto) {
    item.aiState = 'idle';
    maybeAutoSuggest(item);
  }
  updatePreview();
  if (state.mode === 'list') renderPostList();
  toast('Settings saved.', 'success', 2500);
}

function clearDrafts() {
  const ok = window.confirm('Clear all saved draft text from this browser? Photos and the current batch stay as they are.');
  if (!ok) return;
  state.drafts = {};
  try {
    localStorage.removeItem(DRAFTS_KEY);
  } catch {
    /* ignore */
  }
  el.footStatus.textContent = 'Saved drafts cleared';
  toast('Saved draft text cleared.', 'success');
}

/* ───────────────────────── Keyboard / drag & drop ───────────────────────── */

function bindKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (el.settingsDialog.open) return;
    if (state.mode !== 'review') return;
    if (!activeItem()) return;
    if (event.key === 'Escape') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, a, [role="button"]')) return;
    const inTextarea = target.tagName === 'TEXTAREA';
    const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);

    if (event.key === 'Enter') {
      if (inTextarea && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (event.shiftKey) goPrev();
      else goNext();
      return;
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (!inField && event.key.toLowerCase() === 's') {
      event.preventDefault();
      skipCurrent();
    }
  });
}

function bindDragAndDrop() {
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    state.dragDepth++;
    el.dropOverlay.hidden = false;
    el.dropCard.classList.add('is-over');
  });
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) {
      el.dropOverlay.hidden = true;
      el.dropCard.classList.remove('is-over');
    }
  });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    state.dragDepth = 0;
    el.dropOverlay.hidden = true;
    el.dropCard.classList.remove('is-over');
    addFiles(event.dataTransfer.files);
  });
}

/* ───────────────────────── Export ───────────────────────── */

async function exportWorkbook() {
  if (state.exporting) return;
  const eligible = state.items.filter((item) => item.status !== 'skipped');
  if (!eligible.length) {
    toast('Nothing to export — every photo is skipped or the batch is empty.', 'error');
    return;
  }
  if (!window.ExcelJS) {
    toast('The Excel library did not load. Reload the page and try again.', 'error');
    return;
  }

  flushDrafts();
  state.exporting = true;
  syncUI();
  el.busyOverlay.hidden = false;
  el.busyTitle.textContent = 'Preparing your Excel sheet…';
  el.busyDetail.textContent = `0 / ${eligible.length}`;
  el.busyFill.style.width = '0%';
  await sleep(60);

  const rows = [];
  let thumbnailErrors = 0;
  let documentCount = 0;
  try {
    for (let index = 0; index < eligible.length; index++) {
      const item = eligible[index];
      const display = displayName(item);
      const price = parsePrice(item.priceRaw);
      const isDoc = itemIsDocument(item);
      if (isDoc) documentCount++;
      el.busyDetail.textContent = `${index + 1} / ${eligible.length} · ${display.slice(0, 42)}`;
      el.busyFill.style.width = `${(index / eligible.length) * 100}%`;
      await sleep(10);

      let thumb = null;
      try {
        const bitmap = await getBitmap(item);
        thumb = renderProcessed(bitmap, state.settings, {
          maxSize: 480,
          quality: 0.84,
          name: display,
          price,
          applyProcessing: state.settings.processEnabled && !item.skipProcessing,
        });
      } catch (error) {
        console.error(error);
        thumbnailErrors++;
      } finally {
        if (item.id !== state.activeId) releaseBitmap(item);
      }

      rows.push({
        name: display,
        price: price && price > 0 ? price : '',
        condition: isDoc ? '' : conditionLabel(item.condition, true),
        notes: item.notes.trim(),
        filename: item.file.name,
        imageBase64: thumb ? thumb.dataUrl.replace(/^data:image\/[a-z+]+;base64,/, '') : '',
        imageWidth: thumb?.width || 0,
        imageHeight: thumb?.height || 0,
      });
    }

    el.busyTitle.textContent = 'Building workbook…';
    el.busyFill.style.width = '100%';
    el.busyDetail.textContent = `${rows.length} row${rows.length > 1 ? 's' : ''} with embedded thumbnails`;
    await sleep(60);

    const buffer = await buildWorkbookBuffer(window.ExcelJS, rows);
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, exportFilename());
    state.hasExported = true;

    const missingPrices = rows.filter((row) => row.price === '').length;
    const noun = documentCount ? 'item' : 'product';
    let message = `Exported ${rows.length} ${noun}${rows.length > 1 ? 's' : ''} to Excel.`;
    if (missingPrices) message += ` ${missingPrices} without a price.`;
    if (thumbnailErrors) message += ` ${thumbnailErrors} thumbnail${thumbnailErrors > 1 ? 's' : ''} failed.`;
    const skipped = state.items.length - eligible.length;
    if (skipped) message += ` ${skipped} skipped photo${skipped > 1 ? 's were' : ' was'} left out.`;
    if (documentCount) {
      message += ` Includes ${documentCount} personal document${documentCount > 1 ? 's' : ''} — keep the file private.`;
    }
    toast(message, 'success', 7000);
    if (documentCount) {
      toast(
        'Personal document images were included in this workbook. Do not share it publicly or upload it to cloud storage.',
        'error',
        9000
      );
    }
  } catch (error) {
    console.error(error);
    toast(`Export failed: ${error.message}`, 'error', 7000);
  } finally {
    state.exporting = false;
    el.busyOverlay.hidden = true;
    syncUI();
    updateProgress();
  }
}

function exportFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `products-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* ───────────────────────── Utilities ───────────────────────── */

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toast(message, type = 'info', timeout = 4000) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.dataset.id = String(++toastSeq);
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
  const text = document.createElement('span');
  text.textContent = message;
  node.append(icon, text);
  el.toasts.append(node);

  while (el.toasts.children.length > 4) {
    el.toasts.firstElementChild?.remove();
  }
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  }, timeout);
}

function registerServiceWorkerHint() {
  // Helpful console note for anyone opening devtools: this is a static app.
  console.info(
    '%cPhoto Lister%c — files stay in the browser. Cloud AI mode sends only the current downscaled photo.',
    'font-weight:bold;color:#212327',
    'color:inherit'
  );
}
