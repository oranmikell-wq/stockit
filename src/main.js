// main.js — entry point, orchestrates all modules

const WORKER_SCORE_URL = 'https://bulltherapy-proxy.oranmikell.workers.dev/score';

async function fetchWorkerScore(symbol) {
  try {
    const res = await fetch(`${WORKER_SCORE_URL}?symbol=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.notFound ? null : json;
  } catch { return null; }
}

import { applyTranslations, toggleLang, t } from './utils/i18n.js?v=7';
import { fetchAllData, fetchHistory, fetchStockFullData, fetchIndexQuote, fetchProxy, fetchProxyRaw } from './services/StockService.js';
import { calcScore } from './utils/scoring.js';
import { renderSummaryGauge } from './components/SummaryGauge.js?v=3';

import { renderCriteriaTable } from './components/CriteriaTable.js?v=4';
import { renderStrategyChecklist, countNewHighs } from './components/StrategyChecklist.js';
import { renderAnalysisTables } from './components/AnalysisTables.js';
import { renderNews, renderAIInsight } from './components/NewsRenderer.js';
import { loadFearGreed, loadCryptoFearGreed } from './components/FearGreedGauge.js?v=2';
import { loadTrending, renderTrendingList }   from './components/TrendingList.js';
import { renderTopPicks } from './components/TopPicks.js?v=12';
import { loadAAII }      from './components/AAIISentiment.js';
import { loadMacroData, loadCryptoPrices, loadUpcomingEvents } from './components/MacroCrypto.js?v=7';
import { renderMarketStatus, loadDXY, loadCommodities, loadSectorPerformance, loadMovers } from './components/MarketMovers.js?v=1';
import { loadMarketBreadth, loadEarningsCalendar, loadShortInterest, loadPutCallRatio } from './components/MarketExtras.js';
import { loadMag7Chart } from './components/Mag7Chart.js';
import { initInfoButtons } from './components/InfoPopup.js';
import { renderCompanyCard } from './components/CompanyCard.js?v=2';
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

// ── S&P 500 symbol set — used to gate Worker fast path ──
const SP500_SET = new Set([
  'AAPL','MSFT','NVDA','GOOGL','GOOG','META','TSLA','AVGO','ORCL','CRM',
  'AMD','QCOM','TXN','AMAT','MU','LRCX','KLAC','ADI','SNPS','CDNS',
  'MRVL','MCHP','NXPI','ON','SWKS','MPWR','TER','KEYS','INTC','ANSS',
  'FICO','MDB','ZS','HUBS','PLTR','APP','TTD','OKTA',
  'ADBE','NOW','INTU','FTNT','PANW','CRWD','NET','DDOG','SNOW','ADSK',
  'WDAY','PAYC','VRSN','GDDY','PTC','CTSH','AKAM','FFIV','GEN','EPAM',
  'IBM','CSCO','HPQ','HPE','DELL','CDW','WDC','STX','NTAP','GLW',
  'APH','TEL','FTV','ZBRA','TRMB','LDOS','IT','JNPR','ACN','MANH',
  'FSLR','ENPH','GNRC',
  'JPM','BAC','WFC','GS','MS','USB','PNC','TFC','COF','MTB',
  'RF','FITB','HBAN','KEY','CFG','ZION','FHN','CMA',
  'BLK','AXP','SCHW','SPGI','MCO','ICE','CME','CBOE','NDAQ','MKTX',
  'STT','BK','NTRS','TROW','IVZ','BEN','VOYA','RJF','FDS','SEIC','BR',
  'CB','PGR','MMC','MET','PRU','AFL','ALL','HIG','LNC','UNM',
  'CINF','WRB','GL','AIG','AMP','EG','AON','WTW','BRO','ERIE','AIZ',
  'SYF','ALLY','PFG','KKR','APO','CG','FNF','LPLA','ORI',
  'LLY','JNJ','ABBV','MRK','AMGN','PFE','BMY','GILD','VRTX','REGN',
  'MRNA','BIIB','ALNY','INCY','NBIX','UTHR','EXAS','OGN',
  'UNH','TMO','ABT','DHR','ISRG','SYK','BSX','ZTS','MDT','EW',
  'DXCM','BDX','GEHC','RMD','HOLX','IQV','PODD','RVTY','MTD','A',
  'BAX','TFX','ALGN','WAT','ILMN','COO','CRL','TECH','SOLV',
  'XOM','CVX','COP','EOG','SLB','PSX','VLO','MPC','OXY','HAL',
  'DVN','FANG','HES','APA','MRO','BKR','NOV','CTRA','OVV',
  'NEE','DUK','SO','AEP','EXC','XEL','WEC','DTE','ED','FE',
  'EIX','PEG','ETR','ES','AEE','LNT','EVRG','CMS','NI','PPL',
  'NRG','AES','PNW',
  'AMZN','TSLA','HD','MCD','NKE','SBUX','TGT','LOW','TJX','BKNG',
  'MAR','HLT','YUM','CMG','DHI','LEN','PHM','NVR',
  'COST','WMT','KR','SYY','MKC','GIS','CPB','CAG','HRL','SJM',
  'TSN','HSY','MDLZ','KHC','PEP','KO','STZ','BUD','TAP',
  'PG','CL','COLM','EL','ULTA','BBWI',
  'LIN','APD','SHW','PPG','ECL','EMN','CF','MOS','FMC','ALB','CE',
  'AMT','PLD','EQIX','PSA','SPG','O','WPC','DLR','CCI','SBAC',
  'EQR','AVB','ESS','MAA','UDR','CPT','IRM','VICI','MGM',
  'CAT','DE','HON','RTX','LMT','NOC','GD','BA','GE','MMM',
  'EMR','ETN','PH','ROK','FTV','OTIS','CARR','TT','IR','XYL',
  'WM','RSG','FAST','GWW','EXPD','JBHT','CHRW','XPO','ODFL',
  'V','MA','PYPL','SQ','FI','FIS','GPN','WEX','FOUR',
  'NFLX','DIS','CMCSA','PARA','WBD','FOX','FOXA',
  'T','VZ','TMUS','LUMN','WU',
  'NVDA','AVGO','QCOM','TXN','AMAT','MU','LRCX','KLAC','ADI','MRVL',
]);

// ── App State ───────────────────────────────────────────
let currentStock = null;
let autoRefreshTimer = null;
let activeLoadSymbol = null; // tracks the latest requested symbol to cancel stale loads
let activeLoadId = 0;       // increments on every search; async ops check this before writing DOM
let lastFullStockData  = null;   // stored for lang-change re-render
let lastSummaryScored  = null;   // stored for lang-change re-render
let lastResultsData    = null;   // stored for lang-change re-render of CriteriaTable

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
    return `
      <div class="hwl-item" data-symbol="${item.symbol}">
        <div class="hwl-left">
          <span class="hwl-symbol">${item.symbol}</span>
          <span class="hwl-name">${item.name || ''}</span>
        </div>
        <div class="hwl-right">
          <span class="hwl-price" id="hwl-price-${item.symbol}"></span>
          <span class="hwl-change hwl-change--loading" id="hwl-change-${item.symbol}">…</span>
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

// Finance keyword filter — keeps only market/stock/economy related headlines
const _FINANCE_EN = /\b(stock|market|share|nasdaq|s&p|dow|earn|revenue|profit|loss|ipo|fund|invest|trade|trading|quarter|eps|valuat|gdp|inflation|fed|rate|bond|yield|crypto|bitcoin|etf|index|dividend|merger|acqui|wall street|nyse|sector|rally|sell.off|bull|bear|portfolio|analyst|forecast|guidance|outlook)\b/i;
const _FINANCE_HE = /בורסה|מניה|מניות|שוק|מדד|ת"א|רבעון|רווח|הפסד|השקעה|ריבית|אינפלציה|מסחר|תשואה|קרן|אגרת|אגח|מט"ח|מטבע|נאסד|כלכל|פיננס|תעשיי|ביזפורטל|גלובס|כלכליסט|themarket|שע"ח|תיק/i;

function _isFinanceHeadline(headline) {
  return _FINANCE_EN.test(headline) || _FINANCE_HE.test(headline);
}

async function _fetchGlobalNews(container) {
  const rssSources = [
    { url: 'https://feeds.reuters.com/reuters/businessNews',                                                              name: 'Reuters' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',                                                      name: 'CNBC' },
    { url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/',                                                     name: 'MarketWatch' },
    { url: 'https://finance.yahoo.com/rss/topfinstories',                                                                name: 'Yahoo Finance' },
    { url: 'https://news.google.com/rss/search?q=stock+market+wall+street+earnings&hl=en&gl=US&ceid=US:en',              name: 'Market News' },
  ];

  try {
    const results = await Promise.all(rssSources.map(src => _fetchRSS(src.url, src.name)));
    const seen  = new Set();
    const items = results.flat()
      .filter(n => n.headline && n.url && _isFinanceHeadline(n.headline) && !seen.has(n.url) && seen.add(n.url))
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 10);

    if (items.length) { _renderHomeNewsItems(container, items); return; }

    // Fallback to Finnhub if all RSS fail
    const key  = localStorage.getItem('bon-finnhub-key') || 'd6qup2hr01qgdhqcgpbgd6qup2hr01qgdhqcgpc0';
    const data = await fetchProxy(`https://finnhub.io/api/v1/news?category=general&token=${key}`);
    _renderHomeNewsItems(container, (data || []).slice(0, 8).map(n => ({
      headline: n.headline, url: n.url, image: n.image, source: n.source, datetime: n.datetime * 1000,
    })));
  } catch {
    container.innerHTML = `<p style="color:var(--text-3);font-size:13px;padding:12px 14px">${t('noData')}</p>`;
  }
}

function _parseRSS(xmlText, sourceName) {
  try {
    const xml   = new DOMParser().parseFromString(xmlText, 'text/xml');
    const nodes = Array.from(xml.querySelectorAll('item'));
    return nodes.map(item => {
      const raw  = item.querySelector('title')?.textContent?.trim() || '';
      const dash = raw.lastIndexOf(' - ');
      const headline = dash > 0 ? raw.slice(0, dash) : raw;
      const source   = dash > 0 ? raw.slice(dash + 3) :
                       (item.querySelector('source')?.textContent?.trim() || sourceName);
      const enclosure = item.querySelector('enclosure');
      const mediaTh   = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0];
      const mediaCo   = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
      const image = enclosure?.getAttribute('url') || mediaTh?.getAttribute('url') ||
                    mediaCo?.getAttribute('url') ||
                    _extractImgFromHtml(item.querySelector('description')?.textContent) || null;
      return {
        headline,
        url:      item.querySelector('link')?.textContent?.trim() ||
                  item.querySelector('guid')?.textContent?.trim() || '',
        source,
        datetime: new Date(item.querySelector('pubDate')?.textContent || Date.now()).getTime(),
        image,
      };
    }).filter(n => n.headline && n.url);
  } catch { return []; }
}

async function _fetchGoogleNewsRSS(rssUrl, sourceName) {
  // Try corsproxy first, fallback to allorigins, then rss2json
  const proxies = [
    () => fetch('https://corsproxy.io/?' + encodeURIComponent(rssUrl), { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => _parseRSS(xml, sourceName)),
    () => fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl), { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => _parseRSS(xml, sourceName)),
    () => fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl), { signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => {
      if (d.status !== 'ok' || !d.items?.length) return [];
      return d.items.map(item => {
        const raw = item.title?.trim() || '';
        const dash = raw.lastIndexOf(' - ');
        return { headline: dash > 0 ? raw.slice(0, dash) : raw, url: item.link?.trim() || '', source: dash > 0 ? raw.slice(dash + 3) : sourceName, datetime: new Date(item.pubDate || Date.now()).getTime(), image: item.thumbnail || null };
      }).filter(n => n.headline && n.url);
    }),
  ];
  for (const attempt of proxies) {
    try {
      const items = await attempt();
      if (items.length) return items;
    } catch { /* try next */ }
  }
  return [];
}

function _extractImgFromHtml(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
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
      // Google News RSS appends " - Source Name" to titles; direct feeds don't
      const headline = dash > 0 ? raw.slice(0, dash) : raw;
      const source   = dash > 0 ? raw.slice(dash + 3) : sourceName;
      const image    = item.thumbnail || item.enclosure?.link ||
                       _extractImgFromHtml(item.description) ||
                       _extractImgFromHtml(item.content) || null;
      return {
        headline,
        url:      item.link?.trim() || '',
        source,
        datetime: new Date(item.pubDate || Date.now()).getTime(),
        image,
      };
    }).filter(n => n.headline && n.url);
  } catch { return []; }
}

