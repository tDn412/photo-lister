// Optional cloud AI: any OpenAI-compatible vision endpoint (OpenAI, OpenRouter,
// local Ollama, etc.). The app works fully without this.

import { conditionLabel, parsePrice } from './parse.js';

const SYSTEM_PROMPT = `You help a Vietnamese second-hand seller create a product listing.
Analyze the product photo (and the filename as a hint). Return ONLY a compact JSON object with exactly these keys:
{"name": string, "price": integer, "confidence": number}

Rules:
- name: a natural marketplace title in Vietnamese or brand-model English, 5-80 characters. Include the type, brand, model and only specs that are visible or clearly stated in the filename. Do not invent storage, color or accessories. No emojis, no sales words, no surrounding quotes.
- price: a realistic current resale price in Vietnamese dong (VND) as an integer, no dots and no currency symbol. Base it on typical Facebook Marketplace / Cho Tot prices in Vietnam in 2026 for the given condition. It is a second-hand item.
- confidence: number from 0 to 1.
If the product is unclear, use a conservative generic name and a conservative price.`;

function normalizeBase(base) {
  const trimmed = String(base || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Add an API base URL in Settings.');
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('The API base URL is not valid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('The API base URL must start with http:// or https://');
  }
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parseJsonReply(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('The AI returned an empty response.');
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw new Error('The AI response was not valid JSON. Try again or use local estimates.');
}

async function postChat(settings, body, timeoutMs = 60_000) {
  const endpoint = normalizeBase(settings.apiBase);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: settings.apiModel, temperature: 0.2, max_tokens: 300, ...body }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 240);
      } catch {
        /* ignore */
      }
      const hint =
        response.status === 401
          ? 'Check your API key.'
          : response.status === 404
            ? 'Check the base URL and model name.'
            : response.status === 429
              ? 'Rate limit reached. Try again shortly.'
              : '';
      throw new Error(`AI request failed (${response.status}). ${hint} ${detail}`.trim());
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('The AI request timed out. Try again or use local estimates.');
    if (error instanceof TypeError) {
      throw new Error('Could not reach the AI endpoint. Check the URL, CORS settings, and your connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ask a vision model for a name and price.
 * @param {{imageDataUrl: string, filename: string, condition: string, hint?: string, settings: object}} input
 */
export async function requestAiSuggestion({ imageDataUrl, filename, condition, hint = '', settings }) {
  if (!settings?.apiBase) throw new Error('AI is not configured. Open Settings first.');
  if (!settings?.apiModel) throw new Error('Add a model name in Settings.');
  if (!imageDataUrl) throw new Error('The photo is not ready yet. Try again in a moment.');

  const userText = [
    `Filename: ${filename || 'unknown'}`,
    `Condition: ${conditionLabel(condition)}`,
    hint ? `Local heuristic guess: ${hint}` : '',
    'Return the JSON object now.',
  ]
    .filter(Boolean)
    .join('\n');

  const data = await postChat(settings, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  const text = extractText(data?.choices?.[0]?.message?.content);
  const parsed = parseJsonReply(text);
  const name = String(parsed.name || '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  let price = null;
  if (typeof parsed.price === 'number') {
    price = Number.isFinite(parsed.price) ? Math.round(parsed.price) : null;
  } else if (parsed.price !== undefined && parsed.price !== null) {
    price = parsePrice(String(parsed.price));
  }
  if (price !== null && (price <= 0 || price > 1e12)) price = null;
  if (!name && price === null) throw new Error('The AI could not identify this product.');

  const confidence =
    typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

  return {
    name: name || '',
    price,
    range: price ? { min: Math.round((price * 0.88) / 1000) * 1000, max: Math.round((price * 1.15) / 1000) * 1000 } : null,
    source: 'ai',
    confidence,
    note: `Cloud vision · ${settings.apiModel}`,
  };
}

/** Cheap text-only round trip to verify credentials and reachability. */
export async function testAiConnection(settings) {
  if (!settings?.apiBase || !settings?.apiModel) {
    throw new Error('Add a base URL and model name first.');
  }
  const data = await postChat(
    settings,
    {
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
    },
    30_000
  );
  const text = extractText(data?.choices?.[0]?.message?.content).trim();
  if (!text) throw new Error('The endpoint replied, but no text was returned. Is it OpenAI-compatible?');
  return text.slice(0, 80);
}
