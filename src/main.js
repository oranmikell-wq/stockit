// main.js — entry point, orchestrates all modules

import { applyTranslations, toggleLang, t } from './utils/i18n.js?v=5';
import { fetchAllData, fetchHistory, fetchStockFullData, fetchIndexQuote, fetchProxy, fetchProxyRaw } from './services/StockService.js';
import { calcScore } from './utils/scoring.js';
import { renderSummaryGauge } from './components/SummaryGauge.js';

import { renderCriteriaTable } from './components/CriteriaTable.js';
import { renderStrategyChecklist, countNewHighs } from './components/StrategyChecklist.js';
import { renderAnalysisTables } from './components/AnalysisTables.js';
import { renderNews, renderAIInsight } from './components/NewsRenderer.js';
import { loadFearGreed, loadCryptoFearGreed } from './components/FearGreedGauge.js?v=2';
import { loadTrending, renderTrendingList }   from './components/TrendingList.js';
import { renderTopPicks } from './components/TopPicks.js';
import { loadAAII }      from './components/AAIISentiment.js';
import { loadMacroData, loadCryptoPrices, loadUpcomingEvents } from './components/MacroCrypto.js?v=7';
import { renderMarketStatus, loadDXY, loadCommodities, loadSectorPerformance, loadMovers } from './components/MarketMovers.js?v=1';
import { loadMag7Chart } from './components/Mag7Chart.js';
import { initInfoButtons } from './components/InfoPopup.js';
import { renderCompanyCard } from './components/CompanyCard.js';
import { showAutocomplete, hideAutocomplete, selectAutocomplete, confirmAutocomplete, showRecentSearches, initAutocomplete } from './components/Autocomplete.js';
import { initChart, loadChart, updateChartTheme } from './components/Chart.js';
import {
  getWatchlist, saveWatchlist, isInWatchlist,
  addToWatchlist, removeFromWatchlist as _removeFromWatchlist,
  toggleWatchlist as _toggleWatchlist,
  updateWatchlistBtn, checkWatchlistAlerts,
  renderWatchlist as _renderWatchlist,
} from './components/Watchlist.js';

import {
  initWatchlistSidebar, openWatchlistSidebar, closeWatchlistSidebar,
  renderWatchlistSidebar, updateSidebarCount,
} from './components/WatchlistSidebar.js';

import { applyTheme, toggleTheme as _toggleTheme } from './hooks/useTheme.js';
import { navigateTo as _navigateTo, getCurrentPage } from './hooks/useNavigation.js';
import { getHistory, saveSearchHistory, renderHistory as _renderHistory, removeHistory as _removeHistory } from './hooks/useHistory.js';
import { formatMarketCap } from './utils/formatters.js';

// ── App State ───────────────────────────────────────────
let currentStock = null;
let autoRefreshTimer = null;
let activeLoadSymbol = null; // tracks the latest requested symbol to cancel stale loads
let activeLoadId = 0;       // increments on every search; async ops check this before writing DOM
let lastFullStockData  = null;   // stored for lang-change re-render
let lastSummaryScored  = null;   // stored for lang-change re-render

