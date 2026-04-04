// TopPicks.js — S&P 500 daily scan results as a 10-stock table
// Fetches from Cloudflare Worker KV; falls back to local scoring.
// Includes a WATCHLIST tab that replaces the separate home watchlist block.

import { t } from '../utils/i18n.js?v=6';
import { calcScore } from '../utils/scoring.js';
import { fetchAllData, fetchHistory } from '../services/StockService.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from './Watchlist.js';

const WORKER_URL = 'https://bulltherapy-proxy.oranmikell.workers.dev/top-picks';
const PICKS_KEY  = 'bon-toppicks-v10';       // v10: full indicators in Worker
const PICKS_TTL  = 4 * 60 * 60 * 1000;      // 4 hours

const FALLBACK_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META',
  'JPM','V','GS','JNJ','UNH',
];

// ── Local cache ───────────────────────────────────────────────────────────────
function picksFromCache() {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    if (!raw) return null;
    const { picks, ts } = JSON.parse(raw);
    if (Date.now() - ts < PICKS_TTL) return picks;
    return null;
  } catch { return null; }
}
function picksToCache(picks) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify({ picks, ts: Date.now() })); } catch {}
}

// ── Worker fetch ──────────────────────────────────────────────────────────────
async function fetchWorkerPicks() {
  const res = await fetch(WORKER_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.picks?.length) throw new Error('No picks in response');
  return json.picks.slice(0, 10);
}

