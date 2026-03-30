// Mag7Chart.js — Distance from 52-Week High bar chart for the Magnificent 7

import { yahooChart } from '../services/StockService.js';

const MAG7 = [
  { sym: 'AAPL',  name: 'Apple',     domain: 'apple.com'     },
  { sym: 'MSFT',  name: 'Microsoft', domain: 'microsoft.com' },
  { sym: 'NVDA',  name: 'NVIDIA',    domain: 'nvidia.com'    },
  { sym: 'GOOGL', name: 'Alphabet',  domain: 'abc.xyz'       },
  { sym: 'AMZN',  name: 'Amazon',    domain: 'amazon.com'    },
  { sym: 'META',  name: 'Meta',      domain: 'meta.com'      },
  { sym: 'TSLA',  name: 'Tesla',     domain: 'tesla.com'     },
];

function distColor(pct) {
  // pct = % below 52w high (positive = below)
  if (pct <= 5)  return '#16a34a';   // deep green — near ATH
  if (pct <= 15) return '#22c55e';   // green
  if (pct <= 25) return '#f59e0b';   // amber
  if (pct <= 40) return '#f97316';   // orange
  return '#dc2626';                  // red — far from high
}

async function fetchMag7Data() {
  const results = await Promise.allSettled(
    MAG7.map(async ({ sym, name, domain }) => {
      const raw = await yahooChart(sym, '1d', '1d');
      const meta = raw?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price   = meta.regularMarketPrice ?? null;
      const high52w = meta.fiftyTwoWeekHigh ?? null;
      const low52w  = meta.fiftyTwoWeekLow  ?? null;
      if (price == null || high52w == null) return null;
      const distPct = ((high52w - price) / high52w) * 100;
      return { sym, name, domain, price, high52w, low52w, distPct };
    })
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value != null)
    .map(r => r.value);
}

function buildSkeleton() {
  const wrap = document.createElement('div');
  wrap.className = 'mag7-wrap';
  for (let i = 0; i < 7; i++) {
    const col = document.createElement('div');
    col.className = 'mag7-col mag7-skeleton-col';
    col.innerHTML = `<div class="mag7-bar-area"><div class="mag7-skeleton-bar"></div></div>
                     <div class="mag7-skeleton-logo"></div>
                     <div class="mag7-skeleton-label"></div>`;
    wrap.appendChild(col);
  }
  return wrap;
}

function buildChart(stocks) {
  // Sort ascending: closest to 52W high (best) on the left
  const sorted = [...stocks].sort((a, b) => a.distPct - b.distPct);

  const wrap = document.createElement('div');
  wrap.className = 'mag7-wrap';

  // Normalize gap to the range within this group so differences are dramatic
  const minDist = sorted[0].distPct;
  const maxDist = sorted[sorted.length - 1].distPct;
  const range   = maxDist - minDist || 1;

  sorted.forEach((s, idx) => {
    const color = distColor(s.distPct);

    // Normalized gap: best stock gets ~5% gap, worst gets ~75% gap
    const normalized = (s.distPct - minDist) / range;  // 0 → 1
    const gapFlex    = normalized * 70 + 5;             // 5 → 75
    const barFlex    = 100 - gapFlex;                   // 95 → 25

    const col = document.createElement('div');
    col.className = 'mag7-col';
    col.style.setProperty('--delay', `${idx * 80}ms`);

    col.innerHTML = `
      <div class="mag7-dist-label" style="color:${color}">-${s.distPct.toFixed(1)}%</div>
      <div class="mag7-bar-area">
        <div class="mag7-gap" style="flex:${gapFlex}"></div>
        <div class="mag7-bar" style="flex:${barFlex};background:${color}"></div>
      </div>
      <div class="mag7-logo-wrap">
        <img class="mag7-logo" src="https://logo.clearbit.com/${s.domain}" alt="${s.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="mag7-logo-fallback" style="display:none">${s.sym.slice(0, 2)}</div>
      </div>
      <div class="mag7-sym">${s.sym}</div>
      <div class="mag7-price">$${s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    `;

    wrap.appendChild(col);
  });

  return wrap;
}

export async function loadMag7Chart() {
  const container = document.getElementById('mag7-container');
  if (!container) return;

  container.innerHTML = '';
  container.appendChild(buildSkeleton());

  try {
    const stocks = await fetchMag7Data();
    container.innerHTML = '';
    if (!stocks.length) {
      container.innerHTML = '<p class="mag7-error">Could not load data</p>';
      return;
    }
    container.appendChild(buildChart(stocks));

    // Animate bars in after paint
    requestAnimationFrame(() => {
      container.querySelectorAll('.mag7-col').forEach((col, i) => {
        setTimeout(() => col.classList.add('mag7-animate'), i * 80);
      });
    });
  } catch {
    container.innerHTML = '<p class="mag7-error">Could not load data</p>';
  }
}
