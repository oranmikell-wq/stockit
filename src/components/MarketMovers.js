// MarketMovers.js — Market Status, Commodities, Sectors, Gainers/Losers

import { fetchIndexQuote, fetchProxy } from '../services/StockService.js';
import { t } from '../utils/i18n.js?v=6';

// ── 1. Market Status (calculated from ET clock, no API) ──────────────────
export function renderMarketStatus() {
  const dot   = document.getElementById('market-status-dot');
  const label = document.getElementById('market-status-label');
  if (!dot || !label) return;

  const now  = new Date();
  const et   = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = et.getDay();   // 0=Sun 6=Sat
  const mins = et.getHours() * 60 + et.getMinutes();

  let open = false;
  let text = t('marketClosed');

  if (day === 0 || day === 6) {
    text = t('marketClosedWeekend');
  } else if (mins >= 570 && mins < 960) {   // 9:30–16:00
    open = true;
    text = t('marketOpen');
  } else if (mins >= 240 && mins < 570) {   // 04:00–9:30 pre-market
    const left = 570 - mins;
    text = t('marketPreMarket', { h: Math.floor(left / 60), m: left % 60 });
  } else {
    text = t('marketAfterHours');
  }

  dot.className   = `market-status-dot ${open ? 'open' : 'closed'}`;
  label.textContent = text;
}

// ── 2. DXY (called by loadMarketIndices in main.js) ─────────────────────
export async function loadDXY() {
  const card    = document.getElementById('idx-dxy');
  if (!card) return;
  const priceEl  = card.querySelector('.market-price');
  const changeEl = card.querySelector('.market-change');
  try {
    const q = await fetchIndexQuote('DX-Y.NYB');
    if (q?.price != null) {
      priceEl.textContent  = q.price.toFixed(2);
      const sign = (q.changePct ?? 0) >= 0 ? '+' : '';
      changeEl.textContent = q.changePct != null ? `${sign}${q.changePct.toFixed(2)}%` : '--';
      const cls = (q.changePct ?? 0) >= 0 ? 'positive' : 'negative';
      changeEl.className = `market-change ${cls}`;
    }
  } catch { /* keep -- */ }
}

// ── 3. Commodities — Gold & Oil ──────────────────────────────────────────
const COMMODITIES = [
  { sym: 'GC=F', name: 'Gold'     },
  { sym: 'CL=F', name: 'Oil (WTI)' },
];

export async function loadCommodities() {
  const container = document.getElementById('commodities-container');
  if (!container) return;

  const results = await Promise.all(COMMODITIES.map(async ({ sym, name }) => {
    try {
      const q = await fetchIndexQuote(sym);
      return { name, price: q?.price ?? null, pct: q?.changePct ?? null };
    } catch { return { name, price: null, pct: null }; }
  }));

  container.innerHTML = results.map(({ name, price, pct }) => {
    const cls   = pct == null ? '' : pct >= 0 ? 'positive' : 'negative';
    const sign  = pct != null && pct >= 0 ? '+' : '';
    const pStr  = price != null ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '--';
    const cStr  = pct  != null ? `${sign}${pct.toFixed(2)}%` : '--';
    return `<div class="market-card ${cls}">
      <span class="market-name">${name}</span>
      <div class="market-values">
        <span class="market-price">${pStr}</span>
        <span class="market-change ${cls}">${cStr}</span>
      </div>
    </div>`;
  }).join('');
}

// ── 4. Sector Performance — SPDR ETFs ────────────────────────────────────
const SECTORS = [
  { sym: 'XLK',  nameKey: 'sectorNameTechnology'  },
  { sym: 'XLF',  nameKey: 'sectorNameFinancials'   },
  { sym: 'XLE',  nameKey: 'sectorNameEnergy'       },
  { sym: 'XLV',  nameKey: 'sectorNameHealthCare'   },
  { sym: 'XLY',  nameKey: 'sectorNameConsumerDisc' },
  { sym: 'XLI',  nameKey: 'sectorNameIndustrials'  },
  { sym: 'XLC',  nameKey: 'sectorNameCommServices' },
  { sym: 'XLRE', nameKey: 'sectorNameRealEstate'   },
  { sym: 'XLB',  nameKey: 'sectorNameMaterials'    },
  { sym: 'XLU',  nameKey: 'sectorNameUtilities'    },
];

