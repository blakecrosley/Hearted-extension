// Hearted - Floating Queue Panel for Midjourney
// Displays prompt queue from sk1ff.com as a draggable overlay on midjourney.com
'use strict';

(function () {
  const PANEL_ID = 'hearted-queue-panel-host';
  const STORAGE_KEY_POS = 'heartedQueuePanelPos';
  const STORAGE_KEY_MIN = 'heartedQueuePanelMinimized';

  // Prevent duplicate injection
  if (document.getElementById(PANEL_ID)) return;

  // --- Shadow DOM host ---
  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

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

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'header-btn';
  refreshBtn.title = 'Refresh';
  refreshBtn.textContent = '\u21BB'; // ↻

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'header-btn';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.textContent = '\u2212'; // −

  header.appendChild(titleSpan);
  header.appendChild(countBadge);
  header.appendChild(refreshBtn);
  header.appendChild(minimizeBtn);

  const body = document.createElement('div');
  body.className = 'panel-body';

  panel.appendChild(header);
  panel.appendChild(body);
  shadow.appendChild(panel);

  // --- State ---
  let isMinimized = false;
  let items = [];

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
  browser.storage.local.get([STORAGE_KEY_POS, STORAGE_KEY_MIN], (result) => {
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
  });

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

      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(item.copy_text).then(() => {
          copyBtn.textContent = '\u2713';
          copyBtn.classList.add('copied');
          row.classList.add('copied-state');
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
          }, 2000);
        });
      });
      actions.appendChild(copyBtn);

      const doneBtn = document.createElement('button');
      doneBtn.className = 'action-btn done-btn';
      doneBtn.textContent = 'Done';
      doneBtn.addEventListener('click', () => {
        doneBtn.textContent = '...';
        doneBtn.disabled = true;
        browser.runtime.sendMessage(
          { action: 'markQueueItemDone', itemId: item.id },
          (response) => {
            if (response && response.success) {
              row.classList.add('done-state');
              doneBtn.textContent = '\u2713';
              // Remove from list after brief delay
              setTimeout(() => {
                items = items.filter(i => i.id !== item.id);
                renderItems();
              }, 600);
            } else {
              doneBtn.textContent = 'Err';
              doneBtn.disabled = false;
              setTimeout(() => { doneBtn.textContent = 'Done'; }, 1500);
            }
          }
        );
      });
      actions.appendChild(doneBtn);

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

    browser.runtime.sendMessage(
      { action: 'getQueueItems', status: 'pending' },
      (response) => {
        if (response && response.success) {
          items = response.data || [];
          renderItems();
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
        }
      }
    );
  }

  // Refresh button
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadQueue();
  });

  // Initial load
  loadQueue();
})();
