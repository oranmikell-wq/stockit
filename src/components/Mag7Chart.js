// Mag7Chart.js — Distance from 52-Week High, multi-sector toggle

import { yahooChart } from '../services/StockService.js';

// ── Sector definitions ───────────────────────────────────
const SECTORS = [
  {
    key: 'mag7', label: 'Mag 7',
    stocks: [
      { sym: 'AAPL',  name: 'Apple',      domain: 'apple.com'      },
      { sym: 'MSFT',  name: 'Microsoft',  domain: 'microsoft.com'  },
      { sym: 'NVDA',  name: 'NVIDIA',     domain: 'nvidia.com'     },
      { sym: 'GOOGL', name: 'Alphabet',   domain: 'google.com'     },
      { sym: 'AMZN',  name: 'Amazon',     domain: 'amazon.com'     },
      { sym: 'META',  name: 'Meta',       domain: 'meta.com'       },
      { sym: 'TSLA',  name: 'Tesla',      domain: 'tesla.com'      },
      { sym: 'SPY',   name: 'S&P 500',    domain: ''               },
      { sym: 'QQQ',   name: 'Nasdaq 100', domain: ''               },
    ],
  },
  {
    key: 'tech', label: 'Tech',
    stocks: [
      { sym: 'NVDA',  name: 'NVIDIA',     domain: 'nvidia.com'     },
      { sym: 'AMD',   name: 'AMD',        domain: 'amd.com'        },
      { sym: 'INTC',  name: 'Intel',      domain: 'intel.com'      },
      { sym: 'AVGO',  name: 'Broadcom',   domain: 'broadcom.com'   },
      { sym: 'CRM',   name: 'Salesforce', domain: 'salesforce.com' },
      { sym: 'ORCL',  name: 'Oracle',     domain: 'oracle.com'     },
      { sym: 'ADBE',  name: 'Adobe',      domain: 'adobe.com'      },
      { sym: 'NOW',   name: 'ServiceNow', domain: 'servicenow.com' },
    ],
  },
  {
    key: 'finance', label: 'Finance',
    stocks: [
      { sym: 'JPM',   name: 'JPMorgan',     domain: 'jpmorganchase.com' },
      { sym: 'BAC',   name: 'BofA',         domain: 'bankofamerica.com' },
      { sym: 'WFC',   name: 'Wells Fargo',  domain: 'wellsfargo.com'    },
      { sym: 'GS',    name: 'Goldman',      domain: 'goldmansachs.com'  },
      { sym: 'MS',    name: 'Morgan St.',   domain: 'morganstanley.com' },
      { sym: 'V',     name: 'Visa',         domain: 'visa.com'          },
      { sym: 'MA',    name: 'Mastercard',   domain: 'mastercard.com'    },
      { sym: 'PYPL',  name: 'PayPal',       domain: 'paypal.com'        },
    ],
  },
  {
    key: 'health', label: 'Health',
    stocks: [
      { sym: 'UNH',   name: 'UnitedHealth', domain: 'unitedhealthgroup.com' },
      { sym: 'JNJ',   name: 'J&J',          domain: 'jnj.com'              },
      { sym: 'LLY',   name: 'Eli Lilly',    domain: 'lilly.com'            },
      { sym: 'ABBV',  name: 'AbbVie',       domain: 'abbvie.com'           },
      { sym: 'MRK',   name: 'Merck',        domain: 'merck.com'            },
      { sym: 'PFE',   name: 'Pfizer',       domain: 'pfizer.com'           },
      { sym: 'ISRG',  name: 'Intuitive',    domain: 'intuitive.com'        },
    ],
  },
  {
    key: 'energy', label: 'Energy',
    stocks: [
      { sym: 'XOM',   name: 'ExxonMobil',  domain: 'exxonmobil.com'     },
      { sym: 'CVX',   name: 'Chevron',     domain: 'chevron.com'         },
      { sym: 'COP',   name: 'Conoco',      domain: 'conocophillips.com'  },
      { sym: 'SLB',   name: 'SLB',         domain: 'slb.com'             },
      { sym: 'OXY',   name: 'Occidental',  domain: 'oxy.com'             },
      { sym: 'EOG',   name: 'EOG',         domain: 'eogresources.com'    },
      { sym: 'BP',    name: 'BP',          domain: 'bp.com'              },
    ],
  },
  {
    key: 'consumer', label: 'Consumer',
    stocks: [
      { sym: 'WMT',   name: 'Walmart',     domain: 'walmart.com'    },
      { sym: 'COST',  name: 'Costco',      domain: 'costco.com'     },
      { sym: 'MCD',   name: "McDonald's",  domain: 'mcdonalds.com'  },
      { sym: 'SBUX',  name: 'Starbucks',   domain: 'starbucks.com'  },
      { sym: 'NKE',   name: 'Nike',        domain: 'nike.com'       },
      { sym: 'HD',    name: 'Home Depot',  domain: 'homedepot.com'  },
      { sym: 'TGT',   name: 'Target',      domain: 'target.com'     },
      { sym: 'BKNG',  name: 'Booking',     domain: 'booking.com'    },
    ],
  },
  {
    key: 'crypto', label: 'Crypto',
    stocks: [
      { sym: 'COIN',  name: 'Coinbase',    domain: 'coinbase.com'       },
      { sym: 'MSTR',  name: 'MicroStrat.', domain: 'microstrategy.com'  },
      { sym: 'MARA',  name: 'MARA',        domain: ''                   },
      { sym: 'RIOT',  name: 'Riot',        domain: 'riotplatforms.com'  },
      { sym: 'HOOD',  name: 'Robinhood',   domain: 'robinhood.com'      },
      { sym: 'PYPL',  name: 'PayPal',      domain: 'paypal.com'         },
    ],
  },
];

