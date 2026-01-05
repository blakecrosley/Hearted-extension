// Hearted - Background Service Worker
// Handles communication between content scripts and the local API

const API_BASE = 'http://localhost:8100/api';

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.action === 'checkDuplicate') {
    checkDuplicate(message.url)
      .then(result => sendResponse({ success: true, exists: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Capture a generic URL
async function captureItem(data) {
  const response = await fetch(`${API_BASE}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a tweet
async function captureTweet(data) {
  const response = await fetch(`${API_BASE}/capture/tweet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a Pinterest pin
async function capturePin(data) {
  const response = await fetch(`${API_BASE}/capture/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Check if URL already exists
async function checkDuplicate(url) {
  const response = await fetch(`${API_BASE}/check-duplicate?url=${encodeURIComponent(url)}`);

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
