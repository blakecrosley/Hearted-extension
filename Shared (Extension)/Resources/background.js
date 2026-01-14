// Hearted - Background Service Worker
// Handles communication between content scripts and the local API

const API_BASE = 'http://localhost:8100/api';

// Get stored API key from browser storage
async function getApiKey() {
  try {
    const result = await browser.storage.local.get('apiKey');
    return result.apiKey || '';
  } catch (error) {
    console.error('Failed to get API key:', error);
    return '';
  }
}

// Helper to create headers with API key
async function getAuthHeaders() {
  const apiKey = await getApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // API Key management
  if (message.action === 'setApiKey') {
    browser.storage.local.set({ apiKey: message.apiKey })
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'getApiKey') {
    getApiKey()
      .then(apiKey => sendResponse({ success: true, apiKey }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'capture') {
    captureItem(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'captureTweet') {
    captureTweet(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'capturePin') {
    capturePin(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'captureMidjourney') {
    console.log('Hearted BG: Received captureMidjourney message');
    console.log('Hearted BG: Data:', JSON.stringify(message.data, null, 2));
    captureMidjourney(message.data)
      .then(result => {
        console.log('Hearted BG: Capture succeeded:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('Hearted BG: Capture failed:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'updateInstagramImage') {
    updateInstagramImage(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'checkDuplicate') {
    checkDuplicate(message.url)
      .then(result => sendResponse({ success: true, exists: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Capture a generic URL
async function captureItem(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a tweet
async function captureTweet(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture/tweet`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a Pinterest pin
async function capturePin(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture/pin`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a Midjourney image
async function captureMidjourney(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture/midjourney`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Update Instagram item with image
async function updateInstagramImage(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/instagram/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Check if URL already exists
async function checkDuplicate(url) {
  const apiKey = await getApiKey();
  const headers = {};
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${API_BASE}/check-duplicate?url=${encodeURIComponent(url)}`, {
    headers
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return data.exists;
}

// Keyboard shortcut handler (Cmd+Shift+H)
browser.commands?.onCommand?.addListener((command) => {
  if (command === 'save-page') {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        captureItem({
          url: tabs[0].url,
          title: tabs[0].title
        });
      }
    });
  }
});
