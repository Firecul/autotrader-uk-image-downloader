// ==UserScript==
// @name         AutoTrader UK - Download All Images
// @namespace    https://github.com/firecul/autotrader-uk-image-downloader
// @version      1.2.1
// @description  Adds a "Download All Images" button to AutoTrader UK car pages and saves the highest quality version of every gallery photo.
// @author       Firecul
// @license      MIT
// @homepageURL  https://github.com/firecul/autotrader-uk-image-downloader
// @supportURL   https://github.com/firecul/autotrader-uk-image-downloader/issues
// @match        https://www.autotrader.co.uk/car-details/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      atcdn.co.uk
// @connect      m.atcdn.co.uk
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false; // set to true to log what the script finds to the browser console
  const log = (...a) => DEBUG && console.log('[AT-DL]', ...a);

  const BTN_ID = 'at-dl-all-btn';
  // Size tokens to probe, in addition to the URL as found. '' = no size segment (original).
  const SIZE_CANDIDATES = ['', 'w2000', 'w1600', 'w1280', 'w1024', 'w800'];
  const CDN_RE = /https?:\/\/[a-z0-9.-]*atcdn\.co\.uk\/[^"'\\\s)<>,]+/gi;
  const GALLERY_SELECTORS = [
    '[data-testid="gallery"]',
    '[data-testid*="gallery" i]',
    '[class*="gallery" i]',
    'section[aria-label*="image" i]',
    'section[aria-label*="photo" i]',
  ];

  GM_addStyle(`
    #${BTN_ID}-wrap { margin: 8px 0; }
    #${BTN_ID} {
      cursor: pointer; padding: 10px 18px; font: 600 14px/1.2 system-ui, sans-serif;
      color: #fff; background: #1a1a1a; border: 0; border-radius: 6px;
    }
    #${BTN_ID}:hover { background: #333; }
    #${BTN_ID}[disabled] { opacity: .65; cursor: progress; }
    #${BTN_ID}-wrap.at-dl-fixed { position: fixed; right: 16px; bottom: 16px; z-index: 99999; margin: 0; }
  `);

  // ---------- URL handling ----------

  // Split a CDN URL into { prefix, file, key }. Anything between "media/" and the filename is a size token.
  function parseCdn(url) {
    url = String(url).replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    const m = url.match(/^(https?:\/\/[^/]+\/(?:[^/]+\/)*?media\/)(.+)$/i);
    if (!m) return null;
    const parts = m[2].split(/[?#]/)[0].split('/').filter(Boolean);
    const file = parts[parts.length - 1];
    if (!file || !/\.(jpe?g|png|webp)$/i.test(file)) return null;
    return { prefix: m[1], file, key: file.toLowerCase(), seen: url };
  }

  function toUrl(x) {
    if (typeof x === 'string') return parseCdn(x) ? x : null;
    if (x && typeof x === 'object') {
      for (const v of Object.values(x)) if (typeof v === 'string' && parseCdn(v)) return v;
    }
    return null;
  }

  function findGallery() {
    for (const sel of GALLERY_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function fromDom() {
    const root = findGallery() || document;
    const urls = [];
    root.querySelectorAll('img, source').forEach((el) => {
      ['src', 'data-src', 'srcset', 'data-srcset'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v) (v.match(CDN_RE) || []).forEach((u) => urls.push(u));
      });
    });
    return urls;
  }

  // Largest array of image URLs in the page's embedded JSON is almost certainly the advert's gallery.
  function fromNextData() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return [];
    let data;
    try { data = JSON.parse(el.textContent); } catch (e) { return []; }
    let best = [];
    (function walk(n) {
      if (Array.isArray(n)) {
        const urls = n.map(toUrl).filter(Boolean);
        if (urls.length > best.length && urls.length >= n.length * 0.9) best = urls;
        n.forEach(walk);
      } else if (n && typeof n === 'object') {
        Object.values(n).forEach(walk);
      }
    })(data);
    return best;
  }

  function collectStatic() {
    const domParsed = fromDom().map(parseCdn).filter(Boolean);
    const jsonParsed = fromNextData().map(parseCdn).filter(Boolean);
    const domKeys = new Set(domParsed.map((p) => p.key));

    // Prefer embedded JSON (full list), but only if it matches what's actually on screen
    // (guards against stale data after client-side navigation).
    let chosen = domParsed;
    if (jsonParsed.length && (!domKeys.size || jsonParsed.some((p) => domKeys.has(p.key)))) {
      chosen = jsonParsed;
    }
    log('JSON images:', jsonParsed.length, 'DOM images:', domParsed.length, 'using:', chosen === jsonParsed ? 'JSON' : 'DOM');

    const seen = new Set();
    return chosen.filter((p) => (seen.has(p.key) ? false : seen.add(p.key)));
  }

  // ---------- Gallery walking (for lazily loaded photos) ----------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const NEXT_SEL = 'button[aria-label*="next" i], [data-testid*="next" i], button[class*="next" i], [aria-label*="next" i]';
  const CLOSE_SEL = 'button[aria-label*="close" i], [data-testid*="close" i], button[class*="close" i]';

  function imgsIn(root) {
    const out = [];
    root.querySelectorAll('img, source').forEach((el) => {
      ['src', 'data-src', 'srcset', 'data-srcset'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v) (v.match(CDN_RE) || []).forEach((u) => out.push(u));
      });
    });
    return out.map(parseCdn).filter(Boolean);
  }

  function findDialog() {
    const sel = '[role="dialog"], [aria-modal="true"], [class*="lightbox" i], [class*="modal" i], [class*="fullscreen" i]';
    return [...document.querySelectorAll(sel)].find(
      (el) => el !== document.body && el !== document.documentElement && imgsIn(el).length
    ) || null;
  }

  function pressKey(key, code, keyCode) {
    const target = document.activeElement || document.body;
    ['keydown', 'keyup'].forEach((t) =>
      target.dispatchEvent(new KeyboardEvent(t, { key, code, keyCode, which: keyCode, bubbles: true }))
    );
  }

  async function walkGallery(btn) {
    const found = new Map();
    const root = findGallery();
    const addFrom = (el) => {
      let n = 0;
      imgsIn(el).forEach((p) => { if (!found.has(p.key)) { found.set(p.key, p); n++; } });
      return n;
    };
    if (!root) { log('walk: no gallery element'); return []; }
    addFrom(root);

    const opener = root.querySelector('img') || root.querySelector('button');
    if (!opener) return [...found.values()];
    (opener.closest('button, a, [role="button"]') || opener).click();
    await sleep(1000);

    let idle = 0;
    let openedDialog = null;
    for (let i = 0; i < 80 && idle < 4; i++) {
      openedDialog = findDialog() || openedDialog;
      const scope = openedDialog || root;
      btn.textContent = `Scanning gallery… ${found.size}`;
      idle = addFrom(scope) ? 0 : idle + 1;

      const next = scope.querySelector(NEXT_SEL) || document.querySelector(NEXT_SEL);
      if (next) next.click(); else pressKey('ArrowRight', 'ArrowRight', 39);
      await sleep(350);
    }
    log('walk: dialog found =', !!openedDialog, ', images seen =', found.size);

    // Close the viewer again
    const close = (openedDialog && openedDialog.querySelector(CLOSE_SEL)) || document.querySelector(CLOSE_SEL);
    if (close) close.click(); else pressKey('Escape', 'Escape', 27);
    await sleep(300);
    return [...found.values()];
  }

  // Every atcdn media URL anywhere in the page source (may include "similar cars" - only used with Shift-click)
  function pageWide() {
    return (document.documentElement.innerHTML.match(CDN_RE) || []).map(parseCdn).filter(Boolean);
  }

  async function collectImages(btn, allMode) {
    const stat = collectStatic();
    let walked = [];
    try {
      btn.textContent = 'Scanning gallery…';
      walked = await walkGallery(btn);
    } catch (e) {
      console.error('[AT-DL] gallery walk failed', e);
    }
    const wide = pageWide();

    const seen = new Set();
    const out = [];
    const add = (list) => list.forEach((p) => { if (!seen.has(p.key)) { seen.add(p.key); out.push(p); } });
    add(stat);
    add(walked);
    if (allMode) add(wide);

    log(`static: ${stat.length}, walked: ${walked.length}, page-wide (unique): ${new Set(wide.map((p) => p.key)).size}, using: ${out.length}${allMode ? ' (shift: page-wide included)' : ''}`);
    return out;
  }

  // ---------- Network ----------

  function gm(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({ timeout: 30000, ...opts, onload: resolve, onerror: reject, ontimeout: reject });
    });
  }

  // HEAD every candidate size and keep the one with the largest Content-Length.
  async function bestVersion(img) {
    const urls = new Set([img.seen]);
    SIZE_CANDIDATES.forEach((s) => urls.add(img.prefix + (s ? s + '/' : '') + img.file));

    const results = await Promise.all([...urls].map(async (url) => {
      try {
        const r = await gm({ method: 'HEAD', url });
        if (r.status !== 200) return null;
        const len = parseInt((/content-length:\s*(\d+)/i.exec(r.responseHeaders) || [])[1] || '0', 10);
        return { url, len };
      } catch (e) { return null; }
    }));

    const ok = results.filter(Boolean).sort((a, b) => b.len - a.len);
    log(img.file, '->', ok.map((o) => `${o.url} (${o.len})`));
    return ok.length ? ok[0].url : img.seen;
  }

  async function saveBlob(url, filename) {
    const r = await gm({ method: 'GET', url, responseType: 'blob' });
    if (r.status !== 200) throw new Error('HTTP ' + r.status + ' for ' + url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.response);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  }

  // ---------- Main action ----------

  function baseName() {
    const id = (location.pathname.match(/car-details\/(\d+)/) || [])[1] || 'car';
    const h1 = (document.querySelector('h1') || {}).textContent || document.title || 'autotrader';
    const slug = h1.trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'autotrader';
    return `${slug}_${id}`;
  }

  async function run(btn, allMode) {
    btn.disabled = true;
    const images = await collectImages(btn, allMode);
    if (!images.length) {
      alert('No gallery images found. To investigate, set DEBUG = true at the top of the script, reload, and check the browser console (F12) for [AT-DL] messages.');
      btn.textContent = 'Download All Images';
      btn.disabled = false;
      return;
    }
    btn.disabled = true;
    const name = baseName();
    const pad = String(images.length).length;
    let failed = 0;

    for (let i = 0; i < images.length; i++) {
      btn.textContent = `Downloading ${i + 1}/${images.length}…`;
      try {
        const url = await bestVersion(images[i]);
        const ext = (images[i].file.match(/\.(\w+)$/) || [, 'jpg'])[1].toLowerCase();
        await saveBlob(url, `${name}_${String(i + 1).padStart(pad, '0')}.${ext}`);
      } catch (e) {
        failed++;
        console.error('[AT-DL] failed', images[i], e);
      }
      await new Promise((r) => setTimeout(r, 400)); // be gentle, avoid browser multi-download blocking
    }

    btn.textContent = failed ? `Done (${failed} failed) - see console` : `Done - ${images.length} images`;
    setTimeout(() => { btn.textContent = 'Download All Images'; btn.disabled = false; }, 4000);
  }

  // ---------- UI ----------

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    const wrap = document.createElement('div');
    wrap.id = BTN_ID + '-wrap';
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Download All Images';
    btn.addEventListener('click', (e) => run(btn, e.shiftKey));
    wrap.appendChild(btn);

    const gallery = findGallery();
    if (gallery && gallery.parentNode) {
      gallery.parentNode.insertBefore(wrap, gallery);
    } else {
      wrap.classList.add('at-dl-fixed'); // fallback: floating button
      document.body.appendChild(wrap);
    }
  }

  // Page is a SPA / hydrates late: keep the button present.
  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const existing = document.getElementById(BTN_ID + '-wrap');
      // If we're floating but a gallery has since appeared, move next to it.
      if (existing && existing.classList.contains('at-dl-fixed') && findGallery()) existing.remove();
      ensureButton();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ensureButton();
})();