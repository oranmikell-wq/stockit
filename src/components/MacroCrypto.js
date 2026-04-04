// MacroCrypto.js — US Macro (FRED), Crypto Prices (CoinGecko), Upcoming Economic Events (Finnhub)
/* global AbortSignal */

import { t } from '../utils/i18n.js?v=6';

// ── Proxy helpers ──────────────────────────────────────────────────────────
// allorigins works best for FRED CSV (corsproxy blocks CSV on free plan)
async function fetchProxyText(url) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  ];
  for (const proxy of proxies) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(proxy, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res.text();
    } catch { /* try next */ }
  }
  throw new Error('all proxies failed');
}

// ── FRED CSV parser ────────────────────────────────────────────────────────
function parseFredCsv(text) {
  // Format: DATE,VALUE per line, first line is header
  const lines = text.trim().split('\n');
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(',');
    if (!date || !val || val.trim() === '.') continue;
    const v = parseFloat(val.trim());
    if (!isNaN(v)) result.push({ date: date.trim(), value: v });
  }
  return result; // ascending by date
}

// ── Date helpers ───────────────────────────────────────────────────────────
function twoYearsBack() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10).slice(0, 4) + '-01-01';
}

// Days from today to a date string YYYY-MM-DD
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// ── Block 1: US Macro ──────────────────────────────────────────────────────
// NY Fed EFFR (daily rate) + Alpha Vantage CPI monthly (no proxy needed, CORS-enabled)
export async function loadMacroData(containerId = 'macro-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const [effrRes, cpiRes] = await Promise.all([
      fetch('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json'),
      fetch('https://www.alphavantage.co/query?function=CPI&interval=monthly&apikey=demo'),
    ]);

    if (!effrRes.ok || !cpiRes.ok) throw new Error('api_error');

    const effrJson = await effrRes.json();
    const cpiJson  = await cpiRes.json();

    // Fed Funds Rate (effective, daily)
    const fedEntry = effrJson?.refRates?.[0];
    const fedRate  = fedEntry?.percentRate;
    const fedDate  = fedEntry?.effectiveDate; // e.g. "2026-03-21"

    // CPI YoY from monthly index values
    const cpiData = cpiJson?.data ?? [];
    const latest  = cpiData.find(d => d.value !== '.');
    const yearAgo = cpiData.find(d => {
      if (!latest) return false;
      const latestYear = parseInt(latest.date.slice(0,4));
      const latestMon  = latest.date.slice(5,7);
      return d.date.startsWith((latestYear - 1) + '-' + latestMon);
    });

    if (fedRate == null || !latest || !yearAgo) throw new Error('no_data');

    const cpiYoY   = ((parseFloat(latest.value) / parseFloat(yearAgo.value)) - 1) * 100;
    const cpiMonth = new Date(latest.date + 'T00:00:00').toLocaleString('en', { month: 'short', year: 'numeric' });

    const fedColor = fedRate >= 4 ? 'negative' : fedRate <= 2 ? 'positive' : '';
    const cpiColor = cpiYoY  >= 4 ? 'negative' : cpiYoY  <= 2 ? 'positive' : '';

    const fedLabel = fedDate ? new Date(fedDate + 'T00:00:00').toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    container.innerHTML = `
      <div class="macro-item">
        <div>
          <div class="macro-label">${t('macroInterestRate')}</div>
          <div class="macro-sublabel">${t('macroFedFundsRate', { date: fedLabel })}</div>
        </div>
        <div class="macro-value ${fedColor}">${fedRate.toFixed(2)}%</div>
      </div>
      <div class="macro-item">
        <div>
          <div class="macro-label">${t('macroInflation')}</div>
          <div class="macro-sublabel">${t('macroMonthly', { month: cpiMonth })}</div>
        </div>
        <div class="macro-value ${cpiColor}">${cpiYoY.toFixed(1)}%</div>
      </div>`;
  } catch {
    container.innerHTML = `<p class="macro-error">${t('macroError')}</p>`;
  }
}