export async function loadSectorPerformance() {
  const container = document.getElementById('sector-container');
  if (!container) return;

  const results = await Promise.all(SECTORS.map(async ({ sym, nameKey }) => {
    const name = t(nameKey);
    try {
      const q = await fetchIndexQuote(sym);
      return { name, pct: q?.changePct ?? null };
    } catch { return { name, pct: null }; }
  }));

  results.sort((a, b) => (b.pct ?? -99) - (a.pct ?? -99));
  const maxAbs = Math.max(...results.filter(r => r.pct != null).map(r => Math.abs(r.pct)), 1);

  container.innerHTML = results.map(({ name, pct }) => {
    const cls  = pct == null ? '' : pct >= 0 ? 'positive' : 'negative';
    const sign = pct != null && pct >= 0 ? '+' : '';
    const str  = pct != null ? `${sign}${pct.toFixed(2)}%` : '--';
    const w    = pct != null ? (Math.abs(pct) / maxAbs * 100).toFixed(1) : 0;
    return `<div class="sector-row">
      <span class="sector-name">${name}</span>
      <div class="sector-bar-wrap">
        <div class="sector-bar ${cls}" style="width:${w}%"></div>
      </div>
      <span class="sector-pct ${cls}">${str}</span>
    </div>`;
  }).join('');
}

// ── 5. Gainers & Losers — derived from curated S&P 500 quote batch ────────
const MOVER_UNIVERSE = [
  ['AAPL','Apple'],['MSFT','Microsoft'],['NVDA','NVIDIA'],['GOOGL','Alphabet'],
  ['AMZN','Amazon'],['META','Meta'],['TSLA','Tesla'],['AVGO','Broadcom'],
  ['JPM','JPMorgan'],['V','Visa'],['UNH','UnitedHealth'],['LLY','Eli Lilly'],
  ['XOM','ExxonMobil'],['COST','Costco'],['HD','Home Depot'],['JNJ','Johnson & Johnson'],
  ['BAC','Bank of America'],['NFLX','Netflix'],['AMD','AMD'],['GS','Goldman Sachs'],
];

async function fetchMoverQuotes() {
  const results = await Promise.allSettled(
    MOVER_UNIVERSE.map(async ([sym, fallbackName]) => {
      const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d&includePrePost=false`;
      const data = await fetchProxy(url);
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;
      const price = meta.regularMarketPrice;
      const prev  = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const changePct = (prev && prev !== 0) ? ((price - prev) / prev) * 100 : null;
      return {
        symbol:  sym,
        shortName: meta.longName ?? meta.shortName ?? fallbackName,
        regularMarketPrice: price,
        regularMarketChangePercent: changePct,
      };
    })
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value?.regularMarketChangePercent != null)
    .map(r => r.value);
}

function renderMoverList(list, el) {
  if (!list.length) {
    el.innerHTML = `<p class="macro-error">${t('moversDataUnavailable')}</p>`;
    return;
  }
  el.innerHTML = list.map(q => {
    const pct   = q.regularMarketChangePercent ?? 0;
    const cls   = pct >= 0 ? 'positive' : 'negative';
    const sign  = pct >= 0 ? '+' : '';
    const price = (q.regularMarketPrice ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `<div class="mover-row" role="button" tabindex="0" onclick="window.navigateTo && navigateTo('results', '${q.symbol}')" title="View ${q.symbol}">
      <div class="mover-left">
        <span class="mover-sym">${q.symbol}</span>
        <span class="mover-name">${q.shortName ?? ''}</span>
      </div>
      <div class="mover-right">
        <span class="mover-price">$${price}</span>
        <span class="mover-pct ${cls}">${sign}${pct.toFixed(2)}%</span>
      </div>
    </div>`;
  }).join('');
}

export async function loadMovers() {
  const gEl = document.getElementById('gainers-container');
  const lEl = document.getElementById('losers-container');
  if (!gEl && !lEl) return;

  // Tab switching (wired up immediately so tabs work even before data loads)
  const tEl = document.getElementById('trending-container');
  document.querySelectorAll('.movers-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.movers-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      gEl?.classList.toggle('hidden', tab !== 'gainers');
      lEl?.classList.toggle('hidden', tab !== 'losers');
      tEl?.classList.toggle('hidden', tab !== 'trending');
    });
  });

  const quotes = await fetchMoverQuotes();
  if (!quotes.length) {
    if (gEl) renderMoverList([], gEl);
    if (lEl) renderMoverList([], lEl);
    return;
  }

  const sorted  = [...quotes].sort((a, b) => (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0));
  const gainers = sorted.slice(0, 5);
  const losers  = [...quotes].sort((a, b) => (a.regularMarketChangePercent ?? 0) - (b.regularMarketChangePercent ?? 0)).slice(0, 5);

  if (gEl) renderMoverList(gainers, gEl);
  if (lEl) renderMoverList(losers,  lEl);
}
