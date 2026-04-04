// FearGreedGauge.js — CNN-style Fear & Greed speedometer gauge

import { fetchProxy } from '../services/StockService.js';
import { t } from '../utils/i18n.js?v=6';

const FNG_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

// ── Zone config ────────────────────────────────────────
const ZONES = [
  { s1: 0,  s2: 25,  key: 'fng_extreme_fear',  color: '#ef4444', l1: 'EXTREME', l2: 'FEAR'  },
  { s1: 25, s2: 45,  key: 'fng_fear',           color: '#f97316', l1: 'FEAR',    l2: null    },
  { s1: 45, s2: 55,  key: 'fng_neutral',        color: '#eab308', l1: 'NEUTRAL', l2: null    },
  { s1: 55, s2: 75,  key: 'fng_greed',          color: '#84cc16', l1: 'GREED',   l2: null    },
  { s1: 75, s2: 100, key: 'fng_extreme_greed',  color: '#22c55e', l1: 'EXTREME', l2: 'GREED' },
];

function getZoneIndex(score) {
  for (let i = 0; i < ZONES.length; i++) if (score <= ZONES[i].s2) return i;
  return ZONES.length - 1;
}

function ratingToKey(cnnRating) {
  const s = (cnnRating || '').toLowerCase().replace(/\s+/g, '_');
  return ({ extreme_fear: 'fng_extreme_fear', fear: 'fng_fear', neutral: 'fng_neutral',
            greed: 'fng_greed', extreme_greed: 'fng_extreme_greed' })[s] || 'fng_neutral';
}

// ── SVG geometry ───────────────────────────────────────
const CX = 140, CY = 150, R_O = 130, R_I = 72, R_MID = 101;
const PI = Math.PI;

function pt(a, r) {
  return { x: +(CX + r * Math.cos(a)).toFixed(2), y: +(CY - r * Math.sin(a)).toFixed(2) };
}

// Annular sector path from score s1→s2 (arc fills left to right = fear→greed)
function sectorPath(s1, s2) {
  const a1 = PI * (1 - s1 / 100); // angle at s1 (left = large angle)
  const a2 = PI * (1 - s2 / 100); // angle at s2 (right = small angle)
  const { x: ox1, y: oy1 } = pt(a1, R_O);
  const { x: ox2, y: oy2 } = pt(a2, R_O);
  const { x: ix1, y: iy1 } = pt(a1, R_I);
  const { x: ix2, y: iy2 } = pt(a2, R_I);
  // Outer arc CW (a1→a2), line to inner, inner arc CCW (a2→a1), close
  return `M${ox1} ${oy1} A${R_O} ${R_O} 0 0 1 ${ox2} ${oy2} L${ix2} ${iy2} A${R_I} ${R_I} 0 0 0 ${ix1} ${iy1}Z`;
}

// ── Build SVG ──────────────────────────────────────────
function buildGaugeSVG(score, activeIdx, label) {
  const activeZone = ZONES[activeIdx];
  const GAP = 0.7; // gap between sectors (in score units)

  // 1. Background track (full arc, subtle)
  const bgTrack = `<path d="${sectorPath(0, 100)}" fill="var(--bg-3)" stroke="none"/>`;

  // 2. Colored sectors — vivid, with small gaps between them
  const sectors = ZONES.map((z, i) => {
    const isActive = i === activeIdx;
    const s1g = z.s1 === 0   ? z.s1 : z.s1 + GAP;
    const s2g = z.s2 === 100 ? z.s2 : z.s2 - GAP;
    return `<path d="${sectorPath(s1g, s2g)}"
      fill="${z.color}"
      fill-opacity="${isActive ? '1' : '0.22'}"
      stroke="none"/>`;
  }).join('');

  // 3. Active sector rim highlight (outer stroke)
  const az = ZONES[activeIdx];
  const as1g = az.s1 === 0   ? az.s1 : az.s1 + GAP;
  const as2g = az.s2 === 100 ? az.s2 : az.s2 - GAP;
  const activeRim = `<path d="${sectorPath(as1g, as2g)}"
    fill="none" stroke="${az.color}" stroke-width="1.5" opacity="0.6"/>`;

  // 4. Needle — thin elegant triangle
  const na = PI * (1 - score / 100);
  const tipPt  = pt(na,          R_O - 4);          // tip near outer arc
  const basePt = pt(na + PI / 2, 5);                // base left (perpendicular)
  const base2  = pt(na - PI / 2, 5);                // base right
  const tailPt = pt(na + PI,     12);               // short counterbalance tail
  const needle = `<polygon
    points="${tipPt.x},${tipPt.y} ${basePt.x},${basePt.y} ${tailPt.x},${tailPt.y} ${base2.x},${base2.y}"
    fill="var(--text)" opacity="0.9"/>`;

  // 5. Pivot cap
  const pivot = `
    <circle cx="${CX}" cy="${CY}" r="10" fill="var(--card-bg)" stroke="var(--border)" stroke-width="1.5"/>
    <circle cx="${CX}" cy="${CY}" r="4"  fill="var(--text)"/>`;

  // 6. Score & label (below pivot, clear of needle)
  const scoreText = `
    <text x="${CX}" y="${CY + 60}" text-anchor="middle"
      font-size="50" font-weight="900" font-family="Inter,Rubik,sans-serif"
      fill="${activeZone.color}">${score}</text>
    <text x="${CX}" y="${CY + 78}" text-anchor="middle"
      font-size="9.5" font-weight="700" font-family="Inter,Rubik,sans-serif"
      fill="${activeZone.color}" letter-spacing="1.2">${label.toUpperCase()}</text>`;

  // 7. Edge labels — just 0 and 100
  const lp = pt(PI, R_I - 14);
  const rp = pt(0,  R_I - 14);
  const edgeNums = `
    <text x="${lp.x.toFixed(1)}" y="${(lp.y + 4).toFixed(1)}" text-anchor="middle"
      font-size="9" font-weight="600" fill="var(--text-3)" opacity="0.55">0</text>
    <text x="${rp.x.toFixed(1)}" y="${(rp.y + 4).toFixed(1)}" text-anchor="middle"
      font-size="9" font-weight="600" fill="var(--text-3)" opacity="0.55">100</text>`;

  return `
<svg viewBox="0 0 280 235" fill="none" xmlns="http://www.w3.org/2000/svg" class="fng-svg">
  ${bgTrack}
  ${sectors}
  ${activeRim}
  ${needle}
  ${pivot}
  ${scoreText}
  ${edgeNums}
</svg>`;
}

