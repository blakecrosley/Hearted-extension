// Hearted - Midjourney Content Script
// Scrapes images, videos, and prompts from Midjourney explore and gallery pages

(function() {
  'use strict';

  const CAPTURED_JOBS = new Set();
  let isCapturing = false;
  let captureCount = 0;

  // Check if we're on a page with Midjourney content
  function isMidjourneyPage() {
    const path = window.location.pathname;
    return path.includes('/explore') ||
           path.includes('/archive') ||
           path.includes('/app/') ||
           path.includes('/jobs/') ||
           path === '/';
  }

  // Check if current page is video tab
  function isVideoTab() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab && tab.includes('video');
  }

  // Check if detail view has video content
  function hasVideoContent() {
    return document.querySelector('video[src*="cdn.midjourney.com"]') !== null ||
           document.querySelector('video source[src*="cdn.midjourney.com"]') !== null;
  }

  // Wait for an element to appear in the DOM
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeout);
    });
  }

  // Wait for prompt text to appear (longer text in a <p> tag)
  async function waitForPrompt(timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const paragraphs = document.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent?.trim();
        if (text && text.length > 50 &&
            !text.includes('Loading') &&
            !text.includes('Settings') &&
            !text.includes('Explore') &&
            !text.includes('Copyright') &&
            !text.includes('Sign in')) {
          return text;
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return '';
  }

  // Construct video URL from job ID (Midjourney uses predictable URLs)
  function constructVideoUrl(jobId) {
    return `https://cdn.midjourney.com/video/${jobId}/0.mp4`;
  }

  // Construct image URL from job ID
  function constructImageUrl(jobId) {
    return `https://cdn.midjourney.com/${jobId}/0_0.jpeg`;
  }

  // Extract job ID from URL or element
  function extractJobId(element) {
    // From link href
    const link = element.closest('a[href*="/jobs/"]') || element.querySelector('a[href*="/jobs/"]');
    if (link) {
      const match = link.href.match(/\/jobs\/([a-f0-9-]+)/);
      if (match) return match[1];
    }
    return null;
  }

  // Extract data from a grid image element
  function extractImageData(element) {
    try {
      const jobId = extractJobId(element);
      if (!jobId || CAPTURED_JOBS.has(jobId)) {
        return null;
      }

      // Get the link for navigation
      const link = element.closest('a[href*="/jobs/"]') || element.querySelector('a[href*="/jobs/"]');
      const jobUrl = link?.href || `https://www.midjourney.com/jobs/${jobId}`;

      // Get image URL - try background-image first (grid view), then img src
      let imageUrl = '';
      const bgImage = element.style.backgroundImage || window.getComputedStyle(element).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
        if (match) imageUrl = match[1];
      }

      if (!imageUrl) {
        const img = element.querySelector('img[src*="cdn.midjourney.com"]') ||
                    element.closest('a')?.querySelector('img[src*="cdn.midjourney.com"]');
        if (img) imageUrl = img.src;
      }

      // Upgrade to higher quality if possible
      if (imageUrl) {
        // Replace thumbnail sizes with larger versions
        imageUrl = imageUrl
          .replace(/_384_N\.webp/, '_1024_N.webp')
          .replace(/_256_N\.webp/, '_1024_N.webp')
          .replace(/\/0_\d+\.jpeg/, '/0_0.jpeg');
      }

      // Get username from nearby element
      const parent = element.closest('[class*="group"]') || element.parentElement?.parentElement;
      const usernameEl = parent?.querySelector('[class*="text-xs"]') ||
                         parent?.querySelector('[class*="username"]');
      const username = usernameEl?.textContent?.trim() || '';

      // Detect if this is a video from URL pattern (contains /video/)
      const isVideo = imageUrl.includes('/video/') || isVideoTab();
      let videoUrl = '';

      if (isVideo) {
        // Construct the actual video URL from job ID
        videoUrl = constructVideoUrl(jobId);
      }

      return {
        source_id: jobId,
        url: jobUrl,
        title: `Midjourney ${isVideo ? 'Video' : 'Image'} - ${jobId.substring(0, 8)}`,
        description: '', // Will be filled from detail view
        image_url: imageUrl,
        content_type: isVideo ? 'video' : 'ai_image',
        source: 'midjourney',
        raw_data: {
          job_id: jobId,
          image_url: imageUrl,
          video_url: videoUrl,
          is_video: isVideo,
          username: username,
          prompt: '', // Grid capture can't get prompts - use Capture This on detail view
          parameters: {}
        }
      };
    } catch (e) {
      console.error('Hearted: Error extracting Midjourney image data', e);
      return null;
    }
  }

  // Extract full data from the detail modal/page (async for waiting)
  async function extractDetailData() {
    try {
      // Get job ID from URL
      const urlMatch = window.location.pathname.match(/\/jobs\/([a-f0-9-]+)/);
      if (!urlMatch) {
        console.error('Hearted: No job ID found in URL:', window.location.pathname);
        return null;
      }
      const jobId = urlMatch[1];

      console.log('Hearted: Extracting data for job', jobId);
      console.log('Hearted: Current URL:', window.location.href);

      // Wait a moment for React to render content
      await new Promise(r => setTimeout(r, 500));

      // Find video element specifically for THIS job ID (page shows multiple videos)
      let isVideo = false;
      let videoUrl = '';
      let imageUrl = '';

      // Look for video element whose src contains our job ID
      const matchingVideo = document.querySelector(`video[src*="${jobId}"]`);
      if (matchingVideo && matchingVideo.src) {
        videoUrl = matchingVideo.src;
        isVideo = true;
        imageUrl = matchingVideo.poster || `https://cdn.midjourney.com/video/${jobId}/0_640_N.webp`;
        console.log('Hearted: Found matching video:', videoUrl);
      }

      // If no video element, check if URL pattern suggests video (on video explore tab)
      if (!videoUrl && isVideoTab()) {
        // On video tab, construct the video URL directly
        videoUrl = constructVideoUrl(jobId);
        isVideo = true;
        imageUrl = `https://cdn.midjourney.com/video/${jobId}/0_640_N.webp`;
        console.log('Hearted: On video tab, constructed URL:', videoUrl);
      }

      // If still no video, look for an image with this job ID
      if (!isVideo) {
        // Look for image element for this job
        const matchingImg = document.querySelector(`img[src*="${jobId}"]`);
        if (matchingImg) {
          imageUrl = matchingImg.src;
          // Upgrade to higher quality
          imageUrl = imageUrl.replace(/_\d+_N\.webp/, '_1024_N.webp');
        } else {
          // Construct image URL as fallback
          imageUrl = constructImageUrl(jobId);
        }
        console.log('Hearted: Found image:', imageUrl);
      }

      // Wait for prompt to appear in DOM (async)
      console.log('Hearted: Waiting for prompt...');
      let prompt = await waitForPrompt(5000);
      console.log('Hearted: Got prompt:', prompt ? prompt.substring(0, 50) + '...' : '(empty)');

      // Get parameters from buttons and text
      const parameters = {};
      document.querySelectorAll('button, span, div').forEach(el => {
        const text = el.textContent || '';

        // Aspect ratio
        if (text.includes('ar') && text.match(/\d+:\d+/)) {
          const match = text.match(/(\d+:\d+)/);
          if (match) parameters.aspect_ratio = match[1];
        }
        // Style
        if (text.includes('--style')) {
          const match = text.match(/--style\s*(\w+)/);
          if (match) parameters.style = match[1];
        }
        // Stylize
        if ((text.includes('--stylize') || text.toLowerCase().includes('stylize')) && text.match(/\d+/)) {
          const match = text.match(/(\d+)/);
          if (match) parameters.stylize = match[1];
        }
        // Profile
        if (text.includes('--profile')) {
          const match = text.match(/--profile\s*(\w+)/);
          if (match) parameters.profile = match[1];
        }
        // Chaos
        if ((text.includes('--chaos') || text.toLowerCase().includes('chaos')) && text.match(/\d+/)) {
          const match = text.match(/(\d+)/);
          if (match) parameters.chaos = match[1];
        }
        // Raw mode
        if (text.toLowerCase() === 'raw' || text.includes('--raw')) {
          parameters.raw = true;
        }
        // Motion (video-specific)
        if (text.toLowerCase().includes('motion')) {
          const match = text.match(/motion\s*(\w+)/i);
          if (match) parameters.motion = match[1].toLowerCase();
        }
        // Duration (video-specific) - like "5.2s"
        if (text.match(/^\d+\.?\d*s$/)) {
          parameters.duration = text;
        }
        // Batch size
        if (text.includes('bs') && text.match(/bs\s*\d+/)) {
          const match = text.match(/bs\s*(\d+)/);
          if (match) parameters.batch_size = match[1];
        }
      });

      // Get username
      let username = '';
      const userEl = document.querySelector('[class*="font-semibold"]');
      if (userEl) {
        const text = userEl.textContent?.trim();
        if (text && text.match(/^[a-zA-Z0-9_.-]+$/)) {
          username = text;
        }
      }

      // Build the full job URL
      const variantIndex = new URLSearchParams(window.location.search).get('index') || '0';
      const jobUrl = `https://www.midjourney.com/jobs/${jobId}?index=${variantIndex}`;

      // Determine content type
      const contentType = isVideo ? 'video' : 'ai_image';

      const result = {
        source_id: jobId,
        url: jobUrl,
        title: prompt ? prompt.substring(0, 100) : `Midjourney ${isVideo ? 'Video' : 'Image'} - ${jobId.substring(0, 8)}`,
        description: prompt,
        image_url: imageUrl,
        content_type: contentType,
        source: 'midjourney',
        raw_data: {
          job_id: jobId,
          image_url: imageUrl,
          video_url: videoUrl,
          is_video: isVideo,
          username: username,
          prompt: prompt,
          parameters: parameters,
          variant_index: variantIndex
        }
      };

      console.log('Hearted: Built result object:', JSON.stringify(result, null, 2));
      return result;
    } catch (e) {
      console.error('Hearted: Error extracting detail data:', e.message, e.stack);
      return null;
    }
  }

  // Capture a single image
  async function captureImage(imageData) {
    console.log('Hearted: Sending capture request to background script...');
    console.log('Hearted: Data being sent:', JSON.stringify(imageData, null, 2));

    return new Promise((resolve, reject) => {
      try {
        browser.runtime.sendMessage({
          action: 'captureMidjourney',
          data: imageData
        }, response => {
          console.log('Hearted: Got response from background:', response);

          if (browser.runtime.lastError) {
            console.error('Hearted: Runtime error:', browser.runtime.lastError);
            reject(new Error(browser.runtime.lastError.message || 'Runtime error'));
            return;
          }

          if (response?.success) {
            CAPTURED_JOBS.add(imageData.source_id);
            captureCount++;
            console.log('Hearted: Capture successful!');
            resolve(response.data);
          } else {
            console.error('Hearted: Capture failed:', response?.error);
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      } catch (e) {
        console.error('Hearted: Exception sending message:', e);
        reject(e);
      }
    });
  }

  // Capture the current detail view
  async function captureCurrentDetail() {
    showToast('🔍 Extracting data...', false);

    const data = await extractDetailData();
    console.log('Hearted: Extracted data:', JSON.stringify(data, null, 2));

    if (data && !CAPTURED_JOBS.has(data.source_id)) {
      try {
        await captureImage(data);

        // Build detailed feedback message
        const parts = [];
        if (data.raw_data.is_video) {
          parts.push('🎬 Video');
        } else {
          parts.push('🎨 Image');
        }

        if (data.raw_data.prompt && data.raw_data.prompt.length > 0) {
          parts.push(`📝 Prompt (${data.raw_data.prompt.length} chars)`);
        }

        if (data.raw_data.video_url) {
          parts.push('📥 Video URL');
        }

        const feedback = parts.join(' + ');
        showToast(`✅ Captured: ${feedback}`);
        return true;
      } catch (e) {
        console.error('Hearted: Failed to capture', e);
        showToast('❌ Failed to capture: ' + e.message, true);
        return false;
      }
    } else if (data && CAPTURED_JOBS.has(data.source_id)) {
      showToast('⏭️ Already captured this');
      return false;
    }
    showToast('❌ Could not extract data', true);
    return false;
  }

  // Scan visible images and capture new ones (for scroll capture mode)
  async function scanAndCapture() {
    if (!isCapturing) return;

    // Find all image links in the grid
    const imageLinks = document.querySelectorAll('a[href*="/jobs/"]');
    console.log(`Hearted: Scanning ${imageLinks.length} Midjourney images`);

    for (const link of imageLinks) {
      // Find the image element within the link
      const imageEl = link.querySelector('[style*="background-image"]') ||
                      link.querySelector('img[src*="cdn.midjourney.com"]') ||
                      link;

      const imageData = extractImageData(imageEl);
      if (imageData) {
        try {
          // For grid capture, we capture basic info now
          // Full prompt will be captured when clicking into detail view
          await captureImage(imageData);
          // Add visual indicator
          link.style.outline = '3px solid #7289da';
          link.style.outlineOffset = '-3px';
        } catch (e) {
          console.error('Hearted: Failed to capture image', e);
        }
      }
    }
  }

  // Show toast notification
  function showToast(message, isError = false) {
    const existing = document.getElementById('hearted-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'hearted-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: ${isError ? '#ef4444' : '#22c55e'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      z-index: 10000;
      animation: fadeInOut 3s ease-in-out forwards;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(20px); }
        15% { opacity: 1; transform: translateY(0); }
        85% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
      }
    `;
    toast.appendChild(style);
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  // Create floating capture button
  function createCaptureUI() {
    if (document.getElementById('hearted-capture-ui')) return;

    const container = document.createElement('div');
    container.id = 'hearted-capture-ui';
    container.innerHTML = `
      <style>
        #hearted-capture-ui {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }
        .hearted-btn {
          background: linear-gradient(135deg, #7289da 0%, #5865f2 100%);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 24px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(88, 101, 242, 0.4);
          display: flex;
          align-items: center;
          gap: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .hearted-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(88, 101, 242, 0.5);
        }
        #hearted-capture-single {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
        }
        #hearted-capture-single:hover {
          box-shadow: 0 6px 16px rgba(217, 119, 6, 0.5);
        }
        #hearted-capture-scroll.active {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
        }
        .hearted-count {
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }
      </style>
      <button id="hearted-capture-single" class="hearted-btn">
        <span>🎨</span>
        <span>Capture This</span>
      </button>
      <button id="hearted-capture-scroll" class="hearted-btn">
        <span>📥</span>
        <span id="hearted-label">Scroll Capture</span>
        <span class="hearted-count" id="hearted-count">0</span>
      </button>
    `;

    document.body.appendChild(container);

    // Single capture button - captures current detail view
    const singleBtn = document.getElementById('hearted-capture-single');
    singleBtn.addEventListener('click', () => {
      captureCurrentDetail();
    });

    // Scroll capture button - captures as you scroll through grid
    const scrollBtn = document.getElementById('hearted-capture-scroll');
    const label = document.getElementById('hearted-label');

    scrollBtn.addEventListener('click', () => {
      isCapturing = !isCapturing;

      if (isCapturing) {
        scrollBtn.classList.add('active');
        label.textContent = 'Capturing...';
        scanAndCapture();
      } else {
        scrollBtn.classList.remove('active');
        label.textContent = 'Scroll Capture';
      }
    });

    // Update count display
    setInterval(() => {
      document.getElementById('hearted-count').textContent = captureCount;
    }, 500);

    // Show/hide single capture button based on whether we're in detail view
    function updateSingleButtonVisibility() {
      const isDetailView = window.location.pathname.includes('/jobs/');
      singleBtn.style.display = isDetailView ? 'flex' : 'none';
    }
    updateSingleButtonVisibility();

    // Watch for URL changes
    new MutationObserver(updateSingleButtonVisibility)
      .observe(document.body, { subtree: true, childList: true });
  }

  // Set up scroll listener for continuous capture
  function setupScrollListener() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      if (!isCapturing) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(scanAndCapture, 500);
    });
  }

  // Initialize
  function init() {
    const existingUI = document.getElementById('hearted-capture-ui');
    if (existingUI) existingUI.remove();

    if (isMidjourneyPage()) {
      console.log('Hearted: Detected Midjourney page, initializing capture UI');
      createCaptureUI();
      setupScrollListener();
    } else {
      console.log('Hearted: Not a Midjourney page, path:', window.location.pathname);
    }
  }

  // Run on page load with retries
  function initWithRetry(attempts = 0) {
    if (attempts > 5) {
      console.log('Hearted: Max init attempts reached');
      return;
    }

    const hasContent = document.querySelector('a[href*="/jobs/"]') !== null ||
                       window.location.pathname.includes('/jobs/');
    const hasUI = document.getElementById('hearted-capture-ui') !== null;

    if (hasContent && !hasUI) {
      init();
    } else if (!hasContent && attempts < 5) {
      setTimeout(() => initWithRetry(attempts + 1), 1000);
    }
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initWithRetry(0));
  } else {
    setTimeout(() => initWithRetry(0), 500);
  }

  // Watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => initWithRetry(0), 500);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();
