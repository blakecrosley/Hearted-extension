'use strict';

(function () {
  const PANEL_ID = '__gh_harvest_host';
  const STORAGE_KEY_POS = '_gh_pos';
  const STORAGE_KEY_MIN = '_gh_min';
  const STORAGE_KEY_SLUGS = '_gh_slugs';
  const STORAGE_KEY_KNOWN = '_gh_known';

  // Only activate on search results or CAPTCHA pages
  if (!window.location.pathname.startsWith('/search') &&
      !window.location.pathname.startsWith('/sorry')) return;

  // Prevent duplicate injection
  if (document.getElementById(PANEL_ID)) return;

  // --- Shadow DOM host ---
  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // --- Styles ---
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      font-size: 13px;
      color: #e0e0e0;
      line-height: 1.4;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 320px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      z-index: 2147483647;
      transition: border-color 0.3s;
    }

    .panel.done-state {
      border-color: rgba(76, 175, 80, 0.5);
    }

    .panel.minimized .panel-body,
    .panel.minimized .panel-footer,
    .panel.minimized .status-bar,
    .panel.minimized .session-summary,
    .panel.minimized .progress-wrap { display: none; }

    .panel.minimized { width: auto; border-radius: 20px; }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      cursor: grab;
      user-select: none;
    }

    .panel-header:active { cursor: grabbing; }

    .panel-title {
      font-size: 13px;
      font-weight: 600;
      background: linear-gradient(135deg, #4caf50 0%, #00bcd4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      flex: 1;
      white-space: nowrap;
    }

    .panel-count {
      font-size: 10px;
      background: rgba(76, 175, 80, 0.3);
      color: #4caf50;
      padding: 1px 7px;
      border-radius: 8px;
      white-space: nowrap;
    }

    .panel-count.has-new {
      background: rgba(233, 30, 99, 0.3);
      color: #e91e63;
    }

    .run-btn {
      background: none;
      border: 1px solid rgba(76,175,80,0.4);
      color: #4caf50;
      cursor: pointer;
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 6px;
      font-family: inherit;
      font-weight: 600;
      transition: all 0.15s;
    }

    .run-btn:hover { background: rgba(76,175,80,0.15); }

    .run-btn.running {
      border-color: rgba(255,152,0,0.4);
      color: #ff9800;
      animation: glow 1.5s ease-in-out infinite;
    }

    .run-btn.complete {
      border-color: rgba(76,175,80,0.6);
      color: #4caf50;
      background: rgba(76,175,80,0.15);
    }

    @keyframes glow {
      0%, 100% { box-shadow: 0 0 4px rgba(255,152,0,0.2); }
      50% { box-shadow: 0 0 12px rgba(255,152,0,0.4); }
    }

    .header-btn {
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1;
      font-family: inherit;
    }

    .header-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }

    /* --- Progress bar --- */
    .progress-wrap {
      height: 3px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #4caf50, #00bcd4);
      transition: width 0.4s ease;
    }

    .progress-bar.scanning {
      background: linear-gradient(90deg, #ff9800, #ff5722);
      animation: shimmer 1.5s ease-in-out infinite;
    }

    @keyframes shimmer {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }

    /* --- Status --- */
    .status-bar {
      padding: 8px 14px;
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 32px;
    }

    .status-bar .page-num { color: #00bcd4; font-weight: 600; }

    .status-text { text-align: right; }

    .status-text.scanning { color: #ff9800; }
    .status-text.ready { color: #4caf50; font-weight: 600; }
    .status-text.next-page {
      color: #4caf50;
      font-weight: 700;
      font-size: 12px;
      animation: pulse 1s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .session-summary {
      padding: 8px 14px;
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .session-summary strong { color: #4caf50; }

    /* --- Slug list --- */
    .panel-body {
      max-height: 300px;
      overflow-y: auto;
      padding: 4px 0;
    }

    .panel-body::-webkit-scrollbar { width: 4px; }
    .panel-body::-webkit-scrollbar-track { background: transparent; }
    .panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

    .slug-item {
      padding: 5px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 12px;
      transition: background 0.3s;
    }

    .slug-item:last-child { border-bottom: none; }
    .slug-item.is-new { background: rgba(76, 175, 80, 0.08); }
    .slug-item.is-known { opacity: 0.35; }
    .slug-item.just-found { animation: fadeIn 0.4s ease; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .slug-name {
      flex: 1;
      font-family: 'SF Mono', 'Menlo', monospace;
      font-size: 11px;
      color: rgba(255,255,255,0.8);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .slug-badge {
      font-size: 9px;
      padding: 1px 6px;
      border-radius: 6px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .slug-badge.new { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
    .slug-badge.known { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.35); }

    .panel-footer {
      padding: 8px 14px;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      gap: 6px;
    }

    .footer-btn {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.7);
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      text-align: center;
      transition: all 0.15s;
    }

    .footer-btn:hover { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255,255,255,0.3); }

    .footer-btn.primary {
      background: rgba(76, 175, 80, 0.15);
      color: #4caf50;
      border-color: rgba(76, 175, 80, 0.3);
    }

    .footer-btn.primary:hover { background: rgba(76, 175, 80, 0.25); }

    .footer-btn.danger { color: rgba(244, 67, 54, 0.7); border-color: rgba(244, 67, 54, 0.2); }
    .footer-btn.danger:hover { background: rgba(244, 67, 54, 0.1); color: #f44336; }

    .empty-state {
      padding: 20px 14px;
      text-align: center;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
    }
  `);
  shadow.adoptedStyleSheets = [sheet];

  // --- State ---
  let allSlugs = {};
  let knownSlugs = new Set();
  let currentPage = 1;
  let pagesScraped = 0;
  let thisPageSlugs = [];
  let isRunning = false;
  let autoAdvance = true;
  let maxPages = 50;  // safety cap
  let lastUrl = window.location.href;

  // --- Build panel ---
  const panel = document.createElement('div');
  panel.className = 'panel';

  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">🌱 ATS Harvest</span>
      <span class="panel-count">0</span>
      <button class="run-btn">▶ Run</button>
      <button class="header-btn min-btn" title="Minimize">−</button>
    </div>
    <div class="progress-wrap"><div class="progress-bar"></div></div>
    <div class="status-bar">
      <span>Page <span class="page-num">—</span></span>
      <span class="status-text">Ready — hit Run</span>
    </div>
    <div class="session-summary">
      Session: <strong>0</strong> new / 0 total across 0 pages
    </div>
    <div class="panel-body">
      <div class="empty-state">Hit ▶ Run to scan this page</div>
    </div>
    <div class="panel-footer">
      <button class="footer-btn primary auto-btn">Auto: ON</button>
      <button class="footer-btn export-btn">Copy New</button>
      <button class="footer-btn danger clear-btn">Reset</button>
    </div>
  `;

  shadow.appendChild(panel);

  // --- Element refs ---
  const countEl = panel.querySelector('.panel-count');
  const pageNumEl = panel.querySelector('.page-num');
  const statusEl = panel.querySelector('.status-text');
  const summaryEl = panel.querySelector('.session-summary');
  const bodyEl = panel.querySelector('.panel-body');
  const progressBar = panel.querySelector('.progress-bar');
  const runBtn = panel.querySelector('.run-btn');
  const minBtn = panel.querySelector('.min-btn');
  const exportBtn = panel.querySelector('.export-btn');
  const autoBtn = panel.querySelector('.auto-btn');
  const clearBtn = panel.querySelector('.clear-btn');

  // --- Helpers ---
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function setProgress(pct, scanning) {
    progressBar.style.width = pct + '%';
    progressBar.classList.toggle('scanning', !!scanning);
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status-text' + (cls ? ' ' + cls : '');
  }

  function updateCount() {
    const total = Object.keys(allSlugs).length;
    const newCount = Object.values(allSlugs).filter(v => v.new).length;
    countEl.textContent = newCount > 0 ? `${newCount} new` : `${total}`;
    countEl.classList.toggle('has-new', newCount > 0);
  }

  function updateSummary() {
    const total = Object.keys(allSlugs).length;
    const newCount = Object.values(allSlugs).filter(v => v.new).length;
    summaryEl.innerHTML = `Session: <strong>${newCount}</strong> new / ${total} total across ${pagesScraped} pages`;
  }

  // --- CAPTCHA detection ---
  function isCaptchaPage() {
    return document.body.innerText.includes('unusual traffic') ||
           document.body.innerText.includes('not a robot') ||
           document.querySelector('iframe[src*="recaptcha"]') !== null ||
           window.location.pathname === '/sorry/index';
  }

  function watchForCaptchaClear() {
    setStatus('⚠ CAPTCHA — solve it, I\'ll wait...', 'scanning');
    runBtn.textContent = '⏸ Waiting';
    runBtn.classList.add('running');
    panel.classList.remove('done-state');
    setProgress(0, true);

    // Poll every 2s — when the page reloads with results, auto-run
    const poll = setInterval(() => {
      if (!isCaptchaPage() && document.querySelector('a[href*="greenhouse"]')) {
        clearInterval(poll);
        console.log('[GH Harvest] CAPTCHA cleared, resuming');
        setStatus('CAPTCHA cleared — scanning...', 'scanning');
        runBtn.classList.remove('running');
        setTimeout(() => runScan(), 500);
      }
    }, 2000);

    // Also watch for full page navigation (CAPTCHA solve triggers redirect)
    const navCheck = setInterval(() => {
      if (!isCaptchaPage()) {
        clearInterval(navCheck);
        clearInterval(poll);
        // Page changed — if it's search results, the auto-run on load will handle it
      }
    }, 1000);
  }

  function detectPageNumber() {
    const params = new URLSearchParams(window.location.search);
    const start = parseInt(params.get('start') || '0');
    return Math.floor(start / 10) + 1;
  }

  function findNextPageLink() {
    // Google pagination — try every known pattern

    // 1. #pnnext — classic Google "Next" ID
    const byId = document.getElementById('pnnext');
    if (byId) return byId;

    // 2. aria-label patterns
    for (const label of ['Next page', 'Next', 'More results']) {
      const el = document.querySelector(`a[aria-label="${label}"]`);
      if (el) return el;
    }

    // 3. Any link whose visible text is "Next" (case-insensitive)
    const allLinks = document.querySelectorAll('a[href*="/search"]');
    for (const a of allLinks) {
      const text = a.textContent.trim().toLowerCase();
      if (text === 'next' || text === 'next ›' || text === '›') return a;
    }

    // 4. Find the current page number and look for page+1
    const currentStart = parseInt(new URLSearchParams(window.location.search).get('start') || '0');
    const nextStart = currentStart + 10;
    const nextPageLink = document.querySelector(`a[href*="start=${nextStart}"]`);
    if (nextPageLink) return nextPageLink;

    // 5. Navigation container — grab the last pagination link
    const navContainers = document.querySelectorAll('[role="navigation"], #botstuff, table#nav');
    for (const nav of navContainers) {
      const links = [...nav.querySelectorAll('a[href*="start="]')];
      if (links.length > 0) return links[links.length - 1];
    }

    // 6. Any "start=" link with a higher start value than current
    const candidates = [...document.querySelectorAll('a[href*="start="]')];
    for (const a of candidates) {
      const m = a.href.match(/[?&]start=(\d+)/);
      if (m && parseInt(m[1]) > currentStart) return a;
    }

    return null;
  }

  // --- ATS domain patterns ---
  // Each pattern: regex to extract slug from URL, and the source name for sk1ff
  const ATS_PATTERNS = [
    { regex: /(?:job-boards|boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/, source: 'greenhouse', exclude: ['embed'] },
    { regex: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/, source: 'lever', exclude: [] },
    { regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/, source: 'ashby', exclude: [] },
    { regex: /([a-zA-Z0-9_-]+)\.recruitee\.com/, source: 'recruitee', exclude: ['www', 'app', 'api'] },
    { regex: /apply\.workable\.com\/([a-zA-Z0-9_-]+)/, source: 'workable', exclude: [] },
    { regex: /([a-zA-Z0-9_-]+)\.bamboohr\.com\/(?:careers|jobs)/, source: 'bamboohr', exclude: ['www'] },
  ];

  function detectAtsFromQuery() {
    const q = new URLSearchParams(window.location.search).get('q') || '';
    for (const p of ATS_PATTERNS) {
      if (q.includes(p.source) || q.includes(p.regex.source.split('\\.')[0])) return p;
    }
    // Default: match any pattern found on the page
    return null;
  }

  // --- Scrape all ATS links currently visible ---
  function scrapeVisibleLinks() {
    const links = document.querySelectorAll('a[href]');
    const found = [];
    const seen = new Set(thisPageSlugs);

    links.forEach(a => {
      const href = a.href || '';
      for (const pattern of ATS_PATTERNS) {
        const m = href.match(pattern.regex);
        if (m && !pattern.exclude.includes(m[1])) {
          const slug = m[1].toLowerCase();
          if (!seen.has(slug)) {
            seen.add(slug);
            found.push({ slug, source: pattern.source });
            thisPageSlugs.push(slug);
            if (!allSlugs[slug]) {
              allSlugs[slug] = { new: !knownSlugs.has(slug), page: currentPage, source: pattern.source };
            }
          }
          break; // matched, don't try other patterns
        }
      }
    });

    return found;
  }

  // --- Render slug list ---
  function renderSlugs(justFound) {
    const justSet = new Set(justFound || []);
    const thisPageSet = new Set(thisPageSlugs);
    const otherSlugs = Object.entries(allSlugs).filter(([s]) => !thisPageSet.has(s));

    if (Object.keys(allSlugs).length === 0) {
      bodyEl.innerHTML = '<div class="empty-state">Hit ▶ Run to scan this page</div>';
      return;
    }

    let html = '';

    // This page — new first, then known
    const thisNew = thisPageSlugs.filter(s => allSlugs[s]?.new);
    const thisKnown = thisPageSlugs.filter(s => !allSlugs[s]?.new);

    [...thisNew, ...thisKnown].forEach(slug => {
      const info = allSlugs[slug];
      const cls = (info?.new ? 'is-new' : 'is-known') + (justSet.has(slug) ? ' just-found' : '');
      const badge = info?.new
        ? '<span class="slug-badge new">NEW</span>'
        : '<span class="slug-badge known">KNOWN</span>';
      html += `<div class="slug-item ${cls}">${badge}<span class="slug-name">${slug}</span></div>`;
    });

    // Previous pages
    if (otherSlugs.length > 0) {
      const newOthers = otherSlugs.filter(([_, v]) => v.new);
      const knownOthers = otherSlugs.filter(([_, v]) => !v.new);

      newOthers.forEach(([slug]) => {
        html += `<div class="slug-item is-new"><span class="slug-badge new">NEW</span><span class="slug-name">${slug}</span></div>`;
      });

      if (knownOthers.length > 0) {
        html += `<div class="slug-item is-known"><span class="slug-name" style="color:rgba(255,255,255,0.3)">+ ${knownOthers.length} known from prev pages</span></div>`;
      }
    }

    bodyEl.innerHTML = html;
  }

  // --- THE RUNNER ---
  async function runScan() {
    if (isRunning) return;
    isRunning = true;

    currentPage = detectPageNumber();
    pageNumEl.textContent = currentPage;
    thisPageSlugs = [];

    runBtn.textContent = '⏳ Scanning';
    runBtn.classList.add('running');
    runBtn.classList.remove('complete');
    panel.classList.remove('done-state');

    // Step 1: Initial scrape at top
    setStatus('Scanning top of page...', 'scanning');
    setProgress(10, true);
    await sleep(300);

    let found = scrapeVisibleLinks();
    renderSlugs(found.map(f => f.slug));
    updateCount();

    // Step 2: Scroll down in chunks, scraping as we go
    const scrollHeight = document.documentElement.scrollHeight;
    const viewHeight = window.innerHeight;
    const steps = Math.ceil(scrollHeight / (viewHeight * 0.6));
    const totalSteps = steps + 2; // +2 for top scrape and final check

    for (let i = 1; i <= steps; i++) {
      const target = Math.min((viewHeight * 0.6) * i, scrollHeight);
      window.scrollTo({ top: target, behavior: 'smooth' });

      const pct = Math.round(((i + 1) / totalSteps) * 90);
      setProgress(pct, true);
      setStatus(`Scrolling... ${thisPageSlugs.length} found so far`, 'scanning');

      await sleep(400 + Math.random() * 200); // human-ish timing

      const newFound = scrapeVisibleLinks();
      if (newFound.length > 0) {
        renderSlugs(newFound.map(f => f.slug));
        updateCount();
      }
    }

    // Step 3: Final scrape at bottom
    setProgress(95, true);
    setStatus('Final sweep...', 'scanning');
    await sleep(500);

    const finalFound = scrapeVisibleLinks();
    if (finalFound.length > 0) {
      renderSlugs(finalFound.map(f => f.slug));
      updateCount();
    }

    // Step 4: Scroll back to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await sleep(400);

    // Step 5: Complete
    pagesScraped = Math.max(pagesScraped, currentPage);
    setProgress(100, false);

    browser.storage.local.set({ [STORAGE_KEY_SLUGS]: allSlugs });
    updateSummary();

    const newOnPage = thisPageSlugs.filter(s => allSlugs[s]?.new).length;
    const totalOnPage = thisPageSlugs.length;

    runBtn.classList.remove('running');
    isRunning = false;

    if (totalOnPage === 0) {
      setStatus('No greenhouse links found', '');
      runBtn.textContent = '▶ Run';
    } else if (autoAdvance && currentPage < maxPages) {
      // Auto-advance with human-like delay
      const delay = 2000 + Math.random() * 2000; // 2-4s
      setStatus(`✓ ${totalOnPage} found, ${newOnPage} new — next in ${(delay/1000).toFixed(0)}s...`, 'next-page');
      runBtn.textContent = '⏭ Next';
      panel.classList.add('done-state');

      await sleep(delay);

      // Find and click Google's "Next" button
      const nextLink = findNextPageLink();
      if (nextLink) {
        setStatus('Clicking next...', 'scanning');
        console.log('[GH Harvest] Found next link:', nextLink.href, nextLink.textContent.trim());
        // Navigate via href directly as a fallback if click doesn't trigger nav
        const href = nextLink.href;
        nextLink.click();
        // If still on same page after 2s, force navigate
        setTimeout(() => {
          if (window.location.href === lastUrl) {
            console.log('[GH Harvest] Click did not navigate, forcing:', href);
            window.location.href = href;
          }
        }, 2000);
      } else {
        console.log('[GH Harvest] No next link found');
        setStatus(`✓ ${totalOnPage} found — no more pages`, 'ready');
        runBtn.textContent = '✓ Done';
      }
    } else if (currentPage >= maxPages) {
      setStatus(`✓ Done — hit ${maxPages} page cap`, 'ready');
      runBtn.textContent = '✓ Done';
      runBtn.classList.add('complete');
      panel.classList.add('done-state');
    } else {
      setStatus(`✓ ${totalOnPage} found, ${newOnPage} new → NEXT PAGE`, 'next-page');
      runBtn.textContent = '✓ Done';
      runBtn.classList.add('complete');
      panel.classList.add('done-state');
    }

    // Auto-send to backend — group by source
    if (thisPageSlugs.length > 0) {
      const bySource = {};
      for (const slug of thisPageSlugs) {
        const src = allSlugs[slug]?.source || 'greenhouse';
        if (!bySource[src]) bySource[src] = { slugs: [], new_slugs: [] };
        bySource[src].slugs.push(slug);
        if (allSlugs[slug]?.new) bySource[src].new_slugs.push(slug);
      }

      for (const [src, data] of Object.entries(bySource)) {
        try {
          const resp = await browser.runtime.sendMessage({
            action: 'captureGreenhouseSlugs',
            data: {
              slugs: data.slugs,
              new_slugs: data.new_slugs,
              source: src,
              page: currentPage,
              query: new URLSearchParams(window.location.search).get('q') || '',
            }
          });
          if (resp?.success) {
            console.log(`[GH Harvest] Sent ${data.slugs.length} ${src} slugs to backend`);
          }
        } catch (e) {
          console.warn(`[GH Harvest] Backend send failed for ${src}:`, e);
        }
      }
    }
  }

  // --- Event listeners ---

  // Dragging
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  panel.querySelector('.panel-header').addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    dragOffset.x = e.clientX - panel.offsetLeft;
    dragOffset.y = e.clientY - panel.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panel.style.right = 'auto';
    panel.style.left = (e.clientX - dragOffset.x) + 'px';
    panel.style.top = (e.clientY - dragOffset.y) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    browser.storage.local.set({
      [STORAGE_KEY_POS]: { x: panel.offsetLeft, y: parseInt(panel.style.top) }
    });
  });

  // Run button
  runBtn.addEventListener('click', () => {
    if (!isRunning) {
      runBtn.textContent = '▶ Run';
      runBtn.classList.remove('complete');
      runScan();
    }
  });

  // Minimize
  minBtn.addEventListener('click', () => {
    const isMin = panel.classList.toggle('minimized');
    minBtn.textContent = isMin ? '+' : '−';
    browser.storage.local.set({ [STORAGE_KEY_MIN]: isMin });
  });

  // Auto-advance toggle
  autoBtn.addEventListener('click', () => {
    autoAdvance = !autoAdvance;
    autoBtn.textContent = autoAdvance ? 'Auto: ON' : 'Auto: OFF';
    autoBtn.classList.toggle('primary', autoAdvance);
  });

  // Export new
  exportBtn.addEventListener('click', () => {
    const newSlugs = Object.entries(allSlugs).filter(([_, v]) => v.new).map(([s]) => s);
    if (newSlugs.length === 0) {
      exportBtn.textContent = 'None new';
      setTimeout(() => { exportBtn.textContent = 'Copy New'; }, 1500);
      return;
    }
    navigator.clipboard.writeText(newSlugs.join('\n'));
    exportBtn.textContent = `Copied ${newSlugs.length}`;
    setTimeout(() => { exportBtn.textContent = 'Copy New'; }, 2000);
  });

  // Reset
  clearBtn.addEventListener('click', () => {
    allSlugs = {};
    thisPageSlugs = [];
    pagesScraped = 0;
    browser.storage.local.remove(STORAGE_KEY_SLUGS);
    renderSlugs();
    updateSummary();
    updateCount();
    setProgress(0, false);
    setStatus('Ready — hit Run', '');
    runBtn.textContent = '▶ Run';
    runBtn.classList.remove('complete');
    panel.classList.remove('done-state');
    countEl.textContent = '0';
  });

  // --- Load known slugs ---
  async function loadKnownSlugs() {
    const stored = await browser.storage.local.get(STORAGE_KEY_KNOWN);
    if (stored[STORAGE_KEY_KNOWN] && stored[STORAGE_KEY_KNOWN].length > 100) {
      return new Set(stored[STORAGE_KEY_KNOWN]);
    }
    try {
      const url = browser.runtime.getURL('gh-known-slugs.json');
      const resp = await fetch(url);
      const slugs = await resp.json();
      await browser.storage.local.set({ [STORAGE_KEY_KNOWN]: slugs });
      return new Set(slugs);
    } catch (e) {
      console.warn('[GH Harvest] Could not load known slugs:', e);
      return new Set();
    }
  }

  // --- Restore state & init ---
  Promise.all([
    browser.storage.local.get([STORAGE_KEY_POS, STORAGE_KEY_MIN, STORAGE_KEY_SLUGS]),
    loadKnownSlugs(),
  ]).then(([result, known]) => {
    if (result[STORAGE_KEY_POS]) {
      panel.style.right = 'auto';
      panel.style.left = result[STORAGE_KEY_POS].x + 'px';
      panel.style.top = result[STORAGE_KEY_POS].y + 'px';
    }
    if (result[STORAGE_KEY_MIN]) {
      panel.classList.add('minimized');
      minBtn.textContent = '+';
    }
    if (result[STORAGE_KEY_SLUGS]) {
      allSlugs = result[STORAGE_KEY_SLUGS];
      pagesScraped = Math.max(...Object.values(allSlugs).map(v => v.page || 0), 0);
      updateSummary();
      updateCount();
    }
    knownSlugs = known;
    pageNumEl.textContent = detectPageNumber();

    // Check for CAPTCHA first, otherwise auto-run
    setTimeout(() => {
      if (isCaptchaPage()) {
        watchForCaptchaClear();
      } else {
        runScan();
      }
    }, 800);
  });

  // --- Auto-detect page navigation ---
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (window.location.pathname.startsWith('/search')) {
        thisPageSlugs = [];
        currentPage = detectPageNumber();
        pageNumEl.textContent = currentPage;
        setProgress(0, false);
        runBtn.textContent = '▶ Run';
        runBtn.classList.remove('complete', 'running');
        panel.classList.remove('done-state');
        // Auto-run on new page (check for CAPTCHA first)
        setTimeout(() => {
          if (isCaptchaPage()) {
            watchForCaptchaClear();
          } else {
            runScan();
          }
        }, 1200);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
