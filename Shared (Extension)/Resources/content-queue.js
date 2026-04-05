'use strict';

(function () {
  const PANEL_ID = '__qp_host';
  const STORAGE_KEY_POS = '_qp_pos';
  const STORAGE_KEY_MIN = '_qp_min';
  const STORAGE_KEY_AUTO = '_qp_auto';

  // --- Timing helpers ---

  // Skew-low delay sampler. pow(U, 2.5) has normalized mean ≈ 0.286,
  // piles up near minMs with a long tail toward maxMs.
  function humanDelay(minMs, maxMs) {
    return Math.round(minMs + Math.pow(Math.random(), 2.5) * (maxMs - minMs));
  }

  // Ornstein-Uhlenbeck mean-reverting tempo: drifts but always pulls back to 1.0.
  let runnerTempo = 1.0;
  const TEMPO_MEAN = 1.0;
  const TEMPO_REVERT = 0.3;  // pull strength toward mean
  const TEMPO_SIGMA = 0.12;  // noise per step
  const TEMPO_MIN = 0.7;
  const TEMPO_MAX = 1.5;

  function driftTempo() {
    const noise = (Math.random() + Math.random() + Math.random() - 1.5) * TEMPO_SIGMA;
    runnerTempo += TEMPO_REVERT * (TEMPO_MEAN - runnerTempo) + noise;
    runnerTempo = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, runnerTempo));
  }

  let promptsSinceBreak = 0;
  let nextBreakAt = Math.floor(Math.random() * 11) + 5; // 5-15 prompts

  // --- Cancellation token ---
  // Each run gets a unique token. All async steps check it; stopRunner() bumps it.
  let currentRunToken = 0;

  class RunCancelled extends Error {
    constructor() { super('Run cancelled'); this.name = 'RunCancelled'; }
  }

  function assertRunnerActive(token) {
    if (token !== currentRunToken) throw new RunCancelled();
  }

  function sleepCancelable(ms, token) {
    return new Promise((resolve, reject) => {
      let timer;
      const check = setInterval(() => {
        if (token !== currentRunToken) {
          clearTimeout(timer);
          clearInterval(check);
          reject(new RunCancelled());
        }
      }, 200); // poll every 200ms for cancellation
      timer = setTimeout(() => {
        clearInterval(check);
        resolve();
      }, ms);
    });
  }

  // Prevent duplicate injection
  if (document.getElementById(PANEL_ID)) return;

  // --- Shadow DOM host ---
  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // --- Styles via Constructable Stylesheet ---
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      font-size: 13px;
      color: #e0e0e0;
      line-height: 1.4;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      z-index: 2147483647;
    }

    .panel.minimized {
      width: auto;
      border-radius: 20px;
    }

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
      background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      flex: 1;
    }

    .panel-count {
      font-size: 10px;
      background: rgba(233, 30, 99, 0.3);
      color: #e91e63;
      padding: 1px 7px;
      border-radius: 8px;
    }

    .runner-status {
      font-size: 10px;
      color: rgba(255,255,255,0.45);
      white-space: nowrap;
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

    .header-btn.run-btn.running {
      color: #4caf50;
      background: rgba(76, 175, 80, 0.14);
    }

    .panel-body {
      max-height: 380px;
      overflow-y: auto;
    }

    .panel-body::-webkit-scrollbar { width: 4px; }
    .panel-body::-webkit-scrollbar-track { background: transparent; }
    .panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

    .queue-item {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .queue-item:last-child { border-bottom: none; }

    .queue-item.copied-state {
      background: rgba(76, 175, 80, 0.06);
    }

    .queue-item.done-state {
      opacity: 0.4;
    }

    .item-thumb {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
    }

    .item-body {
      flex: 1;
      min-width: 0;
    }

    .item-prompt {
      font-size: 11px;
      color: rgba(255,255,255,0.8);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-all;
    }

    .item-meta {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      margin-top: 2px;
    }

    .item-actions {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-self: center;
    }

    .action-btn {
      padding: 4px 8px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px;
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.7);
      font-size: 10px;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      text-align: center;
    }

    .action-btn:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
      border-color: rgba(255,255,255,0.3);
    }

    .action-btn.copy-btn.copied {
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
      border-color: rgba(76, 175, 80, 0.4);
    }

    .action-btn.done-btn {
      color: rgba(76, 175, 80, 0.7);
      border-color: rgba(76, 175, 80, 0.3);
    }

    .action-btn.done-btn:hover {
      background: rgba(76, 175, 80, 0.15);
      color: #4caf50;
    }

    .empty-state {
      padding: 30px 20px;
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 12px;
    }

    .loading-state {
      padding: 30px 20px;
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 12px;
    }

    .error-state {
      padding: 20px;
      text-align: center;
      color: #f44336;
      font-size: 12px;
    }

    .refresh-link {
      color: rgba(255,255,255,0.5);
      cursor: pointer;
      text-decoration: underline;
      font-size: 11px;
    }

    .refresh-link:hover { color: #fff; }

    .toggle-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .toggle-track {
      width: 26px;
      height: 14px;
      border-radius: 7px;
      background: rgba(255,255,255,0.15);
      position: relative;
      transition: background 0.2s;
    }

    .toggle-track.on {
      background: rgba(76, 175, 80, 0.5);
    }

    .toggle-knob {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #fff;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: left 0.2s;
    }

    .toggle-track.on .toggle-knob {
      left: 14px;
    }

    /* Minimized: show only icon + count in header, hide body */
    .panel.minimized .panel-body { display: none; }
    .panel.minimized .panel-title { display: none; }
    .panel.minimized .panel-header {
      padding: 8px 12px;
      border-bottom: none;
    }
  `);
  shadow.adoptedStyleSheets = [sheet];

  // --- Build DOM ---
  const panel = document.createElement('div');
  panel.className = 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'panel-title';
  titleSpan.textContent = 'Queue';

  const countBadge = document.createElement('span');
  countBadge.className = 'panel-count';
  countBadge.style.display = 'none';

  const runnerStatus = document.createElement('span');
  runnerStatus.className = 'runner-status';
  runnerStatus.textContent = '';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'header-btn';
  refreshBtn.title = 'Refresh';
  refreshBtn.textContent = '\u21BB'; // ↻

  const runBtn = document.createElement('button');
  runBtn.className = 'header-btn run-btn';
  runBtn.title = 'Run queue';
  runBtn.textContent = 'Run';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'header-btn';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.textContent = '\u2212'; // −

  // Auto-done toggle
  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'toggle-wrap';
  toggleWrap.title = 'Copy marks as done';

  const toggleTrack = document.createElement('div');
  toggleTrack.className = 'toggle-track';
  const toggleKnob = document.createElement('div');
  toggleKnob.className = 'toggle-knob';
  toggleTrack.appendChild(toggleKnob);

  const toggleLabel = document.createElement('span');
  toggleLabel.textContent = 'Auto';
  toggleWrap.appendChild(toggleTrack);
  toggleWrap.appendChild(toggleLabel);

  header.appendChild(titleSpan);
  header.appendChild(countBadge);
  header.appendChild(runnerStatus);
  header.appendChild(toggleWrap);
  header.appendChild(runBtn);
  header.appendChild(refreshBtn);
  header.appendChild(minimizeBtn);

  const body = document.createElement('div');
  body.className = 'panel-body';

  panel.appendChild(header);
  panel.appendChild(body);
  shadow.appendChild(panel);

  // --- State ---
  let isMinimized = false;
  let autoDone = false;
  let items = [];
  let runnerActive = false;
  let runnerBusy = false;
  let runnerTimer = null;

  function setAutoDone(on) {
    autoDone = on;
    toggleTrack.classList.toggle('on', on);
    browser.storage.local.set({ [STORAGE_KEY_AUTO]: on });
    renderItems();
  }

  toggleWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    setAutoDone(!autoDone);
  });

  // --- Minimize / Expand ---
  function setMinimized(minimized) {
    isMinimized = minimized;
    panel.classList.toggle('minimized', minimized);
    minimizeBtn.textContent = minimized ? '\u002B' : '\u2212'; // + or −
    minimizeBtn.title = minimized ? 'Expand' : 'Minimize';
    browser.storage.local.set({ [STORAGE_KEY_MIN]: minimized });
  }

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMinimized(!isMinimized);
  });

  // --- Draggable ---
  let isDragging = false;
  let dragStartX, dragStartY, panelStartLeft, panelStartTop;

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panelStartLeft = panel.offsetLeft;
    panelStartTop = panel.offsetTop;

    // Switch from right-based to left-based positioning
    panel.style.left = panel.offsetLeft + 'px';
    panel.style.right = 'auto';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    let newLeft = panelStartLeft + dx;
    let newTop = panelStartTop + dy;

    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    browser.storage.local.set({
      [STORAGE_KEY_POS]: { x: panel.offsetLeft, y: panel.offsetTop }
    });
  });

  window.addEventListener('resize', () => {
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;
    if (panel.offsetLeft > maxX) panel.style.left = maxX + 'px';
    if (panel.offsetTop > maxY) panel.style.top = maxY + 'px';
  });

  // --- Restore saved state ---
  browser.storage.local.get([STORAGE_KEY_POS, STORAGE_KEY_MIN, STORAGE_KEY_AUTO], (result) => {
    const pos = result[STORAGE_KEY_POS];
    if (pos) {
      const maxX = window.innerWidth - 320;
      const maxY = window.innerHeight - 60;
      panel.style.left = Math.min(Math.max(0, pos.x), maxX) + 'px';
      panel.style.top = Math.min(Math.max(0, pos.y), maxY) + 'px';
      panel.style.right = 'auto';
    }
    if (result[STORAGE_KEY_MIN]) {
      setMinimized(true);
    }
    if (result[STORAGE_KEY_AUTO]) {
      setAutoDone(true);
    }
  });

  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setRunnerUi(active, status = '') {
    runnerActive = active;
    runBtn.textContent = active ? 'Stop' : 'Run';
    runBtn.title = active ? 'Stop queue runner' : 'Run queue';
    runBtn.classList.toggle('running', active);
    runnerStatus.textContent = status;
  }

  function setFieldValue(el, value) {
    if (!el) return;

    el.focus();

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }
    } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
      el.textContent = value;
    }

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertFromPaste',
      data: value
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findPromptInputOnce() {
    const selectors = [
      'textarea#desktop_input_bar',
      'textarea[placeholder="What will you imagine?"]',
      'textarea[placeholder*="imagine"]',
      '[contenteditable="true"][role="textbox"]',
      '[role="textbox"][contenteditable="true"]'
    ];

    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll(selector));
      const visibleMatch = matches.find(isVisible);
      if (visibleMatch) return visibleMatch;
      if (matches.length > 0) return matches[0];
    }

    return null;
  }

  // Retry wrapper: MJ re-renders can temporarily remove the prompt input.
  // Tries up to maxAttempts with jittered delays before giving up.
  async function waitForPromptInput(token, maxAttempts = 6) {
    for (let i = 0; i < maxAttempts; i++) {
      assertRunnerActive(token);
      const el = findPromptInputOnce();
      if (el) return el;
      if (i < maxAttempts - 1) {
        await sleepCancelable(300 + Math.random() * 400, token);
      }
    }
    return null;
  }

  function findSubmitButtonOnce() {
    const promptField = findPromptInputOnce();
    if (!promptField) return null;

    const fieldRect = promptField.getBoundingClientRect();
    const searchRoots = [];
    let current = promptField.parentElement;
    for (let i = 0; current && i < 5; i += 1, current = current.parentElement) {
      searchRoots.push(current);
    }
    searchRoots.push(document);

    let best = null;
    let bestScore = -1;
    for (const root of searchRoots) {
      const buttons = Array.from(root.querySelectorAll('button, [role="button"]'));
      for (const btn of buttons) {
        if (!isEnabledButton(btn)) continue;
        const score = scoreSubmitButton(btn, fieldRect, root);
        if (score > bestScore) {
          best = btn;
          bestScore = score;
        }
      }
      if (bestScore >= 240) break;
    }

    return best;
  }

  // Retry wrapper for submit button discovery.
  async function waitForSubmitButton(token, maxAttempts = 6) {
    for (let i = 0; i < maxAttempts; i++) {
      assertRunnerActive(token);
      const btn = findSubmitButtonOnce();
      if (btn) return btn;
      if (i < maxAttempts - 1) {
        await sleepCancelable(300 + Math.random() * 400, token);
      }
    }
    return null;
  }

  function injectIntoMidjourney(field, item) {
    if (!field) return false;
    setFieldValue(field, item.copy_text || '');
    field.focus();
    return true;
  }

  function isEnabledButton(el) {
    return !!(
      el &&
      isVisible(el) &&
      !el.disabled &&
      el.getAttribute('aria-disabled') !== 'true'
    );
  }

  async function clickElement(el, token) {
    if (!el) return;
    el.focus();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleepCancelable(humanDelay(50, 150), token);
    assertRunnerActive(token);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  }

  function scoreSubmitButton(btn, fieldRect, root) {
    const rect = btn.getBoundingClientRect();
    const label = [
      btn.textContent || '',
      btn.getAttribute('aria-label') || '',
      btn.getAttribute('title') || '',
      btn.className || ''
    ].join(' ').toLowerCase();

    let score = 0;
    if (/submit|send|imagine|generate|create/.test(label)) score += 240;
    if (btn.getAttribute('type') === 'submit') score += 100;
    if (root && root.contains(btn)) score += 40;

    const fieldMidY = fieldRect.top + fieldRect.height / 2;
    const btnMidY = rect.top + rect.height / 2;
    const dx = Math.abs(rect.left - fieldRect.right);
    const dy = Math.abs(btnMidY - fieldMidY);

    if (rect.left >= fieldRect.left) score += Math.max(0, 120 - Math.min(dx, 120));
    score += Math.max(0, 80 - Math.min(dy, 80));
    if (rect.left >= fieldRect.right - 40 && rect.left <= fieldRect.right + 220) score += 60;

    return score;
  }

  // Capture composer state before clicking submit. Call this before clickElement().
  function snapshotComposerState() {
    const field = findPromptInputOnce();
    const btn = findSubmitButtonOnce();
    return {
      field,
      text: field ? (field.value || field.textContent || '').trim() : '',
      btn
    };
  }

  // Wait for a DOM signal that submission went through, comparing against
  // a pre-click snapshot. Returns true if a signal was detected, false on timeout.
  async function waitForSubmissionSignal(snapshot, token, timeoutMs = 8000) {
    const startTime = Date.now();
    const pollInterval = 350;
    const { field: fieldBefore, text: textBefore, btn: btnBefore } = snapshot;

    while (Date.now() - startTime < timeoutMs) {
      assertRunnerActive(token);
      await sleepCancelable(pollInterval, token);

      // Signal 1: prompt field cleared or value changed to empty
      const field = findPromptInputOnce();
      if (field) {
        const textNow = (field.value || field.textContent || '').trim();
        if (textBefore && textNow === '') return true;
        if (textBefore && textNow !== textBefore) return true;
      }

      // Signal 2: snapshotted submit button — use the exact pre-click reference
      if (btnBefore) {
        if (!btnBefore.isConnected) return true; // removed from DOM
        if (btnBefore.disabled || btnBefore.getAttribute('aria-disabled') === 'true') return true;
        const cls = btnBefore.className || '';
        if (/loading|spinner|busy|pending/i.test(cls)) return true;
      } else {
        // No pre-click button ref — fall back to finder
        const btn = findSubmitButtonOnce();
        if (btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true')) return true;
        if (!btn && fieldBefore) return true;
      }

      // Signal 3: field itself disappeared (full composer re-render)
      if (!field && fieldBefore) return true;
    }

    return false;
  }

  function markItemDoneAsync(itemId) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage(
        { action: 'markQueueItemDone', itemId },
        (response) => {
          if (response && response.success) {
            resolve(response.data);
          } else {
            reject(new Error((response && response.error) || 'Failed to mark item done'));
          }
        }
      );
    });
  }

  function stopRunner(status = '') {
    currentRunToken++; // invalidate any in-flight sleeps/checks
    if (runnerTimer) {
      clearTimeout(runnerTimer);
      runnerTimer = null;
    }
    runnerBusy = false;
    setRunnerUi(false, status);
  }

  function scheduleNextRun(delayMs, token, status = '') {
    if (token !== currentRunToken) return;
    if (status) setRunnerUi(true, status);
    runnerTimer = setTimeout(() => {
      runnerTimer = null;
      runnerBusy = false;
      if (token === currentRunToken) runNextQueueItem();
    }, delayMs);
  }

  async function runNextQueueItem() {
    if (!runnerActive || runnerBusy) return;
    runnerBusy = true;
    const token = currentRunToken;

    try {
      if (!items.length) {
        await loadQueue();
      }
      assertRunnerActive(token);

      if (!items.length) {
        stopRunner('Queue empty');
        return;
      }

      const item = items[0];
      setRunnerUi(true, '');

      // Wait for prompt input (retries handle MJ re-renders)
      const promptField = await waitForPromptInput(token);
      if (!promptField) throw new Error('No prompt field');

      if (!injectIntoMidjourney(promptField, item)) {
        throw new Error('Inject failed');
      }
      assertRunnerActive(token);

      // Pre-submit pause: read what was pasted (1-4s, skewed short)
      await sleepCancelable(humanDelay(1000, 4000), token);
      assertRunnerActive(token);

      // Find submit button (retries handle MJ re-renders)
      const submitBtn = await waitForSubmitButton(token);
      if (!submitBtn) throw new Error('No submit button');

      assertRunnerActive(token);
      const preSubmit = snapshotComposerState();
      await clickElement(submitBtn, token);
      assertRunnerActive(token);

      // Wait for DOM confirmation that submission went through
      const submitted = await waitForSubmissionSignal(preSubmit, token);
      assertRunnerActive(token);

      if (!submitted) {
        // No confirmation signal -- leave item pending, stop runner
        stopRunner('Submit unconfirmed');
        return;
      }

      await markItemDoneAsync(item.id);
      assertRunnerActive(token);
      items = items.filter(i => i.id !== item.id);
      renderItems();

      assertRunnerActive(token);
      promptsSinceBreak++;
      driftTempo();

      // Schedule next: long break every 5-15 prompts, otherwise 8-25s * tempo
      let nextDelay;
      if (promptsSinceBreak >= nextBreakAt) {
        nextDelay = humanDelay(60000, 300000);
        promptsSinceBreak = 0;
        nextBreakAt = Math.floor(Math.random() * 11) + 5;
        scheduleNextRun(nextDelay, token, 'Paused');
      } else {
        nextDelay = Math.round(humanDelay(8000, 25000) * runnerTempo);
        scheduleNextRun(nextDelay, token);
      }
      return;
    } catch (error) {
      if (error instanceof RunCancelled) {
        // Stop was pressed -- stopRunner() already ran, nothing to do
        return;
      }
      console.error('Queue runner stopped:', error);
      stopRunner(error.message || 'Runner stopped');
      return;
    } finally {
      if (!runnerTimer) {
        runnerBusy = false;
      }
    }
  }

  // --- Queue rendering ---
  function renderItems() {
    while (body.firstChild) body.removeChild(body.firstChild);

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No pending prompts';
      body.appendChild(empty);
      countBadge.style.display = 'none';
      return;
    }

    countBadge.textContent = items.length;
    countBadge.style.display = '';

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'queue-item';
      row.dataset.id = item.id;

      if (item.hero_image) {
        const img = document.createElement('img');
        img.className = 'item-thumb';
        img.alt = '';
        img.src = item.hero_image.startsWith('http')
          ? item.hero_image
          : 'https://sk1ff.com' + item.hero_image;
        row.appendChild(img);
      }

      const itemBody = document.createElement('div');
      itemBody.className = 'item-body';

      const prompt = document.createElement('div');
      prompt.className = 'item-prompt';
      prompt.textContent = item.copy_text;
      itemBody.appendChild(prompt);

      const srefLabel = item.sref_name || item.sref_code || '';
      if (srefLabel) {
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = srefLabel + ' \u00B7 --r ' + item.repeat_count;
        itemBody.appendChild(meta);
      }

      row.appendChild(itemBody);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      function markItemDone(row, item) {
        browser.runtime.sendMessage(
          { action: 'markQueueItemDone', itemId: item.id },
          (response) => {
            if (response && response.success) {
              row.classList.add('done-state');
              setTimeout(() => {
                items = items.filter(i => i.id !== item.id);
                renderItems();
              }, 400);
            }
          }
        );
      }

      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'action-btn paste-btn';
      pasteBtn.textContent = 'Paste';
      pasteBtn.addEventListener('click', () => {
        const success = injectIntoMidjourney(findPromptInputOnce(), item);
        if (success) {
          pasteBtn.textContent = '\u2713 Pasted';
          row.classList.add('copied-state');
          if (autoDone) {
            markItemDone(row, item);
          } else {
            setTimeout(() => {
              pasteBtn.textContent = 'Paste';
            }, 2000);
          }
        } else {
          pasteBtn.textContent = 'No field found';
          setTimeout(() => {
            pasteBtn.textContent = 'Paste';
          }, 2000);
        }
      });
      actions.appendChild(pasteBtn);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(item.copy_text).then(() => {
          copyBtn.textContent = '\u2713';
          copyBtn.classList.add('copied');
          row.classList.add('copied-state');
          if (autoDone) {
            markItemDone(row, item);
          } else {
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 2000);
          }
        });
      });
      actions.appendChild(copyBtn);

      if (!autoDone) {
        const doneBtn = document.createElement('button');
        doneBtn.className = 'action-btn done-btn';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', () => {
          doneBtn.textContent = '...';
          doneBtn.disabled = true;
          markItemDone(row, item);
        });
        actions.appendChild(doneBtn);
      }

      row.appendChild(actions);
      body.appendChild(row);
    });
  }

  // --- Load queue ---
  function loadQueue() {
    while (body.firstChild) body.removeChild(body.firstChild);
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.textContent = 'Loading queue...';
    body.appendChild(loading);

    return new Promise((resolve) => {
      browser.runtime.sendMessage(
        { action: 'getQueueItems', status: 'pending' },
        (response) => {
          if (response && response.success) {
            items = response.data || [];
            renderItems();
            resolve(items);
          } else {
            while (body.firstChild) body.removeChild(body.firstChild);
            const err = document.createElement('div');
            err.className = 'error-state';
            err.textContent = (response && response.error) || 'Failed to load';

            const retry = document.createElement('div');
            retry.style.marginTop = '8px';
            const retryLink = document.createElement('span');
            retryLink.className = 'refresh-link';
            retryLink.textContent = 'Retry';
            retryLink.addEventListener('click', loadQueue);
            retry.appendChild(retryLink);

            body.appendChild(err);
            body.appendChild(retry);
            resolve([]);
          }
        }
      );
    });
  }

  // Refresh button
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadQueue();
  });

  runBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (runnerActive) {
      stopRunner('Stopped');
      return;
    }
    promptsSinceBreak = 0;
    nextBreakAt = Math.floor(Math.random() * 11) + 5;
    runnerTempo = 1.0;
    currentRunToken++; // fresh token for this run
    setRunnerUi(true, 'Starting...');
    await runNextQueueItem();
  });

  // Initial load
  loadQueue();

  // Auto-refresh every 30s when panel is expanded and runner is idle
  setInterval(() => {
    if (!isMinimized && !runnerActive) loadQueue();
  }, 30000);
})();