// ── Notification ───────────────────────────────────────
let notifTimer = null;
function showNotification(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Bound callbacks ─────────────────────────────────────
// These wrap the hook/component functions with the app's local callbacks injected

function renderWatchlist() {
  _renderWatchlist(navigateTo, showNotification);
  renderHomeWatchlist();
}

function renderHomeWatchlist() {
  const section = document.getElementById('home-watchlist-section');
  const list    = document.getElementById('home-watchlist-list');
  if (!section || !list) return;
  const items = getWatchlist();
  if (!items.length) { section.style.display = 'none'; return; }
  section.style.display = '';

  // Render chips immediately with placeholder change
  list.innerHTML = items.map(item => {
    const ratingKey = item.rating === 'buy' ? 'buy' : item.rating === 'wait' ? 'wait' : 'sell';
    const badgeCls  = item.rating === 'buy' ? 'badge-buy-bg' : item.rating === 'wait' ? 'badge-wait-bg' : 'badge-sell-bg';
    return `
      <div class="hwl-item" data-symbol="${item.symbol}">
        <div class="hwl-left">
          <span class="hwl-symbol">${item.symbol}</span>
          <span class="hwl-name">${item.name || ''}</span>
        </div>
        <div class="hwl-right">
          <span class="hwl-price" id="hwl-price-${item.symbol}"></span>
          <span class="hwl-change hwl-change--loading" id="hwl-change-${item.symbol}">…</span>
          <span class="wl-badge ${badgeCls}">${t(ratingKey)}</span>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.hwl-item').forEach(el => {
    el.addEventListener('click', () => navigateTo('results', el.dataset.symbol));
  });

  // Async: fetch price + change % for each item
  items.forEach(async item => {
    try {
      const quote = await fetchIndexQuote(item.symbol);
      const priceEl  = document.getElementById(`hwl-price-${item.symbol}`);
      const changeEl = document.getElementById(`hwl-change-${item.symbol}`);
      if (quote?.price != null && priceEl) {
        priceEl.textContent = `$${Number(quote.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      }
      if (!changeEl || quote?.changePct == null) { if (changeEl) changeEl.textContent = ''; return; }
      const pct  = quote.changePct;
      const sign = pct >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${pct.toFixed(2)}%`;
      changeEl.className   = `hwl-change ${pct >= 0 ? 'hwl-change--pos' : 'hwl-change--neg'}`;
    } catch {
      const el = document.getElementById(`hwl-change-${item.symbol}`);
      if (el) el.textContent = '';
    }
  });
}

// ── Home News ────────────────────────────────────────────
let _homeNewsLoaded = false;

async function loadHomeNews() {
  if (_homeNewsLoaded) return;
  _homeNewsLoaded = true;

  const globalList = document.getElementById('home-news-global');
  const localList  = document.getElementById('home-news-local');
  if (!globalList || !localList) return;

  // Tab switching
  document.querySelectorAll('.home-news-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.home-news-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isGlobal = btn.dataset.tab === 'global';
      globalList.style.display = isGlobal ? '' : 'none';
      localList.style.display  = isGlobal ? 'none' : '';
      if (!isGlobal && !localList.dataset.loaded) {
        localList.dataset.loaded = '1';
        await _fetchLocalNews(localList);
      }
    });
  });

  // Load global news immediately
  await _fetchGlobalNews(globalList);
}

async function _fetchGlobalNews(container) {
  try {
    const key  = localStorage.getItem('bon-finnhub-key') || 'd6qup2hr01qgdhqcgpbgd6qup2hr01qgdhqcgpc0';
    const data = await fetchProxy(`https://finnhub.io/api/v1/news?category=general&token=${key}`);
    _renderHomeNewsItems(container, (data || []).slice(0, 8).map(n => ({
      headline: n.headline,
      url:      n.url,
      image:    n.image,
      source:   n.source,
      datetime: n.datetime * 1000,
    })));
  } catch {
    container.innerHTML = `<p style="color:var(--text-3);font-size:13px;padding:12px 14px">${t('noData')}</p>`;
  }
}

function _parseRSS(xmlText, sourceName) {
  try {
    const xml   = new DOMParser().parseFromString(xmlText, 'text/xml');
    const nodes = Array.from(xml.querySelectorAll('item'));
    return nodes.slice(0, 6).map(item => {
      const enclosure = item.querySelector('enclosure');
      const mediaContent = item.querySelector('content');
      const image = enclosure?.getAttribute('url') || mediaContent?.getAttribute('url') || null;
      return {
        headline: item.querySelector('title')?.textContent?.trim() || '',
        url:      item.querySelector('link')?.textContent?.trim() ||
                  item.querySelector('guid')?.textContent?.trim() || '',
        source:   item.querySelector('source')?.textContent?.trim() || sourceName,
        datetime: new Date(item.querySelector('pubDate')?.textContent || Date.now()).getTime(),
        image,
      };
    }).filter(n => n.headline && n.url);
  } catch { return []; }
}

async function _fetchRSS(rssUrl, sourceName) {
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
    const res  = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data.status !== 'ok' || !data.items?.length) return [];
    return data.items.slice(0, 8).map(item => {
      const raw  = item.title?.trim() || '';
      const dash = raw.lastIndexOf(' - ');
      const headline = dash > 0 ? raw.slice(0, dash) : raw;
      const source   = dash > 0 ? raw.slice(dash + 3) : (item.author?.trim() || sourceName);
      return {
        headline,
        url:      item.link?.trim() || '',
        source,
        datetime: new Date(item.pubDate || Date.now()).getTime(),
        image:    item.thumbnail || item.enclosure?.link || null,
      };
    }).filter(n => n.headline && n.url);
  } catch { return []; }
}

async function _fetchLocalNews(container) {
  // Google News RSS — searches return articles from Globes, Bizportal, TheMarker, etc.
  const rssSources = [
    { url: 'https://news.google.com/rss/search?q=בורסה+תל+אביב+מניות&hl=iw&gl=IL&ceid=IL:iw',     name: 'שוק ההון' },
    { url: 'https://news.google.com/rss/search?q=גלובס+שוק+ההון&hl=iw&gl=IL&ceid=IL:iw',          name: 'גלובס' },
    { url: 'https://news.google.com/rss/search?q=ביזפורטל+מניות+השקעות&hl=iw&gl=IL&ceid=IL:iw',   name: 'ביזפורטל' },
  ];

  const results = await Promise.all(rssSources.map(src => _fetchRSS(src.url, src.name)));
  const seen    = new Set();
  const items   = results.flat()
    .filter(n => n.headline && n.url && !seen.has(n.url) && seen.add(n.url))
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 10);

  if (items.length) {
    _renderHomeNewsItems(container, items);
    return;
  }

  // Fallback: Finnhub news for major Israeli-listed companies
  try {
    const key  = localStorage.getItem('bon-finnhub-key') || 'd6qup2hr01qgdhqcgpbgd6qup2hr01qgdhqcgpc0';
    const to   = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const syms = ['TEVA', 'NICE', 'CHKP', 'ICL', 'WIX', 'MNDY', 'CYBR'];
    const all  = await Promise.all(
      syms.map(s => fetchProxy(`https://finnhub.io/api/v1/company-news?symbol=${s}&from=${from}&to=${to}&token=${key}`)
        .then(d => (Array.isArray(d) ? d : []).slice(0, 2)).catch(() => []))
    );
    const fallback = all.flat()
      .filter(n => n.headline && n.url)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 10)
      .map(n => ({ headline: n.headline, url: n.url, image: n.image || null, source: n.source, datetime: n.datetime * 1000 }));
    _renderHomeNewsItems(container, fallback);
  } catch {
    container.innerHTML = `<p style="color:var(--text-3);font-size:13px;padding:12px 14px">${t('noData')}</p>`;
  }
}

