// CompanyCard.js — Company overview block between gauge and info cards

import { t } from '../utils/i18n.js?v=6';

function fmtEmployees(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch { return url; }
}

export function renderCompanyCard(container, data) {
  if (!container) return;
  const { name, symbol, sector, industry, description, employees, website, country, exchange } = data || {};

  const chips = [
    sector   ? `<span class="cc-chip">${sector}</span>`   : '',
    industry ? `<span class="cc-chip">${industry}</span>` : '',
    country  ? `<span class="cc-chip">${country}</span>`  : '',
    exchange ? `<span class="cc-chip">${exchange}</span>` : '',
  ].filter(Boolean).join('');

  const stats = [
    employees != null ? `<div class="cc-stat"><span class="cc-stat-label">${t('cc_employees')}</span><span class="cc-stat-val">${fmtEmployees(employees)}</span></div>` : '',
    website   ? `<div class="cc-stat"><span class="cc-stat-label">${t('cc_website')}</span><a class="cc-stat-val cc-link" href="${website}" target="_blank" rel="noopener">${fmtDomain(website)}</a></div>` : '',
  ].filter(Boolean).join('');

  // Hide entirely when no meaningful content
  if (!chips && !stats && !description) {
    container.innerHTML = '';
    return;
  }

  const descHtml = description
    ? `<p class="cc-desc" id="cc-desc-text">${description}</p>
       <button class="cc-toggle" id="cc-toggle" onclick="
         const el=document.getElementById('cc-desc-text');
         const btn=document.getElementById('cc-toggle');
         el.classList.toggle('cc-desc-expanded');
         btn.textContent=el.classList.contains('cc-desc-expanded')?'${t('cc_less')}':'${t('cc_more')}';
       ">${t('cc_more')}</button>`
    : '';

  container.innerHTML = `
    <div class="cc-card">
      <div class="cc-top">
        <div class="cc-chips">${chips}</div>
        ${stats}
      </div>
      ${descHtml}
    </div>`;
}
