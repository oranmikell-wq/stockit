// InfoPopup.js — ⓘ info buttons + popup for financial terms

import { t } from '../utils/i18n.js?v=6';

let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'info-popup-overlay';
  overlay.className = 'info-popup-overlay';
  overlay.innerHTML = `
    <div class="info-popup-box">
      <button class="info-popup-close" aria-label="Close">✕</button>
      <h3 class="info-popup-title" id="info-popup-title"></h3>
      <p class="info-popup-body"  id="info-popup-body"></p>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
  overlay.querySelector('.info-popup-close').addEventListener('click', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  return overlay;
}

function show(key) {
  const ov = ensureOverlay();
  ov.querySelector('#info-popup-title').textContent = t('info_title_' + key);
  ov.querySelector('#info-popup-body').textContent  = t('info_body_'  + key);
  ov.classList.add('visible');
}

function hide() {
  overlay?.classList.remove('visible');
}

export function initInfoButtons(scope = document) {
  scope.querySelectorAll('.info-icon-btn[data-info]').forEach(btn => {
    if (btn._infoBound) return;
    btn._infoBound = true;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      show(btn.dataset.info);
    });
  });
}