function _renderHomeNewsItems(container, items) {
  if (!items?.length) {
    container.innerHTML = `<p style="color:var(--text-3);font-size:13px;padding:12px 14px">${t('noData')}</p>`;
    return;
  }
  container.innerHTML = items.map(n => `
    <a class="home-news-item" href="${n.url}" target="_blank" rel="noopener">
      ${n.image ? `<img class="home-news-thumb" src="${n.image}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="home-news-body">
        <div class="home-news-headline">${n.headline}</div>
        <div class="home-news-meta">${n.source} · ${new Date(n.datetime).toLocaleDateString()}</div>
      </div>
    </a>`).join('');
}

function renderHistory() {
  _renderHistory(navigateTo);
}

let _marketDataLoaded = false;

function navigateTo(page, symbol = null) {
  _navigateTo(page, symbol, {
    loadResults,
  });
  updateHash(page, symbol);
  if (page === 'home') {
    renderHomeWatchlist();
    // Re-render Top Picks if cache was invalidated (e.g. after visiting speedometer)
    if (!localStorage.getItem('bon-toppicks-v5')) {
      renderTopPicks(document.getElementById('top-picks-section'));
    }
  }
  if (page === 'market' && !_marketDataLoaded) {
    _marketDataLoaded = true;
    loadFearGreed();
    loadCryptoFearGreed();
    loadAAII();
    loadSectorPerformance();
    loadMag7Chart();
    applyTranslations();
    document.addEventListener('mag7:navigate', e => navigateTo('results', e.detail));
  }
}

function removeFromWatchlistBound(symbol) {
  _removeFromWatchlist(symbol, showNotification, updateWatchlistBtn, renderWatchlist);
  updateSidebarCount();
}

function removeHistoryBound(symbol) {
  _removeHistory(symbol, renderHistory);
}

// ── Expose window.* for inline onclick attributes ───────
window.openDrawer  = function() {}; // drawer removed — kept as no-op for safety
window.closeDrawer = function() {}; // drawer removed — kept as no-op for safety

window.navigateTo = navigateTo;

window.removeHistory = removeHistoryBound;

window.removeFromWatchlist = removeFromWatchlistBound;

window.openWatchlistSidebar  = openWatchlistSidebar;
window.closeWatchlistSidebar = closeWatchlistSidebar;

// ── Lang change callback ────────────────────────────────
window.__onLangChange = function() {
  // 1. Apply data-i18n attribute translations everywhere
  applyTranslations();

  // 2. Re-render results page dynamic content if it's active
  if (currentStock && document.getElementById('page-results')?.classList.contains('active')) {
    renderResults(currentStock, currentStock);

    // Patch highs1y after lang-change re-render
    const highs1yElLang = document.getElementById('info-highs1y');
    if (highs1yElLang) {
      const closes1y = (lastFullStockData?.history ?? []).map(h => h.value).filter(v => v != null && v > 0);
      highs1yElLang.textContent = closes1y.length >= 5 ? countNewHighs(closes1y) : (currentStock?.technicals?.highs?.y1 ?? t('noData'));
    }

    // Re-render summary gauge (has translated zone/factor labels)
    const summaryContainer = document.getElementById('summary-gauge-container');
    if (summaryContainer && lastSummaryScored) {
      renderSummaryGauge(summaryContainer, lastSummaryScored);
    }

    // Re-render analysis tables on language change
    const fundamentalEl = document.getElementById('analysis-fundamental-section');
    const technicalEl   = document.getElementById('analysis-technical-section');
    if ((fundamentalEl || technicalEl) && lastFullStockData !== undefined && lastSummaryScored) {
      renderAnalysisTables(
        fundamentalEl,
        technicalEl,
        lastSummaryScored,
        currentStock,
        lastFullStockData?.history ?? [],
        lastFullStockData?.indicators ?? null,
      );
      initInfoButtons(document.getElementById('page-results'));
    }
  }

  // 3. Re-render Fear & Greed + AAII + Trending labels on lang change
  loadFearGreed();
  loadCryptoFearGreed();
  loadAAII();
  renderTrendingList(navigateTo);

  // 4. Re-render home-page sections that have translated strings
  renderMarketStatus();
  loadMacroData();
  loadUpcomingEvents();
  loadSectorPerformance();
  loadMovers();
};

// ── Utility ─────────────────────────────────────────────
function syncTopbarHeight() {
  const h = document.querySelector('.top-bar')?.offsetHeight;
  if (h) document.documentElement.style.setProperty('--topbar-h', h + 'px');
}

// ── Market Indices ──────────────────────────────────────
async function loadMarketIndices() {
  const indices = [
    { id: 'idx-sp500',   symbol: '^GSPC'  },
    { id: 'idx-nasdaq',  symbol: '^NDX'   },
    { id: 'idx-dow',     symbol: '^DJI'   },
    { id: 'idx-russell', symbol: '^RUT'   },
    { id: 'idx-vix',     symbol: '^VIX'   },
  ];
  for (const { id, symbol } of indices) {
    const card = document.getElementById(id);
    if (!card) continue;
    const priceEl  = card.querySelector('.market-price');
    const changeEl = card.querySelector('.market-change');
    const isVix    = id === 'idx-vix';
    try {
      const quote = await fetchIndexQuote(symbol);
      if (quote && quote.price != null) {
        // VIX: show one decimal, no thousands separator; others: normal formatting
        priceEl.textContent = isVix
          ? quote.price.toFixed(2)
          : quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 });
        const sign = (quote.changePct ?? 0) >= 0 ? '+' : '';
        changeEl.textContent = quote.changePct != null ? `${sign}${quote.changePct.toFixed(2)}%` : '--';
        // VIX: rising = bad for market → show as negative (red); falling = positive (green)
        const chgPct = quote.changePct ?? 0;
        const colorClass = isVix
          ? (chgPct >= 0 ? 'negative' : 'positive')
          : (chgPct >= 0 ? 'positive' : 'negative');
        changeEl.className = `market-change ${colorClass}`;
      }
    } catch {
      // silently fail — cards keep showing '--'
    }
  }
}

// ── Forex (USD/ILS, EUR/ILS) ───────────────────────────
async function loadForex() {
  const pairs = [
    { id: 'fx-usdils', symbol: 'USDILS=X' },
    { id: 'fx-eurils', symbol: 'EURILS=X' },
  ];
  for (const { id, symbol } of pairs) {
    const card = document.getElementById(id);
    if (!card) continue;
    const priceEl  = card.querySelector('.market-price');
    const changeEl = card.querySelector('.market-change');
    try {
      const q = await fetchIndexQuote(symbol);
      if (q?.price != null) {
        priceEl.textContent = q.price.toFixed(3);
        const sign = (q.changePct ?? 0) >= 0 ? '+' : '';
        changeEl.textContent = q.changePct != null ? `${sign}${q.changePct.toFixed(2)}%` : '--';
        const cls = (q.changePct ?? 0) >= 0 ? 'positive' : 'negative';
        changeEl.className = `market-change ${cls}`;
      }
    } catch { /* keep -- */ }
  }
}

// ── Results ────────────────────────────────────────────
async function loadResults(symbol, isRefresh = false) {
  activeLoadSymbol = symbol;
  const loadId = ++activeLoadId; // unique id for this load — all async callbacks check this
  const isCurrent = () => activeLoadId === loadId;
  if (!isRefresh) {
    document.getElementById('results-loading').style.display = 'flex';
    document.getElementById('results-content').classList.add('hidden');
  }
  document.getElementById('results-error').classList.add('hidden');
  document.getElementById('offline-banner').classList.add('hidden');

  clearInterval(autoRefreshTimer);

  try {
    // Run quote, 5Y history, and full indicator data all in parallel
    const [
      { data, offline, cacheDate },
      h5,
      fullStockData,
    ] = await Promise.all([
      fetchAllData(symbol),
      fetchHistory(symbol, '5Y').catch(() => []),
      fetchStockFullData(symbol).catch(() => null),
    ]);

    if (!data) throw new Error(t('stockNotFound'));

    // If the user searched a different stock while this was loading, discard
    if (!isCurrent()) return;

    const scored = calcScore(data, h5, fullStockData?.indicators ?? {});
    currentStock = { ...data, ...scored };
    // Cache score for Top Picks display
    try {
      localStorage.setItem(`bon-score-${symbol.toUpperCase()}`, JSON.stringify({ score: scored.score, rating: scored.rating, ts: Date.now() }));
      // Invalidate Top Picks cache so it picks up the fresh score on next home visit
      localStorage.removeItem('bon-toppicks-v5');
    } catch {}

    if (offline && cacheDate) {
      document.getElementById('offline-banner').classList.remove('hidden');
      document.getElementById('offline-date').textContent = cacheDate.toLocaleString();
    }

    renderResults(data, scored);

    // Patch highs1y with rolling 52-week high count from 1Y history
    const highs1yEl = document.getElementById('info-highs1y');
    if (highs1yEl) {
      const closes1y = (fullStockData?.history ?? []).map(h => h.value).filter(v => v != null && v > 0);
      highs1yEl.textContent = closes1y.length >= 5 ? countNewHighs(closes1y) : (scored.technicals?.highs?.y1 ?? t('noData'));
    }

    // Patch beta from calculated indicators if Yahoo didn't provide it
    if (fullStockData?.indicators?.beta != null && !data.beta) {
      const bEl = document.getElementById('info-beta');
      if (bEl) bEl.textContent = fullStockData.indicators.beta.toFixed(2);
    }

    saveSearchHistory(symbol, data.name, renderHistory);

    document.getElementById('results-loading').style.display = 'none';
    const resultsContent = document.getElementById('results-content');
    resultsContent.classList.remove('hidden');

    // ── Last updated timestamp ──
    const updatedBar  = document.getElementById('last-updated-bar');
    const updatedTime = document.getElementById('last-updated-time');
    if (updatedBar && updatedTime) {
      const now = new Date();
      updatedTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        + '  ·  ' + now.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
      updatedBar.classList.remove('hidden');
    }
    // Trigger staggered fade-in-up animations on all sections
    resultsContent.classList.remove('did-animate');
    void resultsContent.offsetWidth; // force reflow to restart animations
    resultsContent.classList.add('did-animate');

    // ── SummaryGauge — 4-family weighted score ──
    const summaryContainer = document.getElementById('summary-gauge-container');
    if (summaryContainer) {
      lastSummaryScored = scored;   // use the 4-family calcScore result
      lastFullStockData = fullStockData;
      renderSummaryGauge(summaryContainer, scored);
    }

    loadChart(symbol, '1M');
    updateWatchlistBtn(symbol);

    // Analysis Tables (Fundamental + Technical) — async, fills SPY row after initial render
    const fundamentalEl = document.getElementById('analysis-fundamental-section');
    const technicalEl   = document.getElementById('analysis-technical-section');
    if (fundamentalEl || technicalEl) {
      renderAnalysisTables(
        fundamentalEl,
        technicalEl,
        scored,
        data,
        fullStockData?.history ?? [],
        fullStockData?.indicators ?? null,
        isCurrent,
      );
      initInfoButtons(document.getElementById('page-results'));
    }

    // AI Insight — runs async, silently hides itself on error
    if (isCurrent()) renderAIInsight(data.newsItems, symbol, isCurrent);

    autoRefreshTimer = setInterval(() => loadResults(symbol, true), 15 * 60 * 1000);

  } catch (e) {
    document.getElementById('results-loading').style.display = 'none';
    if (isRefresh) {
      // Silent failure on auto-refresh — keep showing existing data
      document.getElementById('results-content').classList.remove('hidden');
    } else {
      document.getElementById('results-error').classList.remove('hidden');
      document.getElementById('error-msg').textContent =
        e.message === 'no_data' ? t('stockNotFound') : e.message;
    }
  }
}

function renderResults(data, scored) {
  document.getElementById('res-symbol').textContent = data.symbol;
  document.getElementById('res-name').textContent   = data.name || '';

  const gaugeScore = document.getElementById('gauge-score');
  const gaugeLabel = document.getElementById('gauge-label');
  const partialWarn = document.getElementById('partial-data-warning');
  if (gaugeScore) gaugeScore.textContent = scored.score ?? '--';
  if (gaugeLabel) { gaugeLabel.textContent = t(scored.rating); gaugeLabel.className = `gauge-label badge-${scored.rating}`; }
  if (partialWarn) partialWarn.classList.toggle('hidden', !scored.isPartial);

  const fmt = (n, dec = 2) => n != null ? n.toFixed(dec) : t('noData');
  const currency = data.currency || 'USD';

  const priceEl  = document.getElementById('info-price');
  const changeEl = document.getElementById('info-change');
  priceEl.textContent = data.price != null ? `${currency} ${data.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : t('noData');
  if (data.isTASE && data.marketState === 'CLOSED') {
    priceEl.textContent += ` (${t('closed')})`;
  }
  if (data.changePct != null) {
    const sign = data.changePct >= 0 ? '+' : '';
    changeEl.textContent = `${sign}${data.changePct.toFixed(2)}%`;
    changeEl.className = `info-change ${data.changePct >= 0 ? 'positive' : 'negative'}`;
  }

  document.getElementById('info-mktcap').textContent = formatMarketCap(data.marketCap);
  document.getElementById('info-beta').textContent = fmt(data.beta);
  document.getElementById('info-dividend').textContent =
    data.dividend != null ? `${data.dividend.toFixed(2)}%` : t('noData');

  const earningsEl = document.getElementById('info-earnings');
  const earningsDaysEl = document.getElementById('info-earnings-days');
  if (data.earningsDate) {
    const ed = new Date(data.earningsDate);
    earningsEl.textContent = ed.toLocaleDateString();
    const days = Math.round((ed - new Date()) / 86400000);
    if (days === 0)       earningsDaysEl.textContent = t('today');
    else if (days > 0)    earningsDaysEl.textContent = t('daysUntil', { n: days });
    else                  earningsDaysEl.textContent = t('daysAgo', { n: Math.abs(days) });
  } else {
    earningsEl.textContent = t('noData');
    earningsDaysEl.textContent = '';
  }

  const targetEl = document.getElementById('info-target');
  const targetRangeEl = document.getElementById('info-target-range');
  if (data.targetMean) {
    targetEl.textContent = `${currency} ${data.targetMean.toFixed(2)}`;
    targetRangeEl.textContent = (data.targetLow && data.targetHigh)
      ? `${data.targetLow.toFixed(0)}–${data.targetHigh.toFixed(0)}`
      : '';
  } else {
    targetEl.textContent = t('noData');
    targetRangeEl.textContent = '';
  }

  // ── ATH / Highs / Distance from High ─────────────────
  const athPrice = scored.technicals?.athPrice;
  const athEl = document.getElementById('info-ath');
  if (athEl) athEl.textContent = athPrice != null ? `${currency} ${athPrice.toFixed(2)}` : t('noData');

  const highs1yEl = document.getElementById('info-highs1y');
  if (highs1yEl) {
    const y1 = scored.technicals?.highs?.y1;
    highs1yEl.textContent = y1 != null ? y1 : t('noData');
  }

  const distHighEl = document.getElementById('info-dist-high');
  if (distHighEl) {
    if (data.price != null && data.high52w != null && data.high52w > 0) {
      const distPct = ((data.high52w - data.price) / data.high52w) * 100;
      distHighEl.textContent = distPct < 0.1 ? t('atHigh') : `-${distPct.toFixed(1)}%`;
      distHighEl.className = `info-value ${distPct < 5 ? 'positive' : distPct < 15 ? '' : 'negative'}`;
    } else {
      distHighEl.textContent = t('noData');
    }
  }

  renderCompanyCard(document.getElementById('company-card-container'), data);
  renderNews(data.newsItems);
}

// ── Search ─────────────────────────────────────────────
function doSearch(query) {
  query = (query || '').trim().toUpperCase();
  if (!query) return;
  hideAutocomplete();
  navigateTo('results', query);
}

// ── URL hash + param (?s=AAPL  or  #market / #about / #results:AAPL) ──
function updateHash(page, symbol = null) {
  const hash = (page === 'results' && symbol) ? `#results:${symbol.toUpperCase()}`
             : (page === 'home')               ? ''
             :                                   `#${page}`;
  history.replaceState(null, '', hash || window.location.pathname + window.location.search);
}

function checkURLParam() {
  // ?s=AAPL — legacy share links
  const params = new URLSearchParams(window.location.search);
  const s = params.get('s');
  if (s) { navigateTo('results', s.toUpperCase()); return; }

  // Hash routing — restore page on refresh
  const hash = window.location.hash; // e.g. "#market" or "#results:AAPL"
  if (!hash || hash === '#home') return;
  if (hash.startsWith('#results:')) {
    const sym = hash.slice('#results:'.length).toUpperCase();
    if (sym) navigateTo('results', sym);
  } else {
    const page = hash.slice(1); // strip '#'
    if (['market', 'about', 'compare'].includes(page)) navigateTo(page);
  }
}

// ── Bind Events ────────────────────────────────────────
function bindEvents() {
  // Theme + lang
  document.getElementById('btn-theme-drawer')?.addEventListener('click', () => _toggleTheme(updateChartTheme));
  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', toggleLang));

  // Search
  const input = document.getElementById('search-input');
  const btn   = document.getElementById('search-btn');

  if (input) {
    input.addEventListener('input', () => showAutocomplete(input.value));
    input.addEventListener('focus', () => { if (!input.value.trim()) showRecentSearches(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        // If an autocomplete item is highlighted, confirm it; else do search
        if (!confirmAutocomplete()) doSearch(input.value);
      }
      if (e.key === 'ArrowDown') selectAutocomplete(1);
      if (e.key === 'ArrowUp')   selectAutocomplete(-1);
      if (e.key === 'Escape')    hideAutocomplete();
    });
  }
  if (btn) btn.addEventListener('click', () => { if (input) doSearch(input.value); });


  // Init autocomplete — onSelect triggers doSearch
  initAutocomplete((symbol) => doSearch(symbol));

  // Close autocomplete on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.tb-search-wrap') && !e.target.closest('.search-wrap')) hideAutocomplete();
  });

  // Back buttons
  document.getElementById('btn-back')?.addEventListener('click', () => navigateTo('home'));
  document.getElementById('btn-back-err')?.addEventListener('click', () => navigateTo('home'));
  document.getElementById('btn-back-about')?.addEventListener('click', () => navigateTo('home'));

  // Top-bar nav items
  document.querySelectorAll('.tb-nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page, page === 'results' ? currentStock?.symbol : null);
    });
  });

  // Watchlist toggle + haptic feedback
  document.getElementById('btn-watchlist-toggle')?.addEventListener('click', () => {
    if (!currentStock) return;
    const wasInList = isInWatchlist(currentStock.symbol);
    _toggleWatchlist(currentStock.symbol, currentStock.name, currentStock.rating, showNotification, updateWatchlistBtn, renderWatchlist);
    updateSidebarCount();
    // Haptic: vibrate only when ADDING to watchlist
    if (!wasInList) navigator.vibrate?.(50);
  });


  // Scroll to top
  document.getElementById('btn-share')?.addEventListener('click', () => {
    document.getElementById('page-results')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Chart ranges
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentStock) loadChart(currentStock.symbol, btn.dataset.range);
    });
  });

}