// ── Badge background (light tint of zone color) ────────
function badgeBg(color) { return color + '30'; } // 19% opacity

// ── Compare row ────────────────────────────────────────
function compareRow(periodKey, prevScore, currentScore) {
  if (prevScore == null) return '';
  const prev    = Math.round(prevScore);
  const zi      = getZoneIndex(prev);
  const zone    = ZONES[zi];
  const zLabel  = t(zone.key);
  const diff    = Math.round(currentScore) - prev;
  const arrow   = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
  const diffClr = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--text-3)';

  return `
  <div class="fng-row">
    <div class="fng-row-info">
      <span class="fng-row-period">${t(periodKey)}</span>
      <span class="fng-row-zone" style="color:${zone.color}">${zLabel}</span>
    </div>
    <div class="fng-row-right">
      <span class="fng-row-arrow" style="color:${diffClr}">${arrow}</span>
      <div class="fng-row-badge" style="background:${badgeBg(zone.color)};color:${zone.color}">${prev}</div>
    </div>
  </div>`;
}

// ── Timestamp formatter ────────────────────────────────
function formatTimestamp(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return ''; }
}

// ── Crypto F&G (alternative.me) ────────────────────────
const CRYPTO_FNG_URL = 'https://api.alternative.me/fng/?limit=30';

function cryptoRatingToKey(classification) {
  const s = (classification || '').toLowerCase().replace(/\s+/g, '_');
  return ({ extreme_fear: 'fng_extreme_fear', fear: 'fng_fear', neutral: 'fng_neutral',
            greed: 'fng_greed', extreme_greed: 'fng_extreme_greed' })[s] || 'fng_neutral';
}

export async function loadCryptoFearGreed(containerId = 'fng-crypto-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res  = await fetch(CRYPTO_FNG_URL);
    const json = await res.json();
    const data = json?.data;
    if (!data?.length) throw new Error('no_data');

    const current   = data[0];
    const score     = parseInt(current.value, 10);
    const activeIdx = getZoneIndex(score);
    const labelKey  = cryptoRatingToKey(current.value_classification);
    const label     = t(labelKey);
    const ts        = new Date(parseInt(current.timestamp, 10) * 1000).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const week  = data[6]  ? parseInt(data[6].value, 10)  : null;
    const month = data[29] ? parseInt(data[29].value, 10) : null;

    container.innerHTML = `
      <div class="fng-gauge-wrap">
        ${buildGaugeSVG(score, activeIdx, label)}
        ${ts ? `<p class="fng-updated">${ts}</p>` : ''}
        <div class="fng-compare-rows">
          ${compareRow('fng_1w_ago', week, score)}
          ${compareRow('fng_1m_ago', month, score)}
        </div>
        <p class="fng-source">${t('fng_crypto_source')}</p>
      </div>`;
  } catch {
    container.innerHTML = `<p class="fng-error">${t('fng_error')}</p>`;
  }
}

// ── Public ─────────────────────────────────────────────
export async function loadFearGreed() {
  const container = document.getElementById('fng-container');
  if (!container) return;

  try {
    const json = await fetchProxy(FNG_URL);
    const fg   = json?.fear_and_greed;
    if (!fg?.score) throw new Error('no_data');

    const score    = Math.round(fg.score);
    const activeIdx = getZoneIndex(score);
    const labelKey  = ratingToKey(fg.rating);
    const label     = t(labelKey);
    const ts        = formatTimestamp(fg.timestamp);

    const week  = fg.previous_1_week  != null ? Math.round(fg.previous_1_week)  : null;
    const month = fg.previous_1_month != null ? Math.round(fg.previous_1_month) : null;

    container.innerHTML = `
      <div class="fng-gauge-wrap">
        ${buildGaugeSVG(score, activeIdx, label)}
        ${ts ? `<p class="fng-updated">${ts}</p>` : ''}
        <div class="fng-compare-rows">
          ${compareRow('fng_1w_ago', week, score)}
          ${compareRow('fng_1m_ago', month, score)}
        </div>
        <p class="fng-source">${t('fng_source')}</p>
      </div>`;
  } catch (e) {
    container.innerHTML = `<p class="fng-error">${t('fng_error')}</p>`;
  }
}
