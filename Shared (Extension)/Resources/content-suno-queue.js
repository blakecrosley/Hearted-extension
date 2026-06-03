// Hearted - Floating Queue Panel for Suno
// Displays style prompts from sk1ff.com as a draggable overlay on suno.com
'use strict';

(function () {
  const PANEL_ID = 'hearted-suno-queue-host';
  const STORAGE_KEY_POS = 'heartedSunoQueuePos';
  const STORAGE_KEY_MIN = 'heartedSunoQueueMin';
  const STORAGE_KEY_AUTO = 'heartedSunoQueueAuto';

  if (document.getElementById(PANEL_ID)) return;

  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

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
      width: 340px;
      background: linear-gradient(135deg, #1a1610 0%, #1e1a12 100%);
      border: 1px solid rgba(255,180,50,0.15);
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
      background: rgba(255,180,50,0.04);
      border-bottom: 1px solid rgba(255,180,50,0.1);
      cursor: grab;
      user-select: none;
    }

    .panel-header:active { cursor: grabbing; }

    .panel-title {
      font-size: 13px;
      font-weight: 600;
      background: linear-gradient(135deg, #f5a623 0%, #e8811c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      flex: 1;
    }

    .panel-count {
      font-size: 10px;
      background: rgba(245, 166, 35, 0.3);
      color: #f5a623;
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
    .panel-body::-webkit-scrollbar-thumb { background: rgba(255,180,50,0.2); border-radius: 2px; }

    .queue-item {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .queue-item:last-child { border-bottom: none; }

    .queue-item.copied-state {
      background: rgba(245, 166, 35, 0.06);
    }

    .queue-item.done-state {
      opacity: 0.4;
    }

    .item-body {
      flex: 1;
      min-width: 0;
    }

    .item-prompt {
      font-size: 11px;
      color: rgba(255,255,255,0.8);
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
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
      border: 1px solid rgba(255,180,50,0.2);
      border-radius: 5px;
      background: rgba(255,180,50,0.05);
      color: rgba(255,255,255,0.7);
      font-size: 10px;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      text-align: center;
    }

    .action-btn:hover {
      background: rgba(255,180,50,0.15);
      color: #fff;
      border-color: rgba(255,180,50,0.4);
    }

    .action-btn.copy-btn.copied {
      background: rgba(245, 166, 35, 0.25);
      color: #f5a623;
      border-color: rgba(245, 166, 35, 0.5);
    }

    .action-btn.done-btn {
      color: rgba(245, 166, 35, 0.7);
      border-color: rgba(245, 166, 35, 0.3);
    }

    .action-btn.done-btn:hover {
      background: rgba(245, 166, 35, 0.15);
      color: #f5a623;
    }

    .action-btn.paste-btn {
      background: rgba(245, 166, 35, 0.2);
      color: #f5a623;
      border-color: rgba(245, 166, 35, 0.4);
      font-weight: 600;
    }

    .action-btn.paste-btn:hover {
      background: rgba(245, 166, 35, 0.35);
      color: #fff;
    }

    .action-btn.paste-btn.pasted {
      background: rgba(76, 175, 80, 0.25);
      color: #4caf50;
      border-color: rgba(76, 175, 80, 0.5);
    }

    .item-meta {
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      margin-top: 2px;
      font-style: italic;
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
      background: rgba(245, 166, 35, 0.5);
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
  titleSpan.textContent = 'Suno Queue';

  const countBadge = document.createElement('span');
  countBadge.className = 'panel-count';
  countBadge.style.display = 'none';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'header-btn';
  refreshBtn.title = 'Refresh';
  refreshBtn.textContent = '\u21BB';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'header-btn';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.textContent = '\u2212';

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
  header.appendChild(toggleWrap);
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

  function setMinimized(minimized) {
    isMinimized = minimized;
    panel.classList.toggle('minimized', minimized);
    minimizeBtn.textContent = minimized ? '\u002B' : '\u2212';
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

  browser.storage.local.get([STORAGE_KEY_POS, STORAGE_KEY_MIN, STORAGE_KEY_AUTO], (result) => {
    const pos = result[STORAGE_KEY_POS];
    if (pos) {
      const maxX = window.innerWidth - 340;
      const maxY = window.innerHeight - 60;
      panel.style.left = Math.min(Math.max(0, pos.x), maxX) + 'px';
      panel.style.top = Math.min(Math.max(0, pos.y), maxY) + 'px';
      panel.style.right = 'auto';
    }
    if (result[STORAGE_KEY_MIN]) setMinimized(true);
    if (result[STORAGE_KEY_AUTO]) setAutoDone(true);
  });

  // --- Suno DOM injection ---
  // React controls these inputs, so we need to use the native setter
  // to bypass React's synthetic event system, then dispatch an input event.
  function setFieldValue(el, value) {
    if (!el) return false;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.focus();
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }
      // Suno's create fields are React-controlled. The native prototype setter
      // above bypasses React's value tracker; React then detects the change via
      // a native 'input' InputEvent (a plain Event is ignored by newer React).
      let evt;
      try {
        evt = new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' });
      } catch (_) {
        evt = new Event('input', { bubbles: true });
      }
      el.dispatchEvent(evt);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value === value;
    }

    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
      el.focus();
      el.textContent = value;
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } catch (_) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return (el.textContent || '') === value;
    }

    return false;
  }

  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0));
  }

  function findFirstField(selectors) {
    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll(selector));
      const visibleMatch = matches.find(isVisible);
      if (visibleMatch) return visibleMatch;
      if (matches.length > 0) return matches[0];
    }
    return null;
  }

  function findStyleField() {
    const directMatch = findFirstField([
      '[data-testid="create-form-styles-wrapper"] textarea',
      'textarea[maxlength="1000"]:not([data-testid="lyrics-textarea"])',
      'textarea[aria-label*="Style" i]',
      '[role="textbox"][aria-label*="Style" i]'
    ]);
    if (directMatch) return directMatch;

    const candidates = Array.from(document.querySelectorAll(
      'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]'
    )).filter((el) => {
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const testid = (el.getAttribute('data-testid') || '').toLowerCase();
      const surrounding = (el.closest('section, form, [role="dialog"], [role="region"], div')?.textContent || '').toLowerCase();

      if (testid.includes('lyrics')) return false;
      if (placeholder.includes('exclude') || aria.includes('exclude')) return false;
      if (placeholder.includes('song title') || aria.includes('song title')) return false;
      if (placeholder.includes('search') || aria.includes('search')) return false;

      return surrounding.includes('styles') || placeholder.includes('describe') || aria.includes('style');
    });

    const visibleCandidate = candidates.find(isVisible);
    return visibleCandidate || candidates[0] || null;
  }

  function findLyricsField() {
    return findFirstField(['textarea[data-testid="lyrics-textarea"]']);
  }

  function findTitleField() {
    return findFirstField([
      'input[placeholder="Song Title (Optional)"]',
      'input[placeholder*="Song Title"]'
    ]);
  }

  function findExcludeField() {
    return findFirstField([
      'input[placeholder="Exclude styles"]',
      'input[placeholder*="Exclude"]'
    ]);
  }

  function fillSunoFields(style, lyrics, title, exclude) {
    let filled = 0;

    const styleEl = findStyleField();
    if (styleEl && style) {
      setFieldValue(styleEl, style);
      filled++;
    }

    if (lyrics) {
      const lyricsEl = findLyricsField();
      if (lyricsEl) {
        setFieldValue(lyricsEl, lyrics);
        filled++;
      }
    }

    if (title) {
      const titleEl = findTitleField();
      if (titleEl) {
        setFieldValue(titleEl, title);
        filled++;
      }
    }

    if (exclude) {
      const excludeEl = findExcludeField();
      if (excludeEl) {
        setFieldValue(excludeEl, exclude);
        filled++;
      }
    }

    return filled;
  }

  function injectIntoSuno(item, callback) {
    // Parse extra fields from parameters JSON (if present)
    let lyrics = '';
    let title = '';
    let exclude = '';
    try {
      if (item.parameters) {
        const parsed = JSON.parse(item.parameters);
        lyrics = parsed.lyrics || '';
        title = parsed.title || '';
        exclude = parsed.exclude || '';
      }
    } catch (e) {}

    const style = item.prompt_text || item.copy_text || '';

    // Expand collapsed accordion sections so textareas are rendered
    let needsDelay = false;
    document.querySelectorAll('[role="button"][aria-expanded="false"]').forEach(btn => {
      const label = btn.textContent || '';
      if (label.includes('Styles') || label.includes('Lyrics') || label.includes('More Options')) {
        btn.click();
        needsDelay = true;
      }
    });

    // If we expanded sections, wait for React to render before injecting.
    // NOTE: Suno removed the inline Song Title field from the create form, so
    // title is not counted toward `expected` (it can never be filled here).
    const doInject = (attempt = 0) => {
      const filled = fillSunoFields(style, lyrics, title, exclude);
      const expected = (style ? 1 : 0) + (lyrics ? 1 : 0) + (exclude ? 1 : 0);

      if (filled >= expected || attempt >= 7) {
        if (callback) callback(filled > 0);
        return;
      }

      setTimeout(() => doInject(attempt + 1), 200);
    };

    // Accordion expansion (More Options, holding Exclude) animates in, so wait
    // a beat before the first injection attempt.
    setTimeout(() => doInject(0), needsDelay ? 300 : 0);
  }

  // --- Rendering ---
  function renderItems() {
    while (body.firstChild) body.removeChild(body.firstChild);

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No pending styles';
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

      const itemBody = document.createElement('div');
      itemBody.className = 'item-body';

      const prompt = document.createElement('div');
      prompt.className = 'item-prompt';
      prompt.textContent = item.prompt_text || item.copy_text;
      itemBody.appendChild(prompt);

      // Show indicators for lyrics/title if present
      let hasLyrics = false;
      let hasTitle = false;
      let hasExclude = false;
      try {
        if (item.parameters) {
          const parsed = JSON.parse(item.parameters);
          hasLyrics = !!parsed.lyrics;
          hasTitle = !!parsed.title;
          hasExclude = !!parsed.exclude;
        }
      } catch (e) {}

      if (hasLyrics || hasTitle || hasExclude) {
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        const parts = [];
        if (hasLyrics) parts.push('+ lyrics');
        if (hasTitle) parts.push('+ title');
        if (hasExclude) parts.push('+ exclude');
        meta.textContent = parts.join(' ');
        itemBody.appendChild(meta);
      }

      row.appendChild(itemBody);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      function markItemDone(row, item) {
        browser.runtime.sendMessage(
          { action: 'markSunoQueueItemDone', itemId: item.id },
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

      // Paste button — injects directly into Suno's form fields
      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'action-btn paste-btn';
      pasteBtn.textContent = 'Paste';
      pasteBtn.addEventListener('click', () => {
        pasteBtn.textContent = '\u2026';
        injectIntoSuno(item, (success) => {
          if (success) {
            pasteBtn.textContent = '\u2713 Pasted';
            pasteBtn.classList.add('pasted');
            row.classList.add('copied-state');
            if (autoDone) {
              markItemDone(row, item);
            } else {
              setTimeout(() => {
                pasteBtn.textContent = 'Paste';
                pasteBtn.classList.remove('pasted');
              }, 2000);
            }
          } else {
            pasteBtn.textContent = 'No fields found';
            setTimeout(() => { pasteBtn.textContent = 'Paste'; }, 2000);
          }
        });
      });
      actions.appendChild(pasteBtn);

      // Copy button — fallback clipboard copy
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        const textToCopy = item.prompt_text || item.copy_text;
        navigator.clipboard.writeText(textToCopy).then(() => {
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
    loading.textContent = 'Loading styles...';
    body.appendChild(loading);

    browser.runtime.sendMessage(
      { action: 'getSunoQueueItems', status: 'pending' },
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

  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadQueue();
  });

  loadQueue();

  setInterval(() => {
    if (!isMinimized) loadQueue();
  }, 30000);
})();