async function _fetchLocalNews(container) {
  const queries = [
    { url: 'https://news.google.com/rss/search?q=בורסה+תל+אביב+מניות&hl=iw&gl=IL&ceid=IL:iw',          name: 'שוק ההון' },
    { url: 'https://news.google.com/rss/search?q=בורסה+ישראל+מניות+תל+אביב&hl=iw&gl=IL&ceid=IL:iw',    name: 'שוק ההון' },
    { url: 'https://news.google.com/rss/search?q=שוק+ההון+ישראל+כלכלה&hl=iw&gl=IL&ceid=IL:iw',          name: 'כלכלה' },
    { url: 'https://news.google.com/rss/search?q=מניות+ישראל+השקעות+כלכלה&hl=iw&gl=IL&ceid=IL:iw',      name: 'השקעות' },
  ];

  const rssResults = await Promise.all(queries.map(q => _fetchGoogleNewsRSS(q.url, q.name)));

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const seen = new Set();
  const items = rssResults.flat()
    .filter(n => n.headline && n.url && n.datetime >= cutoff && _isFinanceHeadline(n.headline) && !seen.has(n.url) && seen.add(n.url))
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 10);

  if (items.length) {
    _renderHomeNewsItems(container, items);
    return;
  }

  container.innerHTML = `<p style="color:var(--text-3);font-size:13px;padding:12px 14px">${t('noData')}</p>`;
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
  updateURLParam(page, symbol);
  if (page === 'home') {
    renderHomeWatchlist();
    if (!localStorage.getItem('bon-toppicks-v10')) {
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
    loadMarketBreadth();
    loadShortInterest();
    loadPutCallRatio();
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

    // Re-render criteria table on language change
    if (lastSummaryScored && lastResultsData) {
      renderCriteriaTable(lastSummaryScored, lastResultsData);
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

// ── Worker fast-path helpers ────────────────────────────
function buildDataFromWorker(ws, liveQuote, newsItems) {
  return {
    symbol:          ws.symbol,
    name:            ws.name,
    sector:          ws.sector,
    industry:        ws.industry ?? null,
    description:     ws.description ?? null,
    employees:       ws.employees ?? null,
    website:         ws.website ?? null,
    country:         ws.country ?? null,
    exchange:        ws.exchange ?? null,
    currency:        'USD',
    isTASE:          false,
    isCrypto:        false,
    marketState:     'REGULAR',
    price:           liveQuote?.price ?? ws.price,
    changePct:       liveQuote?.changePct ?? ws.changePct,
    change:          null,
    pe:              ws.pe,
    pb:              ws.pb,
    ps:              ws.ps,
    peg:             ws.peg,
    beta:            ws.beta,
    dividend:        ws.dividend,
    marketCap:       ws.marketCap,
    high52w:         ws.high52w,
    low52w:          ws.low52w,
    debtEquity:      ws.debtEquity,
    roe:             ws.roe,
    currentRatio:    ws.currentRatio,
    fcf:             ws.fcf,
    operatingMargin: ws.operatingMargin,
    insiderOwnership: ws.insiderOwnership,
    shortFloat:      ws.shortFloat,
    epsGrowth:       ws.epsGrowth,
    revenueGrowth:   ws.revenueGrowth,
    epsSurprise:     ws.epsSurprise,
    // New 5-indicator raw values
    epsGrowthFwd:    ws.epsGrowthFwd ?? null,
    forwardPE:       ws.forwardPE ?? null,
    fcfYield:        ws.fcfYield ?? null,
    debtToEquity:    ws.debtToEquity ?? null,
    rsi:             ws.rsi ?? null,
    analystScore:    ws.analystScore ?? null,
    analystMean:     ws.analystMean ?? null,
    analystCount:    ws.analystCount ?? null,
    targetMean:      ws.targetMean ?? null,
    targetHigh:      ws.targetHigh ?? null,
    targetLow:       ws.targetLow ?? null,
    earningsDate:    ws.earningsDate ? new Date(ws.earningsDate) : null,
    instPct:         ws.instPct ?? null,
    newsItems:       newsItems ?? [],
  };
}

function buildScoredFromWorker(ws) {
  return {
    score:    ws.score,
    bulls:    ws.bulls ?? null,
    rating:   ws.rating,
    isPartial: false,
    criteria: ws.criteria ?? {},
    families: ws.families ?? {},
    technicals: {
      rsi:      ws.rsi ?? null,
      macd:     ws.macd ?? null,
      athPrice: ws.ath ?? null,
      highs:    ws.technicals?.highs ?? null,
    },
    sectorKey: ws.sectorKey ?? 'default',
    _ma200:    ws.ma200 ?? null,
  };
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
    // Check Worker first for S&P 500 stocks (fast, cached)
    const workerScore = await fetchWorkerScore(symbol);
    const hasFullWorkerData = workerScore?.criteria != null && workerScore?.score != null;

    if (SP500_SET.has(symbol.toUpperCase()) && hasFullWorkerData) {
      // ── FAST PATH: Worker has all data ──────────────────────────────────────
      const [liveQuoteResult, fullStockData] = await Promise.all([
        fetchAllData(symbol).catch(() => ({ data: null, offline: false, cacheDate: null })),
        fetchStockFullData(symbol).catch(() => null),
      ]);

      if (!isCurrent()) return;

      const liveData  = liveQuoteResult?.data;
      const liveQuote = liveData ? { price: liveData.price, changePct: liveData.changePct } : null;
      const newsItems = liveData?.newsItems ?? [];

      const data   = buildDataFromWorker(workerScore, liveQuote, newsItems);
      const scored = buildScoredFromWorker(workerScore);

      // Overlay live Yahoo data into the worker-built data object (fast path)
      if (liveData) {
        if (liveData.beta        != null) data.beta        = liveData.beta;
        if (liveData.dividend    != null) data.dividend    = liveData.dividend;
        if (liveData.earningsDate!= null) data.earningsDate= liveData.earningsDate;
        if (liveData.targetMean  != null) data.targetMean  = liveData.targetMean;
        if (liveData.targetHigh  != null) data.targetHigh  = liveData.targetHigh;
        if (liveData.targetLow   != null) data.targetLow   = liveData.targetLow;
        if (liveData.analystScore!= null) data.analystScore= liveData.analystScore;
        if (liveData.analystMean != null) data.analystMean = liveData.analystMean;
        if (liveData.analystCount!= null) data.analystCount= liveData.analystCount;
        if (liveData.instPct     != null) data.instPct     = liveData.instPct;
        if (liveData.marketCap   != null) data.marketCap   = liveData.marketCap;
      }

      currentStock = { ...data, ...scored };

      renderResults(data, scored);

      // Patch highs1y from fullStockData if available
      const highs1yEl = document.getElementById('info-highs1y');
      if (highs1yEl) {
        const closes1y = (fullStockData?.history ?? []).map(h => h.value).filter(v => v != null && v > 0);
        highs1yEl.textContent = closes1y.length >= 5 ? countNewHighs(closes1y) : t('noData');
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
        lastSummaryScored = scored;
        lastFullStockData = fullStockData;
        renderSummaryGauge(summaryContainer, scored);
      }

      loadChart(symbol, '1M');
      updateWatchlistBtn(symbol);

      // Criteria Table (5-indicator system)
      lastResultsData = data;
      renderCriteriaTable(scored, data);
      initInfoButtons(document.getElementById('page-results'));

      // AI Insight — runs async, silently hides itself on error
      if (isCurrent()) renderAIInsight(newsItems, symbol, isCurrent);

      autoRefreshTimer = setInterval(() => loadResults(symbol, true), 15 * 60 * 1000);

    } else {
      // ── FALLBACK PATH: non-S&P500 or Worker data not ready ──────────────────
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

      // If Worker has a score (even partial), use it as the authoritative score + families
      if (workerScore?.score != null) {
        scored.score  = workerScore.score;
        scored.bulls  = workerScore.bulls ?? null;
        scored.rating = workerScore.rating;
        if (workerScore.families) {
          scored.families = workerScore.families;
        }
        if (workerScore.criteria) {
          scored.criteria = workerScore.criteria;
        }
      }

      // Merge new raw indicator fields from worker score into data for CriteriaTable
      if (workerScore) {
        data.epsGrowthFwd = workerScore.epsGrowthFwd ?? null;
        data.forwardPE    = workerScore.forwardPE    ?? null;
        data.fcfYield     = workerScore.fcfYield     ?? null;
        data.debtToEquity = workerScore.debtToEquity ?? null;
        data.rsi          = workerScore.rsi          ?? null;
      }

      currentStock = { ...data, ...scored };

      if (offline && cacheDate) {
        document.getElementById('offline-banner').classList.remove('hidden');
        document.getElementById('offline-date').textContent = cacheDate.toLocaleString();
        document.getElementById('last-updated-bar').classList.add('hidden');
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

      // Criteria Table (5-indicator system)
      lastResultsData = data;
      renderCriteriaTable(scored, data);
      initInfoButtons(document.getElementById('page-results'));

      // AI Insight — runs async, silently hides itself on error
      if (isCurrent()) renderAIInsight(data.newsItems, symbol, isCurrent);

      autoRefreshTimer = setInterval(() => loadResults(symbol, true), 15 * 60 * 1000);
    }

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


  const fmt = (n, dec = 2) => { const num = parseFloat(n); return !isNaN(num) ? num.toFixed(dec) : t('noData'); };
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
    data.dividend != null ? `${parseFloat(data.dividend).toFixed(2)}%` : t('noData');

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
    const tMean = parseFloat(data.targetMean);
    const tLow  = parseFloat(data.targetLow);
    const tHigh = parseFloat(data.targetHigh);
    targetEl.textContent = !isNaN(tMean) ? `${currency} ${tMean.toFixed(2)}` : t('noData');
    targetRangeEl.textContent = (!isNaN(tLow) && !isNaN(tHigh))
      ? `${tLow.toFixed(0)}–${tHigh.toFixed(0)}`
      : '';
  } else {
    targetEl.textContent = t('noData');
    targetRangeEl.textContent = '';
  }

  // ── ATH / Highs / Distance from High ─────────────────
  // True ATH = max of (5Y history closes, 52W intraday high) — single consistent value everywhere
  const athFromHistory = scored.technicals?.athPrice ?? 0;
  const athPrice = Math.max(athFromHistory, data.high52w ?? 0) || null;
  const athEl = document.getElementById('info-ath');
  if (athEl) athEl.textContent = athPrice != null ? `${currency} ${athPrice.toFixed(2)}` : t('noData');

  const highs1yEl = document.getElementById('info-highs1y');
  if (highs1yEl) {
    const y1 = scored.technicals?.highs?.y1;
    highs1yEl.textContent = y1 != null ? y1 : t('noData');
  }

  const distHighEl = document.getElementById('info-dist-high');
  if (distHighEl) {
    if (data.price != null && athPrice != null && athPrice > 0) {
      const distPct = ((athPrice - data.price) / athPrice) * 100;
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
function updateURLParam(page, symbol = null) {
  let url = window.location.pathname;
  if (page === 'results' && symbol) {
    url += `?s=${symbol.toUpperCase()}`;
  } else if (page !== 'home') {
    url += `?p=${page}`;
  }
  history.replaceState(null, '', url);
}

function checkURLParam() {
  const params = new URLSearchParams(window.location.search);
  const s = params.get('s');
  if (s) { navigateTo('results', s.toUpperCase()); return; }
  const p = params.get('p');
  if (p && ['market', 'about', 'compare'].includes(p)) navigateTo(p);
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
  document.getElementById('btn-scroll-top')?.addEventListener('click', () => {
    document.getElementById('page-results')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('btn-share')?.addEventListener('click', () => {
    if (!currentStock?.symbol) return;
    const shareUrl = `${location.origin}${location.pathname}?s=${currentStock.symbol}`;
    if (navigator.share) {
      navigator.share({ url: shareUrl, title: currentStock.symbol }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareUrl).then(() => showNotification('Link copied!')).catch(() => {});
    }
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
  loadEarningsCalendar();
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