// ── DOMContentLoaded ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.page = 'home'; // initial page state for CSS targeting
  applyTheme();
  applyTranslations();
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);
  bindEvents();
  initInfoButtons(document.body);

  // Mark home as active in top-bar nav
  const homeBtn = document.querySelector('.tb-nav-btn[data-page="home"]');
  if (homeBtn) homeBtn.classList.add('active');

  // Move footer into active page
  const footer = document.querySelector('.app-footer');
  const initPage = document.querySelector('.page.active');
  if (footer && initPage) initPage.appendChild(footer);

  // Init WatchlistSidebar with callbacks
  initWatchlistSidebar(navigateTo, showNotification, updateWatchlistBtn, renderWatchlist);
  updateSidebarCount();

  checkURLParam();
  loadFearGreed();
  loadCryptoFearGreed();
  loadAAII();
  loadMarketIndices();
  loadTrending(navigateTo);
  renderHistory();
  renderHomeWatchlist();
  loadMacroData();
  loadCryptoPrices();
  loadUpcomingEvents();
  renderMarketStatus();
  loadDXY();
  loadForex();
  loadCommodities();
  loadSectorPerformance();
  loadMovers();
  loadHomeNews();
  renderTopPicks(document.getElementById('top-picks-section'));

  // FNG toggle: Stocks ↔ Crypto
  let cryptoFngLoaded = true; // already loaded above
  document.querySelectorAll('.fng-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fng-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isStocks = btn.dataset.fng === 'stocks';
      document.getElementById('fng-container')?.classList.toggle('hidden', !isStocks);
      document.getElementById('fng-crypto-container')?.classList.toggle('hidden', isStocks);
    });
  });

  setInterval(() => checkWatchlistAlerts(showNotification), 15 * 60 * 1000);

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
