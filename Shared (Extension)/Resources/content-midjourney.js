// Hearted - Midjourney Content Script
// Scrapes images, videos, and prompts from Midjourney explore and gallery pages

(function() {
  'use strict';

  const CAPTURED_JOBS = new Set();
  const CAPTURED_SREFS = new Set();
  let isCapturing = false;
  let captureCount = 0;
  let srefObserver = null;
  let srefAutoCapturing = false;
  let srefCaptureCount = 0;

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

      // Extract parameters from pill/badge elements in the detail sidebar.
      // MJ V7 renders params as small pill elements like "chaos 10", "raw",
      // "ow 275", "stylize 1000", "profile zojb2s8" near the prompt text.
      const parameters = {};
      const srefCodes = []; // Collect multiple --sref values

      // Find parameter pills — they're typically small chip/badge elements
      // near the prompt, containing known parameter names.
      // Track seen text to avoid duplicates from parent+child matching.
      const seenPillText = new Set();
      document.querySelectorAll('button, span, div, p').forEach(el => {
        const text = (el.textContent || '').trim();
        if (!text || text.length > 40 || text.length < 2) return;

        // Skip if element has many children (container, not a pill)
        if (el.children.length > 3) return;

        // Deduplicate: skip if we've already processed this exact text
        if (seenPillText.has(text.toLowerCase())) return;

        const lower = text.toLowerCase();

        // Profile code: "profile xxxxx"
        const profileMatch = lower.match(/^profile\s+([a-z0-9]+)$/);
        if (profileMatch) {
          parameters.profile = profileMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Chaos: "chaos 10"
        const chaosMatch = lower.match(/^chaos\s+(\d+)$/);
        if (chaosMatch) {
          parameters.chaos = chaosMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Stylize: "stylize 1000"
        const stylizeMatch = lower.match(/^stylize\s+(\d+)$/);
        if (stylizeMatch) {
          parameters.stylize = stylizeMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Raw: "raw"
        if (lower === 'raw') {
          parameters.raw = true;
          seenPillText.add(lower);
          return;
        }
        // Omni weight: "ow 275"
        const owMatch = lower.match(/^ow\s+(\d+)$/);
        if (owMatch) {
          parameters.ow = owMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Aspect ratio: "ar 16:9" or just "16:9"
        const arMatch = lower.match(/^(?:ar\s+)?(\d+:\d+)$/);
        if (arMatch) {
          parameters.aspect_ratio = arMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Seed: "seed 12345"
        const seedMatch = lower.match(/^seed\s+(\d+)$/);
        if (seedMatch) {
          parameters.seed = seedMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Sref: "sref 12345" — collect ALL sref codes (multi-value supported)
        const srefMatch = lower.match(/^sref\s+(\d+)$/);
        if (srefMatch) {
          srefCodes.push(srefMatch[1]);
          seenPillText.add(lower);
          return;
        }
        // Version: "v 7" or "version 7"
        const vMatch = lower.match(/^(?:v|version)\s+([\d.]+)$/);
        if (vMatch) {
          parameters.version = vMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Niji: "niji 7"
        const nijiMatch = lower.match(/^niji\s+(\d+)$/);
        if (nijiMatch) {
          parameters.version = 'niji ' + nijiMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Quality: "quality 1" or "q 1"
        const qMatch = lower.match(/^(?:quality|q)\s+([\d.]+)$/);
        if (qMatch) {
          parameters.quality = qMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Weird: "weird 100"
        const weirdMatch = lower.match(/^weird\s+(\d+)$/);
        if (weirdMatch) {
          parameters.weird = weirdMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Exp (experimental): "exp 25"
        const expMatch = lower.match(/^exp\s+(\d+)$/);
        if (expMatch) {
          parameters.exp = expMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Style weight: "sw 150"
        const swMatch = lower.match(/^sw\s+(\d+)$/);
        if (swMatch) {
          parameters.sw = swMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Image weight: "iw 1.5"
        const iwMatch = lower.match(/^iw\s+([\d.]+)$/);
        if (iwMatch) {
          parameters.iw = iwMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Profile weight: "pw 50"
        const pwMatch = lower.match(/^pw\s+(\d+)$/);
        if (pwMatch) {
          parameters.pw = pwMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Repeat: "repeat 4"
        const repeatMatch = lower.match(/^repeat\s+(\d+)$/);
        if (repeatMatch) {
          parameters.repeat = repeatMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Draft mode
        if (lower === 'draft') {
          parameters.draft = true;
          seenPillText.add(lower);
          return;
        }
        // No (negative prompt): starts with "no " but NOT MJ UI text
        const noMatch = lower.match(/^no\s+(.+)$/);
        if (noMatch) {
          const noText = noMatch[1];
          // Filter out MJ UI messages like "profiles found", "moodboards found", etc.
          const uiPatterns = /found|available|results?|items?|images?|loading|error/i;
          if (!uiPatterns.test(noText)) {
            parameters.no = noText;
            seenPillText.add(lower);
            return;
          }
          return; // Skip UI text, don't mark as seen pill
        }
        // Motion (video): "motion low/med/high"
        const motionMatch = lower.match(/^motion\s+(\w+)$/);
        if (motionMatch) {
          parameters.motion = motionMatch[1];
          seenPillText.add(lower);
          return;
        }
        // Duration (video): "5.2s"
        if (text.match(/^\d+\.?\d*s$/)) {
          parameters.duration = text;
          seenPillText.add(lower);
          return;
        }
      });

      // Build multi-value --sref (space-separated codes)
      if (srefCodes.length > 0) {
        parameters.sref = srefCodes.join(' ');
      }

      // Extract omni reference (oref) thumbnail images.
      // These appear as a row of small clickable images between the prompt
      // text and the parameter pills.
      const orefUrls = [];
      document.querySelectorAll('img[src*="cdn.midjourney.com"]').forEach(img => {
        const src = img.src;
        // Skip the main image (large) — orefs are thumbnails (small, usually < 80px)
        const rect = img.getBoundingClientRect();
        if (rect.width > 0 && rect.width < 100 && rect.height > 0 && rect.height < 100) {
          // It's a thumbnail — likely an oref
          if (!orefUrls.includes(src)) {
            orefUrls.push(src);
          }
        }
      });
      if (orefUrls.length > 0) {
        parameters.oref_urls = orefUrls;
        console.log('Hearted: Found', orefUrls.length, 'oref images');
      }

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
            // source_id already added to CAPTURED_JOBS before this call
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
      // Mark as captured IMMEDIATELY to prevent race conditions
      CAPTURED_JOBS.add(data.source_id);
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
        // Remove from set if capture failed so it can be retried
        CAPTURED_JOBS.delete(data.source_id);
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

  // ===== Style Reference Capture (Style Explorer) =====

  // Check if we're on the Likes tab
  function isLikesTab() {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname.includes('/explore') && params.get('tab') === 'likes';
  }

  function isStyleExplorer() {
    // Never match on the likes tab — liked images may contain style links
    if (isLikesTab()) return false;

    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // URL-based: /explore with style-related tab/feature params
    if (path.includes('/explore') && (
      params.get('tab') === 'styles' ||
      params.get('tab') === 'style_references' ||
      params.get('feature') === 'style-reference' ||
      params.get('feature') === 'styles'
    )) return true;

    // DOM-based: presence of style card links (/styles/0_XXXX)
    if (document.querySelector('a[href*="/styles/"]')) return true;

    return false;
  }

  function extractSrefCode(card) {
    // Primary: extract from /styles/0_CODE link href
    const styleLink = card.querySelector('a[href*="/styles/"]');
    if (styleLink) {
      const match = styleLink.getAttribute('href').match(/\/styles\/\d+_(\d+)/);
      if (match) return match[1];
    }

    // Fallback: button text with sref pattern (em-dash or double-dash)
    const buttons = card.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      const srefMatch = text?.match(/[\u2014\-]{1,2}sref\s+(\d+)/);
      if (srefMatch) return srefMatch[1];
    }

    // Fallback: image URL pattern /styles/0_CODE/
    const img = card.querySelector('img[src*="cdn.midjourney.com/styles/"]');
    if (img) {
      const match = img.src.match(/\/styles\/\d+_(\d+)\//);
      if (match) return match[1];
    }

    return null;
  }

  function extractPreviewImages(card) {
    // Style cards have 3 images: portrait, landscape, still_life
    const imgs = card.querySelectorAll('img[src*="cdn.midjourney.com/styles/"]');
    if (imgs.length > 0) {
      return Array.from(imgs).map(img => img.src).filter(Boolean);
    }
    // Fallback to any CDN image
    const fallback = card.querySelector('img[src*="cdn.midjourney.com"]') ||
                     card.querySelector('img[src]');
    return fallback?.src ? [fallback.src] : [];
  }

  async function handleSrefCapture(card, code, imageUrls) {
    const btn = card.querySelector('.hearted-sref-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '\u23F3'; // hourglass
    }

    try {
      const result = await new Promise((resolve, reject) => {
        browser.runtime.sendMessage({
          action: 'captureSref',
          data: { code, image_urls: imageUrls }
        }, response => {
          if (browser.runtime.lastError) {
            reject(new Error(browser.runtime.lastError.message || 'Extension error'));
            return;
          }
          if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Capture failed'));
          }
        });
      });

      CAPTURED_SREFS.add(code);

      if (btn) {
        btn.textContent = '\u2713'; // checkmark
        btn.classList.add('hearted-sref-captured');
      }
      card.classList.add('hearted-sref-done');

      showToast(result.is_new
        ? `Captured --sref ${code}`
        : `--sref ${code} already in library`
      );

    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '\uD83D\uDCBE'; // floppy disk
      }

      const isUnreachable = e.message.includes('unreachable') ||
                            e.message.includes('Failed to fetch') ||
                            e.message.includes('NetworkError');

      showToast(
        isUnreachable
          ? 'Server unreachable (localhost:8200)'
          : e.message,
        true
      );
    }
  }

  function addSrefButton(card) {
    if (card.querySelector('.hearted-sref-btn')) return;

    const code = extractSrefCode(card);
    if (!code) return;

    const btn = document.createElement('button');
    btn.className = 'hearted-sref-btn';
    btn.textContent = CAPTURED_SREFS.has(code) ? '\u2713' : '\uD83D\uDCBE';
    btn.title = `Capture --sref ${code}`;
    if (CAPTURED_SREFS.has(code)) btn.classList.add('hearted-sref-captured');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!btn.disabled && !CAPTURED_SREFS.has(code)) {
        // Extract images at click time (not creation time) for lazy-loaded images
        const currentImageUrls = extractPreviewImages(card);
        handleSrefCapture(card, code, currentImageUrls);
      }
    });

    const pos = window.getComputedStyle(card).position;
    if (pos === 'static') card.style.position = 'relative';

    card.appendChild(btn);
  }

  function scanStyleCards() {
    // Find style cards by their distinctive link pattern: a[href*="/styles/"]
    const styleLinks = document.querySelectorAll('a[href*="/styles/"]');
    if (styleLinks.length === 0) {
      console.log('Hearted Sref: No style cards found.');
      return;
    }

    console.log(`Hearted Sref: Found ${styleLinks.length} style links`);

    styleLinks.forEach(link => {
      // Card container is the parent div (has group/jobCard class, overflow-hidden)
      const card = link.parentElement;
      if (card && !card._heartedProcessed) {
        card._heartedProcessed = true;
        addSrefButton(card);
      }
    });
  }

  function cleanupStyleExplorer() {
    srefAutoCapturing = false;
    if (srefObserver) {
      srefObserver.disconnect();
      srefObserver = null;
    }
    const ui = document.getElementById('hearted-sref-ui');
    if (ui) ui.remove();
    document.querySelectorAll('.hearted-sref-btn').forEach(btn => btn.remove());
    document.querySelectorAll('.hearted-sref-done').forEach(el => {
      el.classList.remove('hearted-sref-done');
      el._heartedProcessed = false;
    });
  }

  async function autoCaptureSrefs() {
    if (!srefAutoCapturing) return;

    const styleLinks = document.querySelectorAll('a[href*="/styles/"]');
    let captured = 0;
    for (const link of styleLinks) {
      if (!srefAutoCapturing) break;

      const card = link.parentElement;
      if (!card) continue;

      const code = extractSrefCode(card);
      if (!code || CAPTURED_SREFS.has(code)) continue;

      const imageUrls = extractPreviewImages(card);
      try {
        const result = await new Promise((resolve, reject) => {
          browser.runtime.sendMessage({
            action: 'captureSref',
            data: { code, image_urls: imageUrls }
          }, response => {
            if (browser.runtime.lastError) {
              reject(new Error(browser.runtime.lastError.message));
              return;
            }
            if (response?.success) resolve(response.data);
            else reject(new Error(response?.error || 'Capture failed'));
          });
        });
        CAPTURED_SREFS.add(code);
        card.classList.add('hearted-sref-done');
        const btn = card.querySelector('.hearted-sref-btn');
        if (btn) {
          btn.textContent = '\u2713';
          btn.classList.add('hearted-sref-captured');
        }
        captured++;
        srefCaptureCount++;
        updateSrefCaptureUI();
      } catch (e) {
        console.warn(`Hearted: Auto-capture failed for sref ${code}:`, e.message);
        if (e.message.includes('unreachable') || e.message.includes('Failed to fetch')) {
          srefAutoCapturing = false;
          updateSrefCaptureUI();
          showToast('Server unreachable (localhost:8200) — auto-capture stopped', true);
          return;
        }
      }
    }
    if (captured > 0) {
      console.log(`Hearted: Auto-captured ${captured} new srefs`);
    }
  }

  function updateSrefCaptureUI() {
    const label = document.getElementById('hearted-sref-label');
    const count = document.getElementById('hearted-sref-count');
    const btn = document.getElementById('hearted-sref-toggle');
    if (label) label.textContent = srefAutoCapturing ? 'Capturing...' : 'Auto Capture';
    if (count) count.textContent = srefCaptureCount;
    if (btn) {
      btn.classList.toggle('hearted-sref-toggle-active', srefAutoCapturing);
    }
  }

  function createSrefCaptureUI() {
    if (document.getElementById('hearted-sref-ui')) return;

    const container = document.createElement('div');
    container.id = 'hearted-sref-ui';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'hearted-sref-toggle';
    toggleBtn.className = 'hearted-sref-toggle-btn';

    const icon = document.createElement('span');
    icon.textContent = '\uD83C\uDFA8';
    const label = document.createElement('span');
    label.id = 'hearted-sref-label';
    label.textContent = 'Auto Capture';
    const badge = document.createElement('span');
    badge.id = 'hearted-sref-count';
    badge.className = 'hearted-sref-count-badge';
    badge.textContent = '0';

    toggleBtn.appendChild(icon);
    toggleBtn.appendChild(label);
    toggleBtn.appendChild(badge);
    container.appendChild(toggleBtn);
    document.body.appendChild(container);

    toggleBtn.addEventListener('click', () => {
      srefAutoCapturing = !srefAutoCapturing;
      updateSrefCaptureUI();
      if (srefAutoCapturing) {
        scanStyleCards();
        autoCaptureSrefs();
      }
    });
  }

  function initStyleExplorer() {
    if (!isStyleExplorer()) return;

    console.log('Hearted: Style Explorer detected, initializing sref capture');

    // Inject CSS
    if (!document.getElementById('hearted-sref-styles')) {
      const style = document.createElement('style');
      style.id = 'hearted-sref-styles';
      style.textContent = `
        #hearted-sref-ui {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .hearted-sref-toggle-btn {
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
          transition: transform 0.2s, box-shadow 0.2s, background 0.3s;
        }
        .hearted-sref-toggle-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(88, 101, 242, 0.5);
        }
        .hearted-sref-toggle-active {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4) !important;
        }
        .hearted-sref-toggle-active:hover {
          box-shadow: 0 6px 16px rgba(34, 197, 94, 0.5) !important;
        }
        .hearted-sref-count-badge {
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }
        .hearted-sref-btn {
          position: absolute;
          top: 8px;
          left: 8px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: rgba(0, 0, 0, 0.7);
          color: white;
          font-size: 16px;
          cursor: pointer;
          z-index: 100;
          opacity: 0.5;
          transition: opacity 0.2s, transform 0.2s, background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        *:hover > .hearted-sref-btn,
        .hearted-sref-btn:focus {
          opacity: 1;
        }
        .hearted-sref-btn:hover {
          transform: scale(1.15);
          background: rgba(88, 101, 242, 0.9);
          border-color: rgba(88, 101, 242, 0.5);
        }
        .hearted-sref-btn:disabled {
          cursor: wait;
          opacity: 0.7 !important;
        }
        .hearted-sref-captured {
          background: rgba(34, 197, 94, 0.85) !important;
          border-color: rgba(34, 197, 94, 0.5) !important;
          opacity: 1 !important;
          cursor: default;
        }
        .hearted-sref-done {
          position: relative;
        }
        .hearted-sref-done::after {
          content: '\\2713';
          position: absolute;
          bottom: 6px;
          left: 6px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #22c55e;
          color: white;
          font-size: 13px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }

    // Create toggle button UI
    createSrefCaptureUI();

    // Initial scan after brief delay for React render
    setTimeout(scanStyleCards, 500);

    // Watch for new cards (infinite scroll) — debounced scan + auto-capture if active
    let srefScanTimeout;
    srefObserver = new MutationObserver(() => {
      clearTimeout(srefScanTimeout);
      srefScanTimeout = setTimeout(() => {
        scanStyleCards();
        if (srefAutoCapturing) autoCaptureSrefs();
      }, 300);
    });
    srefObserver.observe(document.body, { childList: true, subtree: true });

    // Auto-capture on scroll when toggle is active
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scanStyleCards();
        if (srefAutoCapturing) autoCaptureSrefs();
      }, 500);
    });
  }

  // ===== Likes Tab Capture =====

  const CAPTURED_LIKES = new Set();
  let likesAutoCapturing = false;
  let likesCaptureCount = 0;
  let likesObserver = null;

  function extractLikeImageData(element) {
    try {
      const jobId = extractJobId(element);
      if (!jobId || CAPTURED_LIKES.has(jobId)) return null;

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
      if (imageUrl) {
        imageUrl = imageUrl
          .replace(/_384_N\.webp/, '_1024_N.webp')
          .replace(/_256_N\.webp/, '_1024_N.webp')
          .replace(/\/0_\d+\.jpeg/, '/0_0.jpeg');
      }

      if (!imageUrl) return null;
      return { job_id: jobId, image_url: imageUrl };
    } catch (e) {
      console.error('Hearted Likes: Error extracting image data', e);
      return null;
    }
  }

  async function captureLikeItem(data) {
    return new Promise((resolve, reject) => {
      try {
        browser.runtime.sendMessage({
          action: 'captureLike',
          data: data
        }, response => {
          if (browser.runtime.lastError) {
            reject(new Error(browser.runtime.lastError.message || 'Runtime error'));
            return;
          }
          if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Capture failed'));
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function captureCurrentDetailAsLike() {
    showToast('Extracting...', false);
    const data = await extractDetailData();
    if (!data) {
      showToast('Could not extract data', true);
      return false;
    }

    const jobId = data.source_id;
    const hasPrompt = data.raw_data.prompt && data.raw_data.prompt.length > 0;

    // Skip only if already captured WITH a prompt in this session
    if (CAPTURED_LIKES.has(jobId + ':prompt')) {
      return false;
    }
    // If captured without prompt before, allow re-capture to enrich
    if (CAPTURED_LIKES.has(jobId) && !hasPrompt) {
      return false;
    }

    CAPTURED_LIKES.add(jobId);
    if (hasPrompt) CAPTURED_LIKES.add(jobId + ':prompt');

    try {
      const params = data.raw_data.parameters || {};
      const payload = {
        image_url: data.image_url,
        job_id: jobId,
        prompt_text: data.raw_data.prompt || '',
        source: 'explore',
        parameters: params
      };
      if (params.oref_urls?.length > 0) {
        payload.oref_urls = params.oref_urls;
      }
      if (data.raw_data.username) {
        payload.username = data.raw_data.username;
      }
      const result = await captureLikeItem(payload);

      likesCaptureCount++;
      updateLikesCaptureUI();

      const parts = [];
      if (result.profile_code) parts.push('--p ' + result.profile_code);
      if (hasPrompt) parts.push('Prompt (' + data.raw_data.prompt.length + ' chars)');
      showToast('Saved like' + (parts.length ? ': ' + parts.join(', ') : ''));
      return true;
    } catch (e) {
      CAPTURED_LIKES.delete(jobId);
      showToast('Failed: ' + e.message, true);
      return false;
    }
  }

  // Track last captured job to avoid re-capturing on DOM mutations
  let lastCapturedJobPath = '';

  async function autoCaptureCurrentDetail() {
    // Only capture from detail views — never scan grid thumbnails
    if (!likesAutoCapturing) return;
    const isDetail = window.location.pathname.includes('/jobs/');
    if (!isDetail) return;

    // Don't re-capture same detail view on DOM mutations
    if (lastCapturedJobPath === window.location.pathname) return;
    lastCapturedJobPath = window.location.pathname;

    const captured = await captureCurrentDetailAsLike();
    if (captured) {
      console.log('Hearted Likes: Auto-captured from detail view');
    }
  }

  function updateLikesCaptureUI() {
    const label = document.getElementById('hearted-likes-label');
    const count = document.getElementById('hearted-likes-count');
    const btn = document.getElementById('hearted-likes-toggle');
    if (label) label.textContent = likesAutoCapturing ? 'Capturing...' : 'Auto Capture';
    if (count) count.textContent = likesCaptureCount;
    if (btn) btn.classList.toggle('hearted-likes-toggle-active', likesAutoCapturing);
  }

  function createLikesCaptureUI() {
    if (document.getElementById('hearted-likes-ui')) return;

    const container = document.createElement('div');
    container.id = 'hearted-likes-ui';

    // Build UI with DOM methods (static extension UI, no user input)
    const style = document.createElement('style');
    style.textContent = [
      '#hearted-likes-ui { position:fixed; bottom:20px; right:20px; z-index:9999;',
      '  font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
      '  display:flex; flex-direction:column; gap:8px; align-items:flex-end; }',
      '.hearted-likes-btn { background:linear-gradient(135deg,#ec4899 0%,#db2777 100%);',
      '  color:white; border:none; padding:12px 20px; border-radius:24px;',
      '  cursor:pointer; font-size:14px; font-weight:600;',
      '  box-shadow:0 4px 12px rgba(219,39,119,0.4);',
      '  display:flex; align-items:center; gap:8px;',
      '  transition:transform 0.2s,box-shadow 0.2s,background 0.3s; }',
      '.hearted-likes-btn:hover { transform:translateY(-2px);',
      '  box-shadow:0 6px 16px rgba(219,39,119,0.5); }',
      '.hearted-likes-toggle-active { background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%)!important;',
      '  box-shadow:0 4px 12px rgba(34,197,94,0.4)!important; }',
      '.hearted-likes-toggle-active:hover { box-shadow:0 6px 16px rgba(34,197,94,0.5)!important; }',
      '.hearted-likes-count-badge { background:rgba(255,255,255,0.2);',
      '  padding:2px 8px; border-radius:12px; font-size:12px; }',
      '#hearted-likes-capture-single { background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);',
      '  box-shadow:0 4px 12px rgba(217,119,6,0.4); }',
      '#hearted-likes-capture-single:hover { box-shadow:0 6px 16px rgba(217,119,6,0.5); }'
    ].join('\n');
    container.appendChild(style);

    // Single capture button (detail view only)
    const singleBtn = document.createElement('button');
    singleBtn.id = 'hearted-likes-capture-single';
    singleBtn.className = 'hearted-likes-btn';
    singleBtn.style.display = 'none';
    singleBtn.appendChild(document.createTextNode('\u2764\uFE0F Capture This'));
    container.appendChild(singleBtn);

    // Auto capture toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'hearted-likes-toggle';
    toggleBtn.className = 'hearted-likes-btn';

    const icon = document.createTextNode('\u2764\uFE0F ');
    toggleBtn.appendChild(icon);

    const label = document.createElement('span');
    label.id = 'hearted-likes-label';
    label.textContent = 'Auto Capture';
    toggleBtn.appendChild(label);

    const badge = document.createElement('span');
    badge.id = 'hearted-likes-count';
    badge.className = 'hearted-likes-count-badge';
    badge.textContent = '0';
    toggleBtn.appendChild(badge);

    container.appendChild(toggleBtn);
    document.body.appendChild(container);

    // Event handlers
    singleBtn.addEventListener('click', () => captureCurrentDetailAsLike());
    toggleBtn.addEventListener('click', () => {
      likesAutoCapturing = !likesAutoCapturing;
      lastCapturedJobPath = ''; // Reset so current detail can be captured
      updateLikesCaptureUI();
      if (likesAutoCapturing) {
        const isDetail = window.location.pathname.includes('/jobs/');
        if (isDetail) {
          captureCurrentDetailAsLike();
        } else {
          showToast('Open an image to start capturing');
        }
      }
    });

    // Show/hide single capture button for detail views
    function updateSingleVisibility() {
      const isDetail = window.location.pathname.includes('/jobs/');
      singleBtn.style.display = isDetail ? 'flex' : 'none';
    }
    updateSingleVisibility();
    new MutationObserver(updateSingleVisibility)
      .observe(document.body, { subtree: true, childList: true });
  }

  function cleanupLikesCapture() {
    likesAutoCapturing = false;
    if (likesObserver) {
      likesObserver.disconnect();
      likesObserver = null;
    }
    const ui = document.getElementById('hearted-likes-ui');
    if (ui) ui.remove();
  }

  // Track likes mode across SPA navigation (detail views lose tab=likes from URL)
  function enterLikesMode() {
    try { sessionStorage.setItem('_lm', 'true'); } catch (e) {}
  }
  function exitLikesMode() {
    try { sessionStorage.removeItem('_lm'); } catch (e) {}
  }
  function isInLikesMode() {
    if (isLikesTab()) return true;
    // Detail view navigated from likes tab
    if (window.location.pathname.includes('/jobs/')) {
      try { return sessionStorage.getItem('_lm') === 'true'; } catch (e) {}
    }
    return false;
  }

  function initLikesCapture() {
    if (!isLikesTab() && !isInLikesMode()) return;

    // Set mode so detail views remember they came from likes
    enterLikesMode();

    console.log('Hearted: Likes mode active, initializing likes capture');
    createLikesCaptureUI();

    // Watch for navigation to detail views (SPA URL changes) + auto-capture
    let navTimeout;
    likesObserver = new MutationObserver(() => {
      clearTimeout(navTimeout);
      navTimeout = setTimeout(() => {
        if (likesAutoCapturing) autoCaptureCurrentDetail();
      }, 800); // Wait for detail view to render
    });
    likesObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (likesAutoCapturing) scanAndCaptureLikes();
      }, 500);
    });
  }

  // Initialize
  function init() {
    const existingUI = document.getElementById('hearted-capture-ui');
    if (existingUI) existingUI.remove();
    cleanupStyleExplorer();
    cleanupLikesCapture();

    if (isMidjourneyPage()) {
      if (isLikesTab() || isInLikesMode()) {
        console.log('Hearted: Likes mode, routing to likes capture');
        initLikesCapture();
      } else if (isStyleExplorer()) {
        // Left likes context — clear mode
        exitLikesMode();
        console.log('Hearted: Style Explorer detected, routing to sref capture');
        initStyleExplorer();
      } else {
        // Left likes context — clear mode
        exitLikesMode();
        console.log('Hearted: Detected Midjourney page, initializing capture UI');
        createCaptureUI();
        setupScrollListener();
      }
    } else {
      exitLikesMode();
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
                       document.querySelector('a[href*="/styles/"]') !== null ||
                       window.location.pathname.includes('/jobs/') ||
                       isStyleExplorer() ||
                       isLikesTab();
    const hasUI = document.getElementById('hearted-capture-ui') !== null ||
                   document.getElementById('hearted-sref-styles') !== null ||
                   document.getElementById('hearted-likes-ui') !== null;

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
      const prevUrl = lastUrl;
      lastUrl = location.href;

      // Auto-capture on detail view navigation in likes mode
      if (likesAutoCapturing && isInLikesMode() && location.pathname.includes('/jobs/')) {
        // New detail view — auto-capture after content loads
        setTimeout(async () => {
          console.log('Hearted Likes: Auto-capturing on navigation to', location.pathname);
          await captureCurrentDetailAsLike();
        }, 1500);
      }

      setTimeout(() => initWithRetry(0), 500);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();

// === Claude curation highlighter ===
// Draws a green ring + rank chip on jobs Claude shortlisted (served by
// localhost:8200 via background.js). Blake hearts them himself; clicking
// the chip acknowledges "liked" back to the curation list. This block is
// self-contained and touches nothing above.
(function () {
  'use strict';

  let CURATION = new Map(); // job_id -> item
  let hudEl = null;
  let applyTimer = null;

  const CSS = `
    .claude-pick { outline: 3px solid #25D59D !important; outline-offset: -3px; border-radius: 8px; position: relative; }
    .claude-pick-chip {
      position: absolute; top: 6px; left: 6px; z-index: 9999;
      background: #25D59D; color: #06130d; font: 700 11px/1.6 -apple-system, sans-serif;
      padding: 1px 8px; border-radius: 999px; cursor: pointer; user-select: none;
      box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    .claude-pick-chip.done { background: #2a2a2a; color: #9be8cd; }
    #claude-curation-hud {
      position: fixed; bottom: 14px; left: 14px; z-index: 99999;
      background: rgba(20,20,20,.92); color: #25D59D; font: 600 12px/1.8 -apple-system, sans-serif;
      padding: 4px 12px; border-radius: 999px; border: 1.5px solid #25D59D; cursor: pointer;
    }
  `;

  function injectCSS() {
    if (document.getElementById('claude-curation-css')) return;
    const s = document.createElement('style');
    s.id = 'claude-curation-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function pendingCount() {
    let n = 0;
    CURATION.forEach(i => { if (i.status === 'pending') n++; });
    return n;
  }

  function updateHud() {
    const n = pendingCount();
    if (!n && !hudEl) return;
    if (!hudEl) {
      hudEl = document.createElement('div');
      hudEl.id = 'claude-curation-hud';
      hudEl.title = 'Claude picks on this account — click to refresh';
      hudEl.addEventListener('click', fetchCuration);
      document.body.appendChild(hudEl);
    }
    hudEl.textContent = n ? `Claude picks: ${n} to heart` : 'All picks hearted ✓';
    if (!n) setTimeout(() => { hudEl?.remove(); hudEl = null; }, 6000);
  }

  function decorate(link, item) {
    if (link.dataset.claudePick) return;
    link.dataset.claudePick = '1';
    link.classList.add('claude-pick');
    const chip = document.createElement('span');
    chip.className = 'claude-pick-chip' + (item.status === 'liked' ? ' done' : '');
    chip.textContent = item.status === 'liked' ? '♥ done' : `#${item.rank} ${item.lift || 'pick'}`;
    chip.title = (item.reason || '') + ' — heart it, then click this chip to check it off';
    chip.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      browser.runtime.sendMessage({ action: 'markCuration', jobId: item.job_id, status: 'liked' }, () => {});
      item.status = 'liked';
      chip.classList.add('done');
      chip.textContent = '♥ done';
      updateHud();
    });
    link.appendChild(chip);
  }

  function applyHighlights() {
    if (!CURATION.size) return;
    injectCSS();
    CURATION.forEach((item, jobId) => {
      document.querySelectorAll(`a[href*="${jobId}"]`).forEach(link => decorate(link, item));
    });
    updateHud();
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyHighlights, 800);
  }

  function fetchCuration() {
    try {
      browser.runtime.sendMessage({ action: 'getCurationItems' }, (resp) => {
        if (!resp || !resp.success) return;
        CURATION = new Map();
        (resp.data.items || []).forEach(i => CURATION.set(i.job_id, i));
        applyHighlights();
      });
    } catch (e) { /* server not running — stay silent */ }
  }

  new MutationObserver(scheduleApply).observe(document.body, { childList: true, subtree: true });
  setInterval(fetchCuration, 60000);
  fetchCuration();
})();

// === Harvest for Claude (v2: continuous) ===
// Toggle: auto-scrolls the archive and ships every job card's image via
// the page's own session to localhost:8200 → ~/Reps-Art/01-raw/harvest.
// Runs until clicked again or the page stops yielding new cards.
// Reads only; nothing on MJ is clicked or written.
(function () {
  'use strict';

  let running = false;
  const SENT = new Set();
  let totalSent = 0, totalFail = 0;

  function toast(msg) {
    let t = document.getElementById('claude-harvest-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'claude-harvest-toast';
      t.style.cssText = 'position:fixed;bottom:56px;left:14px;z-index:99999;background:rgba(20,20,20,.92);color:#E8E6DB;font:600 12px/1.8 -apple-system,sans-serif;padding:4px 12px;border-radius:999px;border:1.5px solid #57574D;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 8000);
  }

  function jobCards() {
    const seen = new Map();
    document.querySelectorAll('a[href*="/jobs/"]').forEach(a => {
      const m = a.href.match(/jobs\/([0-9a-f-]{36})/);
      if (!m) return;
      const img = a.querySelector('img');
      if (!img) return;
      const src = img.currentSrc || img.src;
      if (!src || !src.includes('cdn.midjourney.com')) return;
      if (!seen.has(m[1])) seen.set(m[1], { src, alt: img.alt || '' });
    });
    return seen;
  }

  function findScroller() {
    const card = document.querySelector('a[href*="/jobs/"]');
    let el = card;
    while (el && el !== document.body) {
      if (el.scrollHeight > el.clientHeight + 100 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function fetchAsB64(url) {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/') || blob.size < 2000) return null;
    const ext = (blob.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    return { b64, ext };
  }

  function ship(jobId, idx, img, info) {
    return new Promise((resolve) => {
      browser.runtime.sendMessage({
        action: 'harvestImage',
        payload: { job_id: jobId, image_base64: img.b64, ext: img.ext, idx,
                   prompt: info.alt, page: location.pathname }
      }, (r) => resolve(r && r.success));
    });
  }

  // Full-res first: construct variant URLs from the job id (the page's
  // session authorizes the CDN). Falls back to the grid thumbnail.
  async function harvestOne(jobId, info) {
    let shipped = 0;
    for (let idx = 0; idx < 4; idx++) {
      let img = await fetchAsB64(`https://cdn.midjourney.com/${jobId}/0_${idx}.webp`);
      if (!img) img = await fetchAsB64(`https://cdn.midjourney.com/${jobId}/0_${idx}.png`);
      if (!img) break; // single-image jobs stop at the first missing variant
      if (await ship(jobId, idx, img, info)) shipped++;
      await new Promise(r => setTimeout(r, 150));
    }
    if (shipped === 0) {
      const img = await fetchAsB64(info.src);
      if (img && await ship(jobId, 0, img, info)) shipped = 1;
    }
    if (shipped === 0) throw new Error('no variants fetched');
    return true;
  }

  async function harvestPass() {
    const todo = [...jobCards().entries()].filter(([id]) => !SENT.has(id));
    for (const [id, info] of todo) {
      if (!running) return 0;
      try {
        if (await harvestOne(id, info)) { SENT.add(id); totalSent++; }
        else totalFail++;
      } catch (e) { totalFail++; }
      toast(`Harvesting: ${totalSent} sent${totalFail ? `, ${totalFail} failed` : ''} — click button to stop`);
      await new Promise(r => setTimeout(r, 300));
    }
    return todo.length;
  }

  async function harvestLoop(btn) {
    const scroller = findScroller();
    let dryPasses = 0;
    while (running && dryPasses < 6) {
      const got = await harvestPass();
      if (!running) break;
      scroller.scrollBy ? scroller.scrollBy(0, window.innerHeight * 0.85)
                        : (scroller.scrollTop += window.innerHeight * 0.85);
      await new Promise(r => setTimeout(r, 1300));
      dryPasses = got === 0 ? dryPasses + 1 : 0;
    }
    running = false;
    btn.textContent = '⇣ Harvest for Claude';
    btn.style.background = '#141414';
    toast(`Harvest ${dryPasses >= 6 ? 'reached the end' : 'stopped'}: ${totalSent} sent${totalFail ? `, ${totalFail} failed` : ''}`);
  }

  function addButton() {
    if (document.getElementById('claude-harvest-btn')) return;
    const b = document.createElement('button');
    b.id = 'claude-harvest-btn';
    b.textContent = '⇣ Harvest for Claude';
    b.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99999;background:#141414;color:#25D59D;font:700 12px/1.6 -apple-system,sans-serif;padding:6px 14px;border-radius:999px;border:1.5px solid #25D59D;cursor:pointer;';
    b.addEventListener('click', () => {
      if (running) {
        running = false;
        b.textContent = '⇣ Harvest for Claude';
        b.style.background = '#141414';
        return;
      }
      running = true;
      b.textContent = '■ Harvesting… (click to stop)';
      b.style.background = '#0d3527';
      harvestLoop(b);
    });
    document.body.appendChild(b);
  }

  addButton();
  new MutationObserver(() => addButton()).observe(document.body, { childList: true, subtree: true });
})();
