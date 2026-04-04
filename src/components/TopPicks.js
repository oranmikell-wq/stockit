// TopPicks.js — S&P 500 daily scan results as a 10-stock table
// Fetches from Cloudflare Worker KV; falls back to local scoring.

import { t } from '../utils/i18n.js?v=6';
import { calcScore } from '../utils/scoring.js';
import { fetchAllData, fetchHistory } from '../services/StockService.js';

const WORKER_URL = 'https://bulltherapy-proxy.oranmikell.workers.dev/top-picks';
const PICKS_KEY  = 'bon-toppicks-v9';        // v9: ath = real 5Y high
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
function getCachedScore(symbol) {
  try {
    const raw = localStorage.getItem(`bon-score-${symbol.toUpperCase()}`);
    if (!raw) return null;
    return JSON.parse(raw);
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
          price: data.price, changePct: data.changePct, high52: data.high52 ?? null, aboveMA200: null });
        return;
      }
      const history = await fetchHistory(sym, '5Y').catch(() => []);
      const scored  = calcScore(data, history ?? [], {});
      if (scored.score == null) return;
      results.push({ symbol: sym, name: data.name ?? sym, score: scored.score, rating: scored.rating,
        price: data.price, changePct: data.changePct, high52: data.high52 ?? null, aboveMA200: null });
    } catch {}
  }));
  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (p == null) return '-';
  return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMarketCap(mcM) {
  // mcM is in millions USD (from Finnhub)
  if (mcM == null || mcM <= 0) return '-';
  if (mcM >= 1_000_000) return '$' + (mcM / 1_000_000).toFixed(2) + 'T';
  if (mcM >= 1_000)     return '$' + (mcM / 1_000).toFixed(1) + 'B';
  return '$' + mcM.toFixed(0) + 'M';
}

function fmtDist(price, high52) {
  if (price == null || high52 == null || high52 === 0) return '-';
  const pct = ((price - high52) / high52) * 100;
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

  const tr = document.createElement('tr');
  tr.dataset.symbol = pick.symbol;
  tr.setAttribute('tabindex', '0');
  tr.innerHTML = `
    <td class="tp-td-sym">
      <span class="tp-sym">${pick.symbol}</span>
      <span class="tp-name">${shortName}</span>
    </td>
    <td class="tp-td-num">${fmtPrice(pick.price)}</td>
    <td class="tp-td-num">${fmtPrice(pick.ath)}</td>
    <td class="tp-td-num ${distCls}">${distTxt}</td>
    <td class="tp-td-num ${chgCls}">${chgTxt}</td>
    <td class="tp-td-num">${fmtMarketCap(pick.marketCap ?? null)}</td>
    <td class="tp-td-center">${maTxt}</td>
    <td class="tp-td-center"><span class="tp-badge ${badgeCls}">${pick.score}</span></td>`;

  const nav = () => { if (typeof window.navigateTo === 'function') window.navigateTo('results', pick.symbol); };
  tr.addEventListener('click', nav);
  tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(); } });
  return tr;
}

// ── Main render ───────────────────────────────────────────────────────────────
export async function renderTopPicks(container) {
  if (!container) return;

  const isRtl = document.documentElement.dir === 'rtl' || document.documentElement.lang === 'he';

  container.innerHTML = `
    <div class="sidebar-card tp-card">
      <h2 class="section-title card-title">${t('topPicksTitle')}</h2>
      <div class="tp-table-wrap">
        <table class="tp-table">
          <thead>
            <tr>
              <th class="tp-th-sym">${t('tpColStock')}</th>
              <th>${t('tpColPrice')}</th>
              <th>${t('tpColHigh52')}</th>
              <th>${t('tpColDist')}</th>
              <th>${t('tpColChange')}</th>
              <th>${t('tpColMarketCap')}</th>
              <th class="tp-th-center">${t('tpColMa200')}</th>
              <th class="tp-th-center">${t('tpColScore')}</th>
            </tr>
          </thead>
          <tbody id="tp-tbody">
            ${[...Array(10)].map(() => `
              <tr class="tp-skel-row">
                <td colspan="8"><div class="tp-skel-line"></div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="tp-disclaimer">${t('topPicksDisclaimer')}</p>
    </div>`;

  const tbody = container.querySelector('#tp-tbody');

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

    if (!picks?.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="tp-no-data">${t('noData')}</td></tr>`;
      return;
    }

    // Render rows immediately (no earnings yet)
    tbody.innerHTML = '';
    const rowMap = {};
    picks.forEach(pick => {
      const tr = renderRow(pick);
      rowMap[pick.symbol] = tr;
      tbody.appendChild(tr);
    });


  } catch {
    tbody.innerHTML = `<tr><td colspan="8" class="tp-no-data">${t('noData')}</td></tr>`;
  }
}