// ── Data fetch ───────────────────────────────────────────
async function fetchStocksData(stockList) {
  const results = await Promise.allSettled(
    stockList.map(async ({ sym, name, domain }) => {
      const raw  = await yahooChart(sym, '1d', '1d');
      const meta = raw?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price   = meta.regularMarketPrice ?? null;
      const high52w = meta.fiftyTwoWeekHigh   ?? null;
      if (price == null || high52w == null) return null;
      const distPct = ((high52w - price) / high52w) * 100;
      return { sym, name, domain, price, high52w, distPct };
    })
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value != null)
    .map(r => r.value);
}

// ── Skeleton ─────────────────────────────────────────────
function buildSkeleton(count = 8) {
  const wrap = document.createElement('div');
  wrap.className = 'mag7-wrap';
  for (let i = 0; i < count; i++) {
    const col = document.createElement('div');
    col.className = 'mag7-col mag7-skeleton-col';
    col.innerHTML = `<div class="mag7-bar-area"><div class="mag7-skeleton-bar"></div></div>
                     <div class="mag7-skeleton-logo"></div>
                     <div class="mag7-skeleton-label"></div>`;
    wrap.appendChild(col);
  }
  return wrap;
}

// ── Chart builder ────────────────────────────────────────
function buildChart(stocks) {
  // Sort descending: furthest from 52W high → tallest bar on the left
  const sorted = [...stocks].sort((a, b) => b.distPct - a.distPct);

  const wrap = document.createElement('div');
  wrap.className = 'mag7-wrap';

  const minDist = sorted[sorted.length - 1].distPct;
  const maxDist = sorted[0].distPct;
  const range   = maxDist - minDist || 1;

  sorted.forEach((s, idx) => {
    const normalized = (s.distPct - minDist) / range;
    const barFlex    = normalized * 70 + 20;   // 20 → 90
    const gapFlex    = 100 - barFlex;

    const color = '#dc2626';

    const logoHtml = s.domain
      ? `<img class="mag7-logo" src="https://www.google.com/s2/favicons?domain=${s.domain}&sz=64" alt="${s.name}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="mag7-logo-fallback" style="display:none">${s.sym.slice(0, 3)}</div>`
      : `<div class="mag7-logo-fallback" style="display:flex">${s.sym.slice(0, 3)}</div>`;

    const col = document.createElement('div');
    col.className = 'mag7-col';
    col.style.setProperty('--delay', `${idx * 60}ms`);
    col.innerHTML = `
      <div class="mag7-dist-label" style="color:${color}">-${s.distPct.toFixed(1)}%</div>
      <div class="mag7-bar-area">
        <div class="mag7-gap" style="flex:${gapFlex}"></div>
        <div class="mag7-bar" style="flex:${barFlex};background:${color}"></div>
      </div>
      <div class="mag7-logo-wrap">${logoHtml}</div>
      <div class="mag7-sym">${s.sym}</div>
      <div class="mag7-price">$${s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`;
    wrap.appendChild(col);
  });

  return wrap;
}

// ── State ────────────────────────────────────────────────
const _cache = {};
let _active  = 'mag7';

async function switchSector(key, container) {
  _active = key;

  container.querySelectorAll('.mag7-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.sector === key)
  );

  const area   = container.querySelector('#mag7-chart-area');
  const sector = SECTORS.find(s => s.key === key);

  const render = (stocks) => {
    area.innerHTML = '';
    area.appendChild(buildChart(stocks));
    requestAnimationFrame(() => {
      area.querySelectorAll('.mag7-col').forEach((col, i) =>
        setTimeout(() => col.classList.add('mag7-animate'), i * 60)
      );
    });
  };

  if (_cache[key]) { render(_cache[key]); return; }

  area.innerHTML = '';
  area.appendChild(buildSkeleton(sector.stocks.length));

  const stocks = await fetchStocksData(sector.stocks);
  _cache[key]  = stocks;

  if (_active !== key) return; // tab switched while loading
  render(stocks);
}

// ── Public entry point ───────────────────────────────────
export async function loadMag7Chart() {
  const container = document.getElementById('mag7-container');
  if (!container) return;

  container.innerHTML = '';

  // Tabs row
  const tabs = document.createElement('div');
  tabs.className = 'mag7-tabs';
  SECTORS.forEach(s => {
    const btn = document.createElement('button');
    btn.className  = 'mag7-tab' + (s.key === _active ? ' active' : '');
    btn.textContent = s.label;
    btn.dataset.sector = s.key;
    btn.addEventListener('click', () => switchSector(s.key, container));
    tabs.appendChild(btn);
  });
  container.appendChild(tabs);

  // Chart area
  const area  = document.createElement('div');
  area.id     = 'mag7-chart-area';
  container.appendChild(area);

  await switchSector(_active, container);
}
