// CacheService.js — cache logic extracted from api.js

// ── TTL constants ───────────────────────────────────────
export const PRICE_CACHE_TTL = 15 * 60 * 1000;   // 15 min  — quote data
export const FUND_CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 hr  — fundamentals
export const FULL_CACHE_TTL  =  5 * 60 * 1000;   //  5 min  — fetchStockFullData

// ── 5-min "full" cache (quote + history + indicators) ──
export function fullCacheGet(symbol) {
  try {
    const raw = localStorage.getItem(`bon-full-${symbol}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < FULL_CACHE_TTL) return { data, age: Date.now() - ts };
    return null;
  } catch { return null; }
}

export function fullCacheSet(symbol, data) {
  try {
    localStorage.setItem(`bon-full-${symbol}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

// ── 15-min price cache ─────────────────────────────────
export function cacheGet(symbol) {
  try {
    const raw = localStorage.getItem(`bon-cache-${symbol}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < PRICE_CACHE_TTL) return data;
    return null;
  } catch { return null; }
}

export function cacheSet(symbol, data) {
  try {
    localStorage.setItem(`bon-cache-${symbol}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function cacheGetStale(symbol) {
  try {
    const raw = localStorage.getItem(`bon-cache-${symbol}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return { data, ts };
  } catch { return null; }
}

export function fundGet(symbol) {
  try {
    const raw = localStorage.getItem(`bon-fund3-${symbol}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < FUND_CACHE_TTL) return data;
    return null;
  } catch { return null; }
}

export function fundSet(symbol, data) {
  try {
    localStorage.setItem(`bon-fund3-${symbol}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}