// ── Local fallback ────────────────────────────────────────────────────────────
const SCORE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedScore(symbol) {
  try {
    const raw = localStorage.getItem(`bon-score-${symbol.toUpperCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.ts && Date.now() - parsed.ts > SCORE_TTL) return null;
    return parsed;
  } catch { return null; }
}

async function localFallback() {
  const results = [];
  await Promise.allSettled(FALLBACK_UNIVERSE.map(async sym => {
    try {
      const cached = getCachedScore(sym);
      const { data } = await fetchAllData(sym, true);
      if (!data) return;
      if (cached) {
        results.push({ symbol: sym, name: data.name ?? sym, score: cached.score, rating: cached.rating,
          price: data.price, changePct: data.changePct, ath: data.high52w ?? null, aboveMA200: null });
        return;
      }
      const history = await fetchHistory(sym, '5Y').catch(() => []);
      const scored  = calcScore(data, history ?? [], {});
      if (scored.score == null) return;
      results.push({ symbol: sym, name: data.name ?? sym, score: scored.score, rating: scored.rating,
        price: data.price, changePct: data.changePct, ath: data.high52w ?? null, aboveMA200: null });
    } catch {}
  }));
  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

// ── Mag 7 picks ───────────────────────────────────────────────────────────────
const MAG7 = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA'];
let _mag7Cache = null;

async function loadMag7Picks() {
  if (_mag7Cache) return _mag7Cache;
  const results = [];
  await Promise.allSettled(MAG7.map(async sym => {
    try {
      const { data } = await fetchAllData(sym, true);
      const cached   = getCachedScore(sym);
      results.push({
        symbol:    sym,
        name:      data?.name ?? sym,
        score:     cached?.score ?? null,
        rating:    cached?.rating ?? 'wait',
        price:     data?.price    ?? null,
        changePct: data?.changePct ?? null,
        ath:       data?.high52w  ?? null,
        marketCap: data?.marketCap ?? null,
        aboveMA200: null,
      });
    } catch {}
  }));
  // Keep original MAG7 order
  _mag7Cache = MAG7.map(sym => results.find(r => r.symbol === sym)).filter(Boolean);
  return _mag7Cache;
}

// ── Watchlist picks ───────────────────────────────────────────────────────────
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('bon-watchlist') || '[]'); }
  catch { return []; }
}

let _wlPicksCache = null; // session cache — cleared on watchlist change

async function loadWatchlistPicks() {
  if (_wlPicksCache) return _wlPicksCache;
  const list = getWatchlist();
  if (!list.length) return [];
  const results = [];
  await Promise.allSettled(list.map(async item => {
    try {
      const { data } = await fetchAllData(item.symbol, true);
      const cached   = getCachedScore(item.symbol);
      results.push({
        symbol:    item.symbol,
        name:      data?.name ?? item.name ?? item.symbol,
        score:     cached?.score ?? null,
        rating:    cached?.rating ?? item.rating ?? 'wait',
        price:     data?.price    ?? null,
        changePct: data?.changePct ?? null,
        ath:       data?.high52w  ?? null,
        marketCap: data?.marketCap ?? null,
        aboveMA200: null,
      });
    } catch {}
  }));
  _wlPicksCache = results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return _wlPicksCache;
}

// Clear session cache whenever watchlist changes (called from main.js)
export function clearWatchlistPicksCache() { _wlPicksCache = null; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (p == null) return '-';
  return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMarketCap(mc) {
  if (mc == null || mc <= 0) return '-';
  // API returns raw dollars (e.g. 3_761_000_000_000 for AAPL)
  if (mc >= 1e12) return '$' + (mc / 1e12).toFixed(2) + 'T';
  if (mc >= 1e9)  return '$' + (mc / 1e9).toFixed(1) + 'B';
  if (mc >= 1e6)  return '$' + (mc / 1e6).toFixed(0) + 'M';
  return '$' + mc.toFixed(0);
}

function fmtDist(price, ath) {
  if (price == null || ath == null || ath === 0) return '-';
  const pct = ((price - ath) / ath) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

// ── Render single row ─────────────────────────────────────────────────────────
function renderRow(pick) {
  const badgeCls = pick.rating === 'buy' ? 'tp-badge-buy'
                 : pick.rating === 'sell' ? 'tp-badge-sell' : 'tp-badge-wait';

  const chgVal = pick.changePct;
  const chgTxt = chgVal != null ? (chgVal >= 0 ? '+' : '') + chgVal.toFixed(2) + '%' : '-';
  const chgCls = chgVal != null ? (chgVal >= 0 ? 'tp-chg-up' : 'tp-chg-down') : '';

  const distTxt = fmtDist(pick.price, pick.ath);
  const distCls = pick.price != null && pick.ath != null
    ? (pick.price >= pick.ath ? 'tp-chg-up' : 'tp-chg-down') : '';

  const maTxt = pick.aboveMA200 === true  ? '<span class="tp-ma-yes">✓</span>'
              : pick.aboveMA200 === false ? '<span class="tp-ma-no">✗</span>'
              :                            '<span class="tp-ma-na">-</span>';

  const shortName = pick.name?.length > 22
    ? pick.name.slice(0, 20) + '…' : (pick.name ?? pick.symbol);

  const scoreTxt = pick.score != null ? pick.score : '-';
  const inWL     = isInWatchlist(pick.symbol);

  const tr = document.createElement('tr');
  tr.dataset.symbol = pick.symbol;
  tr.setAttribute('tabindex', '0');
  tr.innerHTML = `
    <td class="tp-td-sym">
      <span class="tp-sym">${pick.symbol}</span>
      <span class="tp-name">${shortName}</span>
    </td>
    <td class="tp-td-center tp-td-star">
      <button class="tp-star-btn${inWL ? ' active' : ''}" title="${inWL ? 'Remove from watchlist' : 'Add to watchlist'}">★</button>
    </td>
    <td class="tp-td-num">${fmtPrice(pick.price)}</td>
    <td class="tp-td-num">${fmtPrice(pick.ath)}</td>
    <td class="tp-td-num ${distCls}">${distTxt}</td>
    <td class="tp-td-num ${chgCls}">${chgTxt}</td>
    <td class="tp-td-num">${fmtMarketCap(pick.marketCap ?? null)}</td>
    <td class="tp-td-center">${maTxt}</td>
    <td class="tp-td-center"><span class="tp-badge ${badgeCls}">${scoreTxt}</span></td>`;

  // Star / watchlist toggle
  const starBtn = tr.querySelector('.tp-star-btn');
  starBtn.addEventListener('click', e => {
    e.stopPropagation();
    const nowIn = isInWatchlist(pick.symbol);
    if (nowIn) removeFromWatchlist(pick.symbol);
    else        addToWatchlist(pick.symbol, pick.name, pick.rating ?? 'wait');
    const after = isInWatchlist(pick.symbol);
    starBtn.classList.toggle('active', after);
    starBtn.title = after ? 'Remove from watchlist' : 'Add to watchlist';
    _wlPicksCache = null; // force watchlist tab to refresh
  });

  const nav = () => { if (typeof window.navigateTo === 'function') window.navigateTo('results', pick.symbol); };
  tr.addEventListener('click', nav);
  tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(); } });
  return tr;
}

// ── Fill tbody with picks or skeleton ─────────────────────────────────────────
function showSkeleton(tbody) {
  tbody.innerHTML = [...Array(5)].map(() => `
    <tr class="tp-skel-row">
      <td colspan="9"><div class="tp-skel-line"></div></td>
    </tr>`).join('');
}

function fillTbody(picks, tbody) {
  if (!picks?.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="tp-no-data">${t('noData')}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  picks.forEach(pick => tbody.appendChild(renderRow(pick)));
}

// ── Main render ───────────────────────────────────────────────────────────────
export async function renderTopPicks(container) {
  if (!container) return;

  // Hide the separate home-watchlist-section — it's replaced by the toggle
  const hwl = document.getElementById('home-watchlist-section');
  if (hwl) hwl.style.display = 'none';

  container.innerHTML = `
    <div class="sidebar-card tp-card">
      <div class="tp-toggle">
        <button class="tp-toggle-btn active" data-tab="picks">Top Picks</button>
        <button class="tp-toggle-btn" data-tab="mag7">Mag 7</button>
        <button class="tp-toggle-btn" data-tab="watchlist">Watchlist</button>
      </div>
      <div class="tp-table-wrap">
        <table class="tp-table">
          <thead>
            <tr>
              <th class="tp-th-sym">${t('tpColStock')}</th>
              <th class="tp-th-center tp-th-star">★</th>
              <th class="tp-th-num">${t('tpColPrice')}</th>
              <th class="tp-th-num">${t('tpColHigh52')}</th>
              <th class="tp-th-num">${t('tpColDist')}</th>
              <th class="tp-th-num">${t('tpColChange')}</th>
              <th class="tp-th-num">${t('tpColMarketCap')}</th>
              <th class="tp-th-center">${t('tpColMa200')}</th>
              <th class="tp-th-center">${t('tpColScore')}</th>
            </tr>
          </thead>
          <tbody id="tp-tbody">
            ${[...Array(10)].map(() => `
              <tr class="tp-skel-row">
                <td colspan="9"><div class="tp-skel-line"></div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="tp-disclaimer">${t('topPicksDisclaimer')}</p>
    </div>`;

  const tbody    = container.querySelector('#tp-tbody');
  const btnPicks = container.querySelector('[data-tab="picks"]');
  const btnMag7  = container.querySelector('[data-tab="mag7"]');
  const btnWl    = container.querySelector('[data-tab="watchlist"]');
  const allBtns  = [btnPicks, btnMag7, btnWl];
  const setActive = btn => allBtns.forEach(b => b.classList.toggle('active', b === btn));

  let topPicksData = null; // cache for this render

  // ── Load Top Picks ────────────────────────────────────────────────────────
  try {
    let picks = picksFromCache();
    if (!picks) {
      try {
        picks = await fetchWorkerPicks();
        if (picks?.length) picksToCache(picks);
      } catch (e) {
        console.warn('[TopPicks] Worker unavailable, local fallback:', e.message);
        picks = await localFallback();
        if (picks?.length) picksToCache(picks);
      }
    }
    // Override Worker score with locally-computed score when available.
    // The results page writes bon-score-{SYM} after a full calcScore() run
    // which uses more data sources than the Worker (FMP + Yahoo + Finnhub).
    picks = picks?.map(p => {
      const local = getCachedScore(p.symbol);
      if (local?.score != null) return { ...p, score: local.score, rating: local.rating };
      return p;
    });
    topPicksData = picks;
    fillTbody(picks, tbody);
  } catch {
    tbody.innerHTML = `<tr><td colspan="9" class="tp-no-data">${t('noData')}</td></tr>`;
  }

  // ── Toggle logic ──────────────────────────────────────────────────────────
  btnPicks.addEventListener('click', () => {
    if (btnPicks.classList.contains('active')) return;
    setActive(btnPicks);
    fillTbody(topPicksData, tbody);
  });

  btnMag7.addEventListener('click', async () => {
    if (btnMag7.classList.contains('active')) return;
    setActive(btnMag7);
    showSkeleton(tbody);
    const mag7Picks = await loadMag7Picks();
    fillTbody(mag7Picks, tbody);
  });

  btnWl.addEventListener('click', async () => {
    if (btnWl.classList.contains('active')) return;
    setActive(btnWl);
    const wl = getWatchlist();
    if (!wl.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="tp-no-data">★ ${t('watchlistEmpty')}</td></tr>`;
      return;
    }
    showSkeleton(tbody);
    const wlPicks = await loadWatchlistPicks();
    fillTbody(wlPicks, tbody);
  });
}