// ── Block 2: Crypto Prices ─────────────────────────────────────────────────
export async function loadCryptoPrices(containerId = 'crypto-prices-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    const btc = data.bitcoin;
    const eth = data.ethereum;
    if (!btc || !eth) throw new Error('no_data');

    function cryptoCard(name, price, change) {
      const chgClass = change >= 0 ? 'positive' : 'negative';
      const sign     = change >= 0 ? '+' : '';
      return `
        <div class="market-card ${chgClass}">
          <span class="market-name">${name}</span>
          <span class="market-price">$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span class="market-change ${chgClass}">${sign}${change.toFixed(2)}%</span>
        </div>`;
    }

    container.innerHTML = `<div class="market-indices">
      ${cryptoCard('Bitcoin',  btc.usd, btc.usd_24h_change)}
      ${cryptoCard('Ethereum', eth.usd, eth.usd_24h_change)}
    </div>`;

  } catch {
    container.innerHTML = `<p class="macro-error">${t('cryptoPricesError')}</p>`;
  }
}

// ── Block 3: Upcoming Economic Events (calculated schedule) ───────────────
// FOMC 2025-2026 decision dates (publicly announced by the Fed)
const FOMC_DATES = [
  '2025-03-19','2025-05-07','2025-06-18','2025-07-30',
  '2025-09-17','2025-10-29','2025-12-10',
  '2026-01-29','2026-03-19','2026-05-07','2026-06-18',
  '2026-07-30','2026-09-17','2026-10-29','2026-12-10',
];

function firstFridayOfMonth(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function generateEvents(todayStr) {
  const events = [];

  // FOMC rate decisions
  FOMC_DATES.forEach(date => {
    if (date >= todayStr) events.push({ date, nameKey: 'eventFOMC', nameVars: {}, icon: '🏛' });
  });

  // CPI, PPI, NFP for the next 4 months (approximate, mid-month)
  const today = new Date(todayStr + 'T00:00:00');
  for (let i = 0; i <= 3; i++) {
    const base = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const y = base.getFullYear(), m = base.getMonth();

    // CPI: ~15th of the month
    const cpiDate = new Date(y, m, 15).toISOString().slice(0, 10);
    if (cpiDate >= todayStr) {
      const ref = new Date(y, m - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' });
      events.push({ date: cpiDate, nameKey: 'eventCPI', nameVars: { ref }, icon: '📊' });
    }

    // PPI: ~11th of the month
    const ppiDate = new Date(y, m, 11).toISOString().slice(0, 10);
    if (ppiDate >= todayStr) {
      events.push({ date: ppiDate, nameKey: 'eventPPI', nameVars: {}, icon: '🏭' });
    }

    // NFP: first Friday of the month
    const nfpDate = firstFridayOfMonth(y, m);
    if (nfpDate >= todayStr) {
      events.push({ date: nfpDate, nameKey: 'eventNFP', nameVars: {}, icon: '👷' });
    }
  }

  return events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);
}

export function loadUpcomingEvents(containerId = 'events-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const events = generateEvents(todayStr);

  if (!events.length) {
    container.innerHTML = `<p class="macro-error">${t('noUpcomingEvents')}</p>`;
    return;
  }

  const rows = events.map(e => {
    const d     = new Date(e.date + 'T00:00:00');
    const day   = d.getDate();
    const month = d.toLocaleString('en', { month: 'short' });
    const days  = daysUntil(e.date);
    const countdownText  = days === 0 ? t('eventToday') : days === 1 ? t('eventTomorrow') : t('eventInDays', { n: days });
    const countdownClass = days <= 3 ? 'event-countdown soon' : 'event-countdown';
    const eventName = t(e.nameKey, e.nameVars);

    return `
      <div class="event-item">
        <div class="event-date-col">
          <div class="event-day">${day}</div>
          <div class="event-month">${month}</div>
        </div>
        <div class="event-info">
          <div class="event-name">${eventName}</div>
          <div class="${countdownClass}">${countdownText}</div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}
