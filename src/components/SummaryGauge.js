// SummaryGauge.js — Animated SVG speedometer gauge

import { t } from '../utils/i18n.js?v=6';
import { initInfoButtons } from './InfoPopup.js';

// ── SVG geometry constants ────────────────────────────────
const CX = 150, CY = 158, R = 110;
const DASHLEN = Math.PI * R; // full semicircle arc length ≈ 345.58

// ═════════════════════════════════════════════════════════
// COLOR HELPERS
// ═════════════════════════════════════════════════════════

function lerpColor(hex1, hex2, t) {
  const parse = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = parse(hex1);
  const [r2,g2,b2] = parse(hex2);
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

/** Returns a zone color for scores 0 → 100 (5-color: deep-red / orange / amber / green / deep-green) */
function scoreToColor(score) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  if (s < 18) return '#dc2626';                                          // deep red
  if (s < 22) return lerpColor('#dc2626', '#f97316', (s - 18) / 4);     // red → orange
  if (s < 39) return '#f97316';                                          // orange
  if (s < 43) return lerpColor('#f97316', '#f59e0b', (s - 39) / 4);     // orange → amber
  if (s < 64) return '#f59e0b';                                          // amber
  if (s < 68) return lerpColor('#f59e0b', '#22c55e', (s - 64) / 4);     // amber → green
  if (s < 79) return '#22c55e';                                          // light green
  if (s < 83) return lerpColor('#22c55e', '#16a34a', (s - 79) / 4);     // green → deep green
  return '#16a34a';                                                       // deep green
}

// ═════════════════════════════════════════════════════════
// SVG BUILDER
// ═════════════════════════════════════════════════════════

/** Point on the semicircle arc at a given score (0-100) */
function pointOnArc(score, radius = R) {
  const angle = Math.PI * (1 - score / 100);
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function buildGaugeSVG() {
  const svg = el('svg', { viewBox: '0 0 300 180', fill: 'none', class: 'sg-svg' });

  // ── Gradient definition ──
  const defs = el('defs');
  // Glow filter
  defs.innerHTML = `
    <filter id="sg-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="sg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#dc2626"/>
      <stop offset="20%"  stop-color="#f97316"/>
      <stop offset="41%"  stop-color="#f59e0b"/>
      <stop offset="66%"  stop-color="#22c55e"/>
      <stop offset="81%"  stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#16a34a"/>
    </linearGradient>`;
  svg.appendChild(defs);

  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  // ── Background track ──
  svg.appendChild(el('path', {
    d: arcPath, stroke: 'var(--sg-track)', 'stroke-width': '20',
    'stroke-linecap': 'round',
  }));

  // ── Zone separators at 45 and 70 ──
  for (const tick of [41, 66]) {
    const inner = pointOnArc(tick, R - 13);
    const outer = pointOnArc(tick, R + 12);
    svg.appendChild(el('line', {
      x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
      stroke: 'var(--sg-sep)', 'stroke-width': '2.5', 'stroke-linecap': 'round',
    }));
  }

  // ── Score arc (animated via JS) ──
  const arc = el('path', {
    id: 'sg-arc', d: arcPath,
    stroke: '#dc2626', 'stroke-width': '20', 'stroke-linecap': 'round',
    filter: 'url(#sg-glow)',
  });
  arc.style.strokeDasharray  = DASHLEN;
  arc.style.strokeDashoffset = DASHLEN;
  svg.appendChild(arc);

  // ── Scale label: single bull emoji at right end of arc (score 100) ──
  const bullLabel = el('text', {
    x: CX + R + 2, y: CY + 20, 'text-anchor': 'middle', 'font-size': '18',
    'font-family': 'Inter, Rubik, sans-serif',
  });
  bullLabel.textContent = '🐂';
  svg.appendChild(bullLabel);

  // ── Zone labels: Bearish / Neutral / Bullish ──
  const zoneData = [
    { pct: 20, text: t('zone_bearish') },
    { pct: 53, text: t('zone_neutral') },
    { pct: 83, text: t('zone_bullish') },
  ];
  for (const { pct, text } of zoneData) {
    const pt = pointOnArc(pct, R - 32);
    const zt = el('text', {
      x: pt.x, y: pt.y, 'text-anchor': 'middle', 'font-size': '8.5',
      'font-weight': '600', 'font-family': 'Inter, Rubik, sans-serif',
      fill: 'var(--sg-zone)',
    });
    zt.textContent = text;
    svg.appendChild(zt);
  }

  // ── Needle ──
  const startPt = pointOnArc(0, 85);
  const needle = el('line', {
    id: 'sg-needle',
    x1: CX, y1: CY, x2: startPt.x, y2: startPt.y,
    stroke: 'var(--sg-needle)', 'stroke-width': '2.5', 'stroke-linecap': 'round',
  });
  svg.appendChild(needle);

  // ── Center hub ──
  svg.appendChild(el('circle', {
    cx: CX, cy: CY, r: '7', fill: 'var(--sg-hub)',
  }));
  svg.appendChild(el('circle', {
    cx: CX, cy: CY, r: '3.5', fill: 'var(--sg-hub-inner)',
  }));

  // ── Score number (animates via JS) ──
  const scoreText = el('text', {
    id: 'sg-score-text', x: CX, y: CY - 22,
    'text-anchor': 'middle', 'font-size': '38', 'font-weight': '800',
    'font-family': 'Inter, Rubik, sans-serif', fill: '#dc2626',
  });
  scoreText.textContent = '0';
  svg.appendChild(scoreText);

  return svg;
}

// ═════════════════════════════════════════════════════════
// ANIMATION ENGINE  (requestAnimationFrame, ease-out-cubic)
// ═════════════════════════════════════════════════════════

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animateGauge(svg, targetScore, bulls, duration = 1300) {
  if (targetScore == null) return;
  const arc       = svg.querySelector('#sg-arc');
  const needle    = svg.querySelector('#sg-needle');
  const scoreText = svg.querySelector('#sg-score-text');
  if (!arc || !needle || !scoreText) return;

  // Show bull emoji immediately (static); needle + arc animate
  if (bulls != null) {
    scoreText.textContent = '🐂'.repeat(bulls);
    scoreText.setAttribute('font-size', bulls >= 4 ? '20' : '22');
    scoreText.setAttribute('y', CY - 18);
    scoreText.setAttribute('fill', scoreToColor(targetScore));
  }

  let startTime = null;

  function frame(ts) {
    if (document.hidden) {
      startTime = null;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) requestAnimationFrame(frame);
      }, { once: true });
      return;
    }

    if (!startTime) startTime = ts;
    const progress = Math.min(1, (ts - startTime) / duration);
    const eased    = easeOutCubic(progress);
    const current  = targetScore * eased;
    const color    = scoreToColor(current);

    arc.style.strokeDashoffset = DASHLEN * (1 - current / 100);
    arc.setAttribute('stroke', color);

    const pt = pointOnArc(current, 85);
    needle.setAttribute('x2', pt.x);
    needle.setAttribute('y2', pt.y);

    if (bulls == null) {
      scoreText.textContent = Math.round(current);
      scoreText.setAttribute('fill', color);
    } else {
      scoreText.setAttribute('fill', color);
    }

    const glowSize    = Math.round(3 + eased * 6);
    const glowOpacity = (0.15 + eased * 0.20).toFixed(2);
    const glowColor   = color.replace('rgb(', 'rgba(').replace(')', `,${glowOpacity})`);
    arc.style.filter  = `drop-shadow(0 0 ${glowSize}px ${glowColor})`;

    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ═════════════════════════════════════════════════════════
