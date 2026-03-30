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
  const wrap = document.createElement('div');
  wrap.className = 'mag7-wrap';

  // Find max distance for relative scaling of the gap
  const maxDist = Math.max(...stocks.map(s => s.distPct), 1);

  stocks.forEach((s, idx) => {
    const color    = distColor(s.distPct);
    const fillPct  = 100 - s.distPct; // bar height as % of area
    const clampedFill = Math.max(10, Math.min(100, fillPct));

    const col = document.createElement('div');
    col.className = 'mag7-col';
    col.style.setProperty('--delay', `${idx * 80}ms`);

    col.innerHTML = `
      <div class="mag7-dist-label" style="color:${color}">-${s.distPct.toFixed(1)}%</div>
      <div class="mag7-bar-area">
        <div class="mag7-gap" style="flex:${s.distPct};background:repeating-linear-gradient(
          45deg,
          transparent,
          transparent 3px,
          var(--mag7-gap-stripe) 3px,
          var(--mag7-gap-stripe) 5px
        )"></div>
        <div class="mag7-bar" style="flex:${clampedFill};background:${color}" data-fill="${clampedFill}"></div>
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
