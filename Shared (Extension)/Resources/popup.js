// Hearted - Extension Popup Script

const API_BASE = 'https://h3arted.com/api';

// DOM elements
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');
const saveBtn = document.getElementById('save-btn');
const btnText = document.getElementById('btn-text');
const status = document.getElementById('status');
const stats = document.getElementById('stats');

// Settings DOM elements
const settingsToggle = document.getElementById('settings-toggle');
const settingsContent = document.getElementById('settings-content');
const settingsArrow = document.getElementById('settings-arrow');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const apiKeyStatus = document.getElementById('api-key-status');

// Current tab info
let currentTab = null;

// Cached API key
let cachedApiKey = '';

// Helper to get auth headers with API key
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (cachedApiKey) {
    headers['X-API-Key'] = cachedApiKey;
  }
  return headers;
}

// Load API key from storage
async function loadApiKey() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getApiKey' });
    if (response.success && response.apiKey) {
      cachedApiKey = response.apiKey;
      updateApiKeyStatus(true);
    } else {
      updateApiKeyStatus(false);
    }
  } catch (e) {
    console.error('Failed to load API key:', e);
    updateApiKeyStatus(false);
  }
}

// Update API key status display
function updateApiKeyStatus(isConfigured) {
  if (isConfigured) {
    apiKeyStatus.textContent = '✓ API Key configured';
    apiKeyStatus.className = 'api-key-status configured';
  } else {
    apiKeyStatus.textContent = '⚠ API Key not set';
    apiKeyStatus.className = 'api-key-status missing';
  }
}

// Save API key
async function saveApiKey() {
  const newKey = apiKeyInput.value.trim();
  if (!newKey) return;

  try {
    const response = await browser.runtime.sendMessage({
      action: 'setApiKey',
      apiKey: newKey
    });

    if (response.success) {
      cachedApiKey = newKey;
      apiKeyInput.value = '';
      saveApiKeyBtn.textContent = 'Saved!';
      saveApiKeyBtn.classList.add('saved');
      updateApiKeyStatus(true);

      // Reset button after delay
      setTimeout(() => {
        saveApiKeyBtn.textContent = 'Save API Key';
        saveApiKeyBtn.classList.remove('saved');
      }, 2000);

      // Reload stats with new key
      loadStats();
    }
  } catch (e) {
    console.error('Failed to save API key:', e);
  }
}

// Toggle settings visibility
function toggleSettings() {
  settingsContent.classList.toggle('visible');
  settingsArrow.textContent = settingsContent.classList.contains('visible') ? '▲' : '▼';
}

// Initialize popup
async function init() {
  try {
    // Load API key first
    await loadApiKey();

    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    if (currentTab) {
      pageTitle.textContent = currentTab.title || 'Untitled';
      pageUrl.textContent = currentTab.url;

      // Check if already saved
      const exists = await checkDuplicate(currentTab.url);
      if (exists) {
        saveBtn.classList.add('success');
        btnText.textContent = 'Already Saved ✓';
        saveBtn.disabled = true;
      }
    }

    // Load stats
    loadStats();
  } catch (e) {
    console.error('Init error:', e);
    status.textContent = 'Error loading page info';
    status.classList.add('error');
  }
}

// Check if URL already exists
async function checkDuplicate(url) {
  try {
    const headers = {};
    if (cachedApiKey) {
      headers['X-API-Key'] = cachedApiKey;
    }
    const response = await fetch(`${API_BASE}/check-duplicate?url=${encodeURIComponent(url)}`, {
      headers
    });
    if (response.ok) {
      const data = await response.json();
      return data.exists;
    }
  } catch (e) {
    // API might not be running, ignore
  }
  return false;
}

// Save current page
async function savePage() {
  if (!currentTab) return;

  saveBtn.disabled = true;
  btnText.textContent = 'Saving...';
  status.textContent = '';
  status.className = 'status';

  try {
    // Extract metadata from the page
    const metadata = await extractPageMetadata();

    const response = await fetch(`${API_BASE}/capture`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        url: currentTab.url,
        title: currentTab.title,
        ...metadata
      })
    });

    if (response.ok) {
      const data = await response.json();
      saveBtn.classList.add('success');
      btnText.textContent = 'Saved! ❤️';
      status.textContent = data.is_duplicate ? 'Already in your archive' : 'Added to your archive';
      status.classList.add('success');

      // Update stats
      loadStats();
    } else {
      throw new Error(`API error: ${response.status}`);
    }
  } catch (e) {
    console.error('Save error:', e);
    saveBtn.classList.add('error');
    btnText.textContent = 'Error';
    status.textContent = e.message.includes('Failed to fetch')
      ? 'Is the Hearted server running?'
      : e.message;
    status.classList.add('error');

    // Reset button after delay
    setTimeout(() => {
      saveBtn.classList.remove('error');
      saveBtn.disabled = false;
      btnText.textContent = 'Save This Page';
    }, 3000);
  }
}

// Extract metadata from the current page
async function extractPageMetadata() {
  try {
    const results = await browser.tabs.executeScript(currentTab.id, {
      code: `
        (function() {
          const getMeta = (name) => {
            const el = document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
            return el ? el.content : null;
          };

          return {
            description: getMeta('og:description') || getMeta('description') || '',
            image_url: getMeta('og:image') || getMeta('twitter:image') || '',
            site_name: getMeta('og:site_name') || '',
            type: getMeta('og:type') || ''
          };
        })();
      `
    });

    return results[0] || {};
  } catch (e) {
    console.error('Metadata extraction error:', e);
    return {};
  }
}

// Load archive stats
async function loadStats() {
  try {
    const headers = {};
    if (cachedApiKey) {
      headers['X-API-Key'] = cachedApiKey;
    }
    const response = await fetch(`${API_BASE}/stats`, { headers });
    if (response.ok) {
      const data = await response.json();
      stats.textContent = `${data.total_items || 0} items saved`;
    } else if (response.status === 401) {
      stats.textContent = 'Auth required';
    }
  } catch (e) {
    stats.textContent = 'Server offline';
  }
}

// Event listeners
saveBtn.addEventListener('click', savePage);
settingsToggle.addEventListener('click', toggleSettings);
saveApiKeyBtn.addEventListener('click', saveApiKey);
apiKeyInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveApiKey();
});

// Initialize on load
init();
