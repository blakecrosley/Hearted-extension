'use strict';

(function () {
  const PANEL_ID = '__gh_harvest_host';
  const SK = {
    POS: '_gh_pos', MIN: '_gh_min', SLUGS: '_gh_slugs', KNOWN: '_gh_known',
    QUEUE: '_gh_query_queue', QUEUE_IDX: '_gh_queue_index', QUEUE_PAUSED: '_gh_queue_paused',
    OWNER: '_gh_owner_tab', OWNER_TS: '_gh_owner_tab_ts',
    SESSION_CAPTCHAS: '_gh_session_captcha_count', SESSION_QUERIES: '_gh_session_query_count',
  };

  // Only activate on search results or CAPTCHA pages
  if (!window.location.pathname.startsWith('/search') &&
      !window.location.pathname.startsWith('/sorry')) return;
  if (document.getElementById(PANEL_ID)) return;

  // --- Tab ID for ownership ---
  const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // --- ATS patterns ---
  const ATS_PATTERNS = [
    { regex: /(?:job-boards|boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/, source: 'greenhouse', exclude: ['embed'] },
    { regex: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/, source: 'lever', exclude: [] },
    { regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/, source: 'ashby', exclude: [] },
    { regex: /([a-zA-Z0-9_-]+)\.recruitee\.com/, source: 'recruitee', exclude: ['www', 'app', 'api'] },
    { regex: /apply\.workable\.com\/([a-zA-Z0-9_-]+)/, source: 'workable', exclude: [] },
    { regex: /([a-zA-Z0-9_-]+)\.bamboohr\.com\/(?:careers|jobs)/, source: 'bamboohr', exclude: ['www'] },
  ];

  // --- Query matrix ---
  const ATS_ROOTS = [
    { query: 'site:job-boards.greenhouse.io/ inurl:jobs', maxPages: 50 },
    { query: 'site:jobs.lever.co inurl:apply', maxPages: 50 },
    { query: 'site:jobs.ashbyhq.com', maxPages: 50 },
    { query: 'site:apply.workable.com', maxPages: 50 },
    { query: 'site:bamboohr.com inurl:careers', maxPages: 50 },
    { query: 'site:recruitee.com inurl:jobs', maxPages: 50 },
  ];

  const ALPHA_NUM = 'a b c d e f g h i j k l m n o p q r s t u v w x y z 1 2 3 0'.split(' ');
  const CITIES = [
    'New York', 'San Francisco', 'Los Angeles', 'London', 'Berlin', 'Tokyo',
    'Seattle', 'Austin', 'Boston', 'Denver', 'Chicago', 'Toronto', 'Singapore', 'Paris',
  ];

  function generateQueue() {
    const queue = [];
    for (const root of ATS_ROOTS) {
      // Root query first
      queue.push({ query: root.query, maxPages: root.maxPages, pagesScanned: 0, newThisQuery: 0, consecutiveZero: 0, status: 'pending' });
      // Variants — shuffled
      const variants = [];
      for (const ch of ALPHA_NUM) variants.push({ query: `${root.query} ${ch}`, maxPages: 10, pagesScanned: 0, newThisQuery: 0, consecutiveZero: 0, status: 'pending' });
      for (const city of CITIES) variants.push({ query: `${root.query} ${city}`, maxPages: 10, pagesScanned: 0, newThisQuery: 0, consecutiveZero: 0, status: 'pending' });
      // Fisher-Yates shuffle
      for (let i = variants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [variants[i], variants[j]] = [variants[j], variants[i]];
      }
      queue.push(...variants);
    }
    return queue;
  }

  // --- Shadow DOM ---
  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all:initial; font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif; font-size:13px; color:#e0e0e0; line-height:1.4; }
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
    .panel { position:fixed; top:80px; right:20px; width:330px; background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%); border:1px solid rgba(255,255,255,0.12); border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.5); overflow:hidden; z-index:2147483647; transition:border-color 0.3s; }
    .panel.done-state { border-color:rgba(76,175,80,0.5); }
    .panel.minimized .panel-body,.panel.minimized .panel-footer,.panel.minimized .status-bar,.panel.minimized .session-summary,.panel.minimized .progress-wrap,.panel.minimized .query-info { display:none; }
    .panel.minimized { width:auto; border-radius:20px; }
    .panel-header { display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.08); cursor:grab; user-select:none; }
    .panel-header:active { cursor:grabbing; }
    .panel-title { font-size:13px; font-weight:600; background:linear-gradient(135deg,#4caf50 0%,#00bcd4 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; flex:1; white-space:nowrap; }
    .panel-count { font-size:10px; background:rgba(76,175,80,0.3); color:#4caf50; padding:1px 7px; border-radius:8px; white-space:nowrap; }
    .panel-count.has-new { background:rgba(233,30,99,0.3); color:#e91e63; }
    .run-btn { background:none; border:1px solid rgba(76,175,80,0.4); color:#4caf50; cursor:pointer; font-size:11px; padding:3px 10px; border-radius:6px; font-family:inherit; font-weight:600; transition:all 0.15s; }
    .run-btn:hover { background:rgba(76,175,80,0.15); }
    .run-btn.running { border-color:rgba(255,152,0,0.4); color:#ff9800; animation:glow 1.5s ease-in-out infinite; }
    .run-btn.complete { border-color:rgba(76,175,80,0.6); color:#4caf50; background:rgba(76,175,80,0.15); }
    @keyframes glow { 0%,100%{box-shadow:0 0 4px rgba(255,152,0,0.2);} 50%{box-shadow:0 0 12px rgba(255,152,0,0.4);} }
    .header-btn { background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:14px; padding:2px 4px; border-radius:4px; line-height:1; font-family:inherit; }
    .header-btn:hover { color:#fff; background:rgba(255,255,255,0.1); }
    .progress-wrap { height:3px; background:rgba(255,255,255,0.06); overflow:hidden; }
    .progress-bar { height:100%; width:0%; background:linear-gradient(90deg,#4caf50,#00bcd4); transition:width 0.4s ease; }
    .progress-bar.scanning { background:linear-gradient(90deg,#ff9800,#ff5722); animation:shimmer 1.5s ease-in-out infinite; }
    @keyframes shimmer { 0%{opacity:0.7;} 50%{opacity:1;} 100%{opacity:0.7;} }
    .query-info { padding:6px 14px; font-size:10px; color:rgba(255,255,255,0.35); border-bottom:1px solid rgba(255,255,255,0.06); font-family:'SF Mono','Menlo',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .query-info strong { color:#00bcd4; font-weight:600; }
    .status-bar { padding:8px 14px; font-size:11px; color:rgba(255,255,255,0.5); border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; min-height:32px; }
    .status-bar .page-num { color:#00bcd4; font-weight:600; }
    .status-text { text-align:right; }
    .status-text.scanning { color:#ff9800; }
    .status-text.ready { color:#4caf50; font-weight:600; }
    .status-text.next-page { color:#4caf50; font-weight:700; font-size:12px; animation:pulse 1s ease-in-out infinite; }
    .status-text.captcha { color:#ff5722; font-weight:700; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.6;} }
    .session-summary { padding:8px 14px; font-size:11px; color:rgba(255,255,255,0.4); background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.06); }
    .session-summary strong { color:#4caf50; }
    .panel-body { max-height:250px; overflow-y:auto; padding:4px 0; }
    .panel-body::-webkit-scrollbar { width:4px; }
    .panel-body::-webkit-scrollbar-track { background:transparent; }
    .panel-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:2px; }
    .slug-item { padding:5px 14px; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; gap:8px; align-items:center; font-size:12px; transition:background 0.3s; }
    .slug-item:last-child { border-bottom:none; }
    .slug-item.is-new { background:rgba(76,175,80,0.08); }
    .slug-item.is-known { opacity:0.35; }
    .slug-item.just-found { animation:fadeIn 0.4s ease; }
    @keyframes fadeIn { from{opacity:0;transform:translateX(-8px);} to{opacity:1;transform:translateX(0);} }
    .slug-name { flex:1; font-family:'SF Mono','Menlo',monospace; font-size:11px; color:rgba(255,255,255,0.8); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .slug-badge { font-size:9px; padding:1px 6px; border-radius:6px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; flex-shrink:0; }
    .slug-badge.new { background:rgba(76,175,80,0.2); color:#4caf50; }
    .slug-badge.known { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.35); }
    .panel-footer { padding:8px 14px; border-top:1px solid rgba(255,255,255,0.08); display:flex; gap:6px; }
    .footer-btn { flex:1; padding:6px 10px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.7); font-size:10px; cursor:pointer; font-family:inherit; text-align:center; transition:all 0.15s; }
    .footer-btn:hover { background:rgba(255,255,255,0.1); color:#fff; border-color:rgba(255,255,255,0.3); }
    .footer-btn.primary { background:rgba(76,175,80,0.15); color:#4caf50; border-color:rgba(76,175,80,0.3); }
    .footer-btn.primary:hover { background:rgba(76,175,80,0.25); }
    .footer-btn.danger { color:rgba(244,67,54,0.7); border-color:rgba(244,67,54,0.2); }
    .footer-btn.danger:hover { background:rgba(244,67,54,0.1); color:#f44336; }
    .empty-state { padding:20px 14px; text-align:center; color:rgba(255,255,255,0.3); font-size:12px; }
  `);
  shadow.adoptedStyleSheets = [sheet];

  // --- State ---
  let allSlugs = {};
  let knownSlugs = new Set();
  let sessionSeen = new Set();  // all slugs seen this session (for diminishing returns)
  let currentPage = 1;
  let pagesScraped = 0;
  let thisPageSlugs = [];
  let isRunning = false;
  let lastUrl = window.location.href;

  // Queue state
  let queryQueue = [];
  let queueIndex = 0;
  let queuePaused = false;
  let sessionCaptchas = 0;
  let sessionQueries = 0;
  const MAX_SESSION_QUERIES = 200;

  // --- Panel HTML ---
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">🌱 ATS Harvest</span>
      <span class="panel-count">0</span>
      <button class="run-btn">▶ Start</button>
      <button class="header-btn min-btn" title="Minimize">−</button>
    </div>
    <div class="progress-wrap"><div class="progress-bar"></div></div>
    <div class="query-info">Q —/— <strong>Ready</strong></div>
    <div class="status-bar">
      <span>Page <span class="page-num">—</span></span>
      <span class="status-text">Load queue to begin</span>
    </div>
    <div class="session-summary">Session: <strong>0</strong> new / 0 scanned</div>
    <div class="panel-body"><div class="empty-state">Hit ▶ Start to begin harvesting</div></div>
    <div class="panel-footer">
      <button class="footer-btn primary pause-btn">⏸ Pause</button>
      <button class="footer-btn skip-btn">⏭ Skip</button>
      <button class="footer-btn export-btn">Copy New</button>
      <button class="footer-btn danger reset-btn">Reset</button>
    </div>
  `;
  shadow.appendChild(panel);

  const countEl = panel.querySelector('.panel-count');
  const pageNumEl = panel.querySelector('.page-num');
  const statusEl = panel.querySelector('.status-text');
  const summaryEl = panel.querySelector('.session-summary');
  const queryInfoEl = panel.querySelector('.query-info');
  const bodyEl = panel.querySelector('.panel-body');
  const progressBar = panel.querySelector('.progress-bar');
  const runBtn = panel.querySelector('.run-btn');
  const minBtn = panel.querySelector('.min-btn');
  const pauseBtn = panel.querySelector('.pause-btn');
  const skipBtn = panel.querySelector('.skip-btn');
  const exportBtn = panel.querySelector('.export-btn');
  const resetBtn = panel.querySelector('.reset-btn');

  // --- Helpers ---
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    const newCount = Object.values(allSlugs).filter(v => v.new).length;
    summaryEl.innerHTML = `Session: <strong>${newCount}</strong> new / ${sessionSeen.size} scanned — Q ${sessionQueries}/${MAX_SESSION_QUERIES}`;
  }

  function updateQueryInfo() {
    const total = queryQueue.length;
    const done = queryQueue.filter(q => q.status === 'done').length;
    const current = queryQueue[queueIndex];
    const qText = current ? current.query.replace(/site:[^ ]+ ?/, '').substring(0, 35) || current.query.substring(0, 35) : '—';
    queryInfoEl.innerHTML = `Q <strong>${queueIndex + 1}</strong>/${total} (${done} done) — ${qText}`;
  }

  // --- CAPTCHA ---
  function isCaptchaPage() {
    return (document.body && document.body.innerText.includes('unusual traffic')) ||
           (document.body && document.body.innerText.includes('not a robot')) ||
           document.querySelector('iframe[src*="recaptcha"]') !== null ||
           window.location.pathname.startsWith('/sorry');
  }

  function watchForCaptchaClear() {
    sessionCaptchas++;
    browser.storage.local.set({ [SK.SESSION_CAPTCHAS]: sessionCaptchas });
    setStatus('⚠ CAPTCHA — solve it...', 'captcha');
    runBtn.textContent = '⏸ CAPTCHA';
    runBtn.classList.add('running');
    setProgress(0, true);

    const poll = setInterval(() => {
      // Check for generic search results indicators (not ATS-specific)
      if (!isCaptchaPage() || document.querySelector('#search, #rso, #botstuff')) {
        clearInterval(poll);
        console.log('[ATS Harvest] CAPTCHA cleared');
        runBtn.classList.remove('running');
        // CAPTCHA backoff: 3 in session → 5 min cooldown
        if (sessionCaptchas >= 3 && sessionCaptchas % 3 === 0) {
          setStatus(`Cooling down ${5}min after ${sessionCaptchas} CAPTCHAs...`, 'scanning');
          setTimeout(() => {
            if (!queuePaused) runScan();
          }, 5 * 60 * 1000);
        } else {
          setTimeout(() => {
            if (!queuePaused) runScan();
          }, 500);
        }
      }
    }, 2000);
  }

  // --- Page helpers ---
  function detectPageNumber() {
    const params = new URLSearchParams(window.location.search);
    const start = parseInt(params.get('start') || '0');
    return Math.floor(start / 10) + 1;
  }

  function findNextPageLink() {
    const byId = document.getElementById('pnnext');
    if (byId) return byId;
    for (const label of ['Next page', 'Next', 'More results']) {
      const el = document.querySelector(`a[aria-label="${label}"]`);
      if (el) return el;
    }
    const allLinks = document.querySelectorAll('a[href*="/search"]');
    for (const a of allLinks) {
      const text = a.textContent.trim().toLowerCase();
      if (text === 'next' || text === 'next ›' || text === '›') return a;
    }
    const currentStart = parseInt(new URLSearchParams(window.location.search).get('start') || '0');
    const nextStart = currentStart + 10;
    const nextPageLink = document.querySelector(`a[href*="start=${nextStart}"]`);
    if (nextPageLink) return nextPageLink;
    const navContainers = document.querySelectorAll('[role="navigation"], #botstuff, table#nav');
    for (const nav of navContainers) {
      const links = [...nav.querySelectorAll('a[href*="start="]')];
      if (links.length > 0) return links[links.length - 1];
    }
    const candidates = [...document.querySelectorAll('a[href*="start="]')];
    for (const a of candidates) {
      const m = a.href.match(/[?&]start=(\d+)/);
      if (m && parseInt(m[1]) > currentStart) return a;
    }
    return null;
  }

  // --- Scrape ---
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
          break;
        }
      }
    });
    return found;
  }

  // --- Render ---
  function renderSlugs(justFound) {
    const justSet = new Set(justFound || []);
    const thisPageSet = new Set(thisPageSlugs);
    const otherSlugs = Object.entries(allSlugs).filter(([s]) => !thisPageSet.has(s));
    if (Object.keys(allSlugs).length === 0) {
      bodyEl.innerHTML = '<div class="empty-state">Waiting for results...</div>';
      return;
    }
    let html = '';
    const thisNew = thisPageSlugs.filter(s => allSlugs[s]?.new);
    const thisKnown = thisPageSlugs.filter(s => !allSlugs[s]?.new);
    [...thisNew, ...thisKnown].forEach(slug => {
      const info = allSlugs[slug];
      const cls = (info?.new ? 'is-new' : 'is-known') + (justSet.has(slug) ? ' just-found' : '');
      const badge = info?.new ? '<span class="slug-badge new">NEW</span>' : '<span class="slug-badge known">KNOWN</span>';
      html += `<div class="slug-item ${cls}">${badge}<span class="slug-name">${slug}</span></div>`;
    });
    if (otherSlugs.length > 0) {
      const newOthers = otherSlugs.filter(([_, v]) => v.new);
      const knownOthers = otherSlugs.filter(([_, v]) => !v.new);
      newOthers.forEach(([slug]) => {
        html += `<div class="slug-item is-new"><span class="slug-badge new">NEW</span><span class="slug-name">${slug}</span></div>`;
      });
      if (knownOthers.length > 0) {
        html += `<div class="slug-item is-known"><span class="slug-name" style="color:rgba(255,255,255,0.3)">+ ${knownOthers.length} known from prev</span></div>`;
      }
    }
    bodyEl.innerHTML = html;
  }

  // --- Backend send (must await before navigation) ---
  async function sendToBackend() {
    if (thisPageSlugs.length === 0) return;
    const bySource = {};
    for (const slug of thisPageSlugs) {
      const src = allSlugs[slug]?.source || 'unknown';
      if (!bySource[src]) bySource[src] = { slugs: [], new_slugs: [] };
      bySource[src].slugs.push(slug);
      if (allSlugs[slug]?.new) bySource[src].new_slugs.push(slug);
    }
    for (const [src, data] of Object.entries(bySource)) {
      try {
        await browser.runtime.sendMessage({
          action: 'captureGreenhouseSlugs',
          data: { slugs: data.slugs, new_slugs: data.new_slugs, source: src, page: currentPage, query: new URLSearchParams(window.location.search).get('q') || '' }
        });
        console.log(`[ATS Harvest] Sent ${data.slugs.length} ${src} slugs`);
      } catch (e) {
        console.warn(`[ATS Harvest] Send failed for ${src}:`, e);
      }
    }
  }

  // --- Navigate to next query ---
  async function switchToNextQuery() {
    // Mark current done
    if (queryQueue[queueIndex]) queryQueue[queueIndex].status = 'done';

    // Find next pending
    let found = false;
    for (let i = queueIndex + 1; i < queryQueue.length; i++) {
      if (queryQueue[i].status === 'pending') {
        queueIndex = i;
        found = true;
        break;
      }
    }

    if (!found) {
      setStatus('✓ All queries complete!', 'ready');
      runBtn.textContent = '✓ Done';
      runBtn.classList.add('complete');
      saveQueueState();
      return;
    }

    sessionQueries++;
    if (sessionQueries >= MAX_SESSION_QUERIES) {
      setStatus(`Session cap (${MAX_SESSION_QUERIES}) reached — paused`, 'ready');
      queuePaused = true;
      pauseBtn.textContent = '▶ Resume';
      saveQueueState();
      return;
    }

    saveQueueState();
    updateQueryInfo();

    // Human-like delay: 30-60s between queries
    const delay = 30000 + Math.random() * 30000;
    const delaySec = Math.round(delay / 1000);
    for (let remaining = delaySec; remaining > 0; remaining--) {
      if (queuePaused) return;
      setStatus(`Next query in ${remaining}s...`, 'scanning');
      await sleep(1000);
    }

    if (queuePaused) return;

    // Navigate to the new query
    const nextQuery = queryQueue[queueIndex].query;
    console.log(`[ATS Harvest] Switching to query: ${nextQuery}`);
    window.location.href = 'https://www.google.com/search?q=' + encodeURIComponent(nextQuery);
  }

  // --- Save/load queue state ---
  function saveQueueState() {
    browser.storage.local.set({
      [SK.QUEUE]: queryQueue,
      [SK.QUEUE_IDX]: queueIndex,
      [SK.QUEUE_PAUSED]: queuePaused,
      [SK.SESSION_QUERIES]: sessionQueries,
      [SK.SESSION_CAPTCHAS]: sessionCaptchas,
      [SK.SLUGS]: allSlugs,
    });
  }

  // --- THE RUNNER ---
  async function runScan() {
    if (isRunning || queuePaused || !isTabOwner) return;
    isRunning = true;

    currentPage = detectPageNumber();
    pageNumEl.textContent = currentPage;
    thisPageSlugs = [];

    runBtn.textContent = '⏳ Scanning';
    runBtn.classList.add('running');
    runBtn.classList.remove('complete');
    panel.classList.remove('done-state');
    updateQueryInfo();

    // Scroll and scrape
    setStatus('Scanning...', 'scanning');
    setProgress(10, true);
    await sleep(300);

    let found = scrapeVisibleLinks();
    renderSlugs(found.map(f => f.slug));
    updateCount();

    const scrollHeight = document.documentElement.scrollHeight;
    const viewHeight = window.innerHeight;
    const steps = Math.ceil(scrollHeight / (viewHeight * 0.6));
    const totalSteps = steps + 2;

    for (let i = 1; i <= steps; i++) {
      const target = Math.min((viewHeight * 0.6) * i, scrollHeight);
      window.scrollTo({ top: target, behavior: 'smooth' });
      setProgress(Math.round(((i + 1) / totalSteps) * 90), true);
      setStatus(`Scrolling... ${thisPageSlugs.length} found`, 'scanning');
      await sleep(400 + Math.random() * 200);
      const newFound = scrapeVisibleLinks();
      if (newFound.length > 0) { renderSlugs(newFound.map(f => f.slug)); updateCount(); }
    }

    setProgress(95, true);
    setStatus('Final sweep...', 'scanning');
    await sleep(500);
    const finalFound = scrapeVisibleLinks();
    if (finalFound.length > 0) { renderSlugs(finalFound.map(f => f.slug)); updateCount(); }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    await sleep(400);

    pagesScraped++;
    setProgress(100, false);

    // Count new-to-session slugs on this page
    let newThisPage = 0;
    for (const slug of thisPageSlugs) {
      if (!sessionSeen.has(slug)) { newThisPage++; sessionSeen.add(slug); }
    }

    // Await backend send BEFORE any navigation
    await sendToBackend();

    // Update queue state
    const cq = queryQueue[queueIndex];
    if (cq) {
      cq.pagesScanned++;
      cq.newThisQuery += newThisPage;
      if (newThisPage === 0) cq.consecutiveZero++;
      else cq.consecutiveZero = 0;
    }

    updateSummary();
    saveQueueState();

    const totalOnPage = thisPageSlugs.length;
    const newOnPage = thisPageSlugs.filter(s => allSlugs[s]?.new).length;

    runBtn.classList.remove('running');
    isRunning = false;

    // Decide what to do next
    const exhausted = cq && (cq.consecutiveZero >= 3 || cq.pagesScanned >= cq.maxPages);

    if (queuePaused) {
      setStatus('Paused', 'ready');
      runBtn.textContent = '⏸ Paused';
    } else if (exhausted) {
      // This query is done — move to next
      setStatus(`Query done (${cq.newThisQuery} new) — switching...`, 'next-page');
      panel.classList.add('done-state');
      await switchToNextQuery();
    } else if (totalOnPage === 0) {
      // No results at all — skip query
      setStatus('No results — skipping query', 'scanning');
      await switchToNextQuery();
    } else {
      // More pages to go — click Next
      const delay = 2000 + Math.random() * 2000;
      setStatus(`✓ ${totalOnPage} found, ${newOnPage} new — next in ${Math.round(delay/1000)}s`, 'next-page');
      runBtn.textContent = '⏭ Next';
      panel.classList.add('done-state');
      await sleep(delay);

      if (queuePaused) return;

      const nextLink = findNextPageLink();
      if (nextLink) {
        const href = nextLink.href;
        nextLink.click();
        setTimeout(() => {
          if (window.location.href === lastUrl) window.location.href = href;
        }, 2000);
      } else {
        // No next page — query exhausted
        setStatus('No more pages — switching query', 'scanning');
        await switchToNextQuery();
      }
    }
  }

  // --- Event listeners ---
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
    browser.storage.local.set({ [SK.POS]: { x: panel.offsetLeft, y: parseInt(panel.style.top) } });
  });

  // Start / Run
  runBtn.addEventListener('click', () => {
    if (isRunning) return;
    if (queuePaused) {
      queuePaused = false;
      pauseBtn.textContent = '⏸ Pause';
    }
    runScan();
  });

  // Pause / Resume
  pauseBtn.addEventListener('click', () => {
    queuePaused = !queuePaused;
    pauseBtn.textContent = queuePaused ? '▶ Resume' : '⏸ Pause';
    if (queuePaused) {
      setStatus('Paused', 'ready');
      runBtn.textContent = '⏸ Paused';
    } else {
      runScan();
    }
    saveQueueState();
  });

  // Skip query
  skipBtn.addEventListener('click', () => {
    if (isRunning) return;
    if (queryQueue[queueIndex]) queryQueue[queueIndex].status = 'done';
    switchToNextQuery();
  });

  // Minimize
  minBtn.addEventListener('click', () => {
    const isMin = panel.classList.toggle('minimized');
    minBtn.textContent = isMin ? '+' : '−';
    browser.storage.local.set({ [SK.MIN]: isMin });
  });

  // Export
  exportBtn.addEventListener('click', () => {
    const newSlugs = Object.entries(allSlugs).filter(([_, v]) => v.new).map(([s]) => s);
    if (newSlugs.length === 0) { exportBtn.textContent = 'None'; setTimeout(() => { exportBtn.textContent = 'Copy New'; }, 1500); return; }
    navigator.clipboard.writeText(newSlugs.join('\n'));
    exportBtn.textContent = `${newSlugs.length}!`;
    setTimeout(() => { exportBtn.textContent = 'Copy New'; }, 2000);
  });

  // Reset
  resetBtn.addEventListener('click', () => {
    allSlugs = {};
    thisPageSlugs = [];
    sessionSeen = new Set();
    pagesScraped = 0;
    queryQueue = generateQueue();
    queueIndex = 0;
    queuePaused = false;
    sessionQueries = 0;
    sessionCaptchas = 0;
    browser.storage.local.remove([SK.SLUGS, SK.QUEUE, SK.QUEUE_IDX, SK.QUEUE_PAUSED, SK.SESSION_QUERIES, SK.SESSION_CAPTCHAS]);
    renderSlugs();
    updateSummary();
    updateCount();
    updateQueryInfo();
    setProgress(0, false);
    setStatus('Queue reset — hit Start', '');
    runBtn.textContent = '▶ Start';
    runBtn.classList.remove('complete');
    panel.classList.remove('done-state');
    countEl.textContent = '0';
  });

  // --- Tab ownership ---
  async function claimOwnership() {
    const stored = await browser.storage.local.get([SK.OWNER, SK.OWNER_TS]);
    if (stored[SK.OWNER] && stored[SK.OWNER] !== TAB_ID) {
      const age = Date.now() - (stored[SK.OWNER_TS] || 0);
      if (age < 60000) return false; // another tab is active
    }
    await browser.storage.local.set({ [SK.OWNER]: TAB_ID, [SK.OWNER_TS]: Date.now() });
    return true;
  }

  // Heartbeat — only if we are the owner
  let isTabOwner = false;
  setInterval(() => {
    if (isTabOwner) browser.storage.local.set({ [SK.OWNER_TS]: Date.now() });
  }, 30000);

  // Release on unload — only if we are the owner
  window.addEventListener('beforeunload', () => {
    if (isTabOwner) browser.storage.local.remove([SK.OWNER, SK.OWNER_TS]);
  });

  // --- Load known slugs ---
  async function loadKnownSlugs() {
    const stored = await browser.storage.local.get(SK.KNOWN);
    if (stored[SK.KNOWN] && stored[SK.KNOWN].length > 100) return new Set(stored[SK.KNOWN]);
    try {
      const url = browser.runtime.getURL('gh-known-slugs.json');
      const resp = await fetch(url);
      const slugs = await resp.json();
      await browser.storage.local.set({ [SK.KNOWN]: slugs });
      return new Set(slugs);
    } catch (e) {
      console.warn('[ATS Harvest] Could not load known slugs:', e);
      return new Set();
    }
  }

  // --- Init ---
  Promise.all([
    browser.storage.local.get([SK.POS, SK.MIN, SK.SLUGS, SK.QUEUE, SK.QUEUE_IDX, SK.QUEUE_PAUSED, SK.SESSION_QUERIES, SK.SESSION_CAPTCHAS]),
    loadKnownSlugs(),
    claimOwnership(),
  ]).then(([result, known, isOwner]) => {
    if (result[SK.POS]) { panel.style.right = 'auto'; panel.style.left = result[SK.POS].x + 'px'; panel.style.top = result[SK.POS].y + 'px'; }
    if (result[SK.MIN]) { panel.classList.add('minimized'); minBtn.textContent = '+'; }

    knownSlugs = known;

    // Restore queue or generate new
    if (result[SK.QUEUE] && result[SK.QUEUE].length > 0) {
      queryQueue = result[SK.QUEUE];
      queueIndex = result[SK.QUEUE_IDX] || 0;
      queuePaused = result[SK.QUEUE_PAUSED] || false;
      sessionQueries = result[SK.SESSION_QUERIES] || 0;
      sessionCaptchas = result[SK.SESSION_CAPTCHAS] || 0;
    } else {
      queryQueue = generateQueue();
    }

    if (result[SK.SLUGS]) {
      allSlugs = result[SK.SLUGS];
      // Rebuild sessionSeen from allSlugs
      for (const slug of Object.keys(allSlugs)) sessionSeen.add(slug);
      updateCount();
    }

    isTabOwner = isOwner;
    if (!isOwner) {
      setStatus('Queue active in another tab', '');
      runBtn.textContent = '🔒 Locked';
      runBtn.disabled = true;
      pauseBtn.disabled = true;
      skipBtn.disabled = true;
      resetBtn.disabled = true;
      return;
    }

    updateSummary();
    updateQueryInfo();
    pageNumEl.textContent = detectPageNumber();

    if (queuePaused) {
      pauseBtn.textContent = '▶ Resume';
      setStatus('Paused', 'ready');
      runBtn.textContent = '⏸ Paused';
      return;
    }

    // Auto-start
    setTimeout(() => {
      if (isCaptchaPage()) {
        watchForCaptchaClear();
      } else {
        runScan();
      }
    }, 800);
  });

  // --- SPA navigation detection ---
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
        setTimeout(() => {
          if (!isTabOwner) return;
          if (isCaptchaPage()) watchForCaptchaClear();
          else if (!queuePaused) runScan();
        }, 1200);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