// BREAKDOWN BARS
// ═════════════════════════════════════════════════════════

// 4-family breakdown factors
const FAMILY_FACTORS = [
  { key: 'growth',    i18n: 'analysisFamilyGrowth',    weight: 0.35 },
  { key: 'valuation', i18n: 'analysisFamilyValuation',  weight: 0.25 },
  { key: 'quality',   i18n: 'analysisFamilyQuality',    weight: 0.20 },
  { key: 'technical', i18n: 'analysisFamilyTechnical',  weight: 0.20 },
];

function buildBreakdown(families) {
  const wrap = document.createElement('div');
  wrap.className = 'sg-breakdown';

  FAMILY_FACTORS.forEach(({ key, i18n, weight }, idx) => {
    const label  = t(i18n);
    const wLabel = `${Math.round(weight * 100)}%`;
    const score  = families?.[key] != null ? Math.round(families[key]) : null;
    const color  = score != null ? scoreToColor(score) : '#cbd5e1';

    const row = document.createElement('div');
    row.className = 'sg-row';
    row.innerHTML = `
      <div class="sg-row-meta">
        <span class="sg-name-btn">
          <span class="sg-factor-name">${label}</span>
        </span>
      </div>
      <div class="sg-bar-track">
        <div class="sg-bar-fill" style="width:0%;background:${color}" data-target="${score ?? 0}"></div>
      </div>
      <span class="sg-factor-score" style="color:${score != null ? color : 'var(--text-3)'}">${score ?? '—'}</span>`;

    wrap.appendChild(row);

    if (score != null) {
      const bar = row.querySelector('.sg-bar-fill');
      setTimeout(() => {
        bar.style.transition = 'width 1.1s cubic-bezier(0.34,1.2,0.64,1)';
        bar.style.width = `${score}%`;
      }, 120 + idx * 80);
    }
  });

  return wrap;
}

// ═════════════════════════════════════════════════════════
// MAIN RENDER  (public API)
// ═════════════════════════════════════════════════════════

const BADGE_META = {
  buy:  { key: 'buy',  cls: 'sg-badge-buy'  },
  wait: { key: 'wait', cls: 'sg-badge-wait' },
  sell: { key: 'sell', cls: 'sg-badge-sell' },
};

/**
 * Render the animated SummaryGauge into `container`.
 * Accepts the scored object from calcScore (4-family model).
 *
 * @param {HTMLElement} container
 * @param {{ score, rating, isPartial, families }} scored
 */
export function renderSummaryGauge(container, scored) {
  if (!container) return;
  container.innerHTML = '';

  const { score, rating, isPartial, families } = scored || {};
  const badge = BADGE_META[rating] || BADGE_META.wait;

  // Card shell
  const card = document.createElement('div');
  card.className = 'sg-card';

  card.innerHTML = `
    <div class="sg-header">
      <span class="sg-badge ${badge.cls}">${t(badge.key)}</span>
    </div>`;

  // Body: SVG + breakdown (flex)
  const body = document.createElement('div');
  body.className = 'sg-body';

  const svgWrap = document.createElement('div');
  svgWrap.className = 'sg-svg-wrap';

  const svg = buildGaugeSVG();
  svgWrap.appendChild(svg);

  if (isPartial) {
    const note = document.createElement('p');
    note.className = 'sg-partial';
    note.textContent = t('partialDataWarn');
    svgWrap.appendChild(note);
  }

  if (score == null) {
    const na = document.createElement('p');
    na.className = 'sg-no-data';
    na.textContent = t('notEnoughData');
    svgWrap.appendChild(na);
  }

  body.appendChild(svgWrap);
  card.appendChild(body);
  container.appendChild(card);

  requestAnimationFrame(() => animateGauge(svg, score ?? 0, scored?.bulls ?? null));

  initInfoButtons(card);
}
