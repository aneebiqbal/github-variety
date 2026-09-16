(function() {
  'use strict';

  // --- Resolve the script tag and configuration ---
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    var candidate = document.querySelector('script[src*="widget.js"]');
    if (candidate) {
      scriptEl = candidate;
    }
  }

  if (!scriptEl) {
    console.error('[GitHub Variety] Could not locate widget script tag.');
    return;
  }

  var projectKey = scriptEl.getAttribute('data-project');
  if (!projectKey || !projectKey.trim()) {
    console.error('[GitHub Variety] Missing or empty data-project attribute. Widget not rendered.');
    return;
  }

  // --- Derive the backend base URL from the script's own src ---
  var baseUrl = '';
  try {
    var srcUrl = scriptEl.src;
    if (srcUrl) {
      var parsed = new URL(srcUrl);
      baseUrl = parsed.origin;
    }
  } catch (e) {
    console.error('[GitHub Variety] Failed to parse script src URL.', e);
    return;
  }

  var apiEndpoint = baseUrl + '/api/feedback';

  // --- Screenshot capture state ---
  var HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var html2canvasLoaded = false;
  var html2canvasLoading = false;
  var screenshotData = null; // base64 string (no data: prefix) or null
  var screenshotCaptured = false; // whether capture has been attempted/succeeded for current open
  var captureIndicatorEl = null; 

  // --- Inject scoped CSS ---
  var styleEl = document.createElement('style');
  styleEl.type = 'text/css';
  styleEl.innerHTML =
    '.gv-button {' +
      'position: fixed;' +
      'bottom: 20px;' +
      'right: 20px;' +
      'border-radius: 8px;' +
      'background-color: #1a1a1a;' +
      'color: #ffffff;' +
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      'font-size: 14px;' +
      'font-weight: 600;' +
      'padding: 12px 20px;' +
      'border: none;' +
      'cursor: pointer;' +
      'z-index: 99999;' +
      'box-shadow: 0 4px 12px rgba(0,0,0,0.3);' +
      'transition: background-color 0.2s ease;' +
    '}' +
    '.gv-button:hover {' +
      'background-color: #333333;' +
    '}' +
    '.gv-modal-overlay {' +
      'display: none;' +
      'position: fixed;' +
      'top: 0;' +
      'left: 0;' +
      'width: 100%;' +
      'height: 100%;' +
      'background-color: rgba(0,0,0,0.5);' +
      'z-index: 100000;' +
      'justify-content: center;' +
      'align-items: center;' +
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
    '}' +
    '.gv-modal-overlay.gv-visible {' +
      'display: flex;' +
    '}' +
    '.gv-modal-box {' +
      'background-color: #ffffff;' +
      'max-width: 480px;' +
      'width: 90%;' +
      'border-radius: 12px;' +
      'padding: 24px;' +
      'box-shadow: 0 10px 40px rgba(0,0,0,0.25);' +
      'box-sizing: border-box;' +
      'position: relative;' +
    '}' +
    '.gv-modal-header {' +
      'font-size: 18px;' +
      'font-weight: 600;' +
      'color: #1a1a1a;' +
      'margin-bottom: 16px;' +
      'padding-right: 24px;' +
    '}' +
    '.gv-close-btn {' +
      'position: absolute;' +
      'top: 12px;' +
      'right: 16px;' +
      'font-size: 22px;' +
      'line-height: 1;' +
      'color: #666666;' +
      'cursor: pointer;' +
      'border: none;' +
      'background: none;' +
      'padding: 0;' +
    '}' +
    '.gv-close-btn:hover {' +
      'color: #1a1a1a;' +
    '}' +
    '.gv-form {' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 12px;' +
    '}' +
    '.gv-field-group {' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 4px;' +
    '}' +
    '.gv-label {' +
      'font-size: 13px;' +
      'font-weight: 600;' +
      'color: #333333;' +
    '}' +
    '.gv-input, .gv-textarea {' +
      'font-family: inherit;' +
      'font-size: 14px;' +
      'padding: 10px;' +
      'border: 1px solid #cccccc;' +
      'border-radius: 6px;' +
      'box-sizing: border-box;' +
      'width: 100%;' +
      'outline: none;' +
    '}' +
    '.gv-input:focus, .gv-textarea:focus {' +
      'border-color: #1a1a1a;' +
    '}' +
    '.gv-textarea {' +
      'min-height: 100px;' +
      'resize: vertical;' +
    '}' +
    '.gv-submit-btn {' +
      'width: 100%;' +
      'background-color: #1a1a1a;' +
      'color: #ffffff;' +
      'border: none;' +
      'border-radius: 6px;' +
      'padding: 12px;' +
      'font-size: 14px;' +
      'font-weight: 600;' +
      'cursor: pointer;' +
      'transition: background-color 0.2s ease;' +
    '}' +
    '.gv-submit-btn:hover {' +
      'background-color: #333333;' +
    '}' +
    '.gv-submit-btn:disabled {' +
      'opacity: 0.6;' +
      'cursor: not-allowed;' +
    '}' +
    '.gv-message {' +
      'display: none;' +
      'margin-top: 12px;' +
      'padding: 10px;' +
      'border-radius: 6px;' +
      'font-size: 13px;' +
    '}' +
    '.gv-message-success {' +
      'background-color: #e6f9ec;' +
      'color: #1d7a37;' +
      'border: 1px solid #b8e6c4;' +
    '}' +
    '.gv-message-error {' +
      'background-color: #fdeaea;' +
      'color: #b32020;' +
      'border: 1px solid #f4c4c4;' +
    '}' +
    '.gv-capture-indicator {' +
      'margin-top: 8px;' +
      'padding: 6px 10px;' +
      'font-size: 12px;' +
      'color: #555;' +
      'background-color: #f0f3f6;' +
      'border: 1px solid #e1e4e8;' +
      'border-radius: 6px;' +
      'display: none;' +
    '}';
  document.head.appendChild(styleEl);

  // --- Build the floating button ---
  var floatBtn = document.createElement('button');
  floatBtn.className = 'gv-button';
  floatBtn.type = 'button';
  floatBtn.textContent = 'Feedback';

  // --- Build the modal ---
  var overlay = document.createElement('div');
  overlay.className = 'gv-modal-overlay';

  var box = document.createElement('div');
  box.className = 'gv-modal-box';

  var header = document.createElement('div');
  header.className = 'gv-modal-header';
  header.textContent = 'Send Feedback';

  var closeBtn = document.createElement('button');
  closeBtn.className = 'gv-close-btn';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';

  box.appendChild(closeBtn);
  box.appendChild(header);

  // --- Build the form ---
  var form = document.createElement('form');
  form.className = 'gv-form';

  // Name field
  var nameGroup = document.createElement('div');
  nameGroup.className = 'gv-field-group';
  var nameLabel = document.createElement('label');
  nameLabel.className = 'gv-label';
  nameLabel.textContent = 'Your Name';
  var nameInput = document.createElement('input');
  nameInput.className = 'gv-input';
  nameInput.type = 'text';
  nameInput.name = 'reporterName';
  nameInput.required = true;
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);

  // Title field
  var titleGroup = document.createElement('div');
  titleGroup.className = 'gv-field-group';
  var titleLabel = document.createElement('label');
  titleLabel.className = 'gv-label';
  titleLabel.textContent = 'Title';
  var titleInput = document.createElement('input');
  titleInput.className = 'gv-input';
  titleInput.type = 'text';
  titleInput.name = 'title';
  titleInput.required = true;
  titleInput.maxLength = 100;
  titleInput.placeholder = 'Brief summary';
  titleGroup.appendChild(titleLabel);
  titleGroup.appendChild(titleInput);

  // Description field
  var descGroup = document.createElement('div');
  descGroup.className = 'gv-field-group';
  var descLabel = document.createElement('label');
  descLabel.className = 'gv-label';
  descLabel.textContent = 'Description';
  var descTextarea = document.createElement('textarea');
  descTextarea.className = 'gv-textarea';
  descTextarea.name = 'description';
  descTextarea.required = true;
  descTextarea.placeholder = 'What went wrong?';
  descGroup.appendChild(descLabel);
  descGroup.appendChild(descTextarea);

  // Submit button
  var submitBtn = document.createElement('button');
  submitBtn.className = 'gv-submit-btn';
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Submit Feedback';

  form.appendChild(nameGroup);
  form.appendChild(titleGroup);
  form.appendChild(descGroup);
  form.appendChild(submitBtn);

  // Message area
  var messageEl = document.createElement('div');
  messageEl.className = 'gv-message';

  // Screenshot capture indicator
  captureIndicatorEl = document.createElement('div');
  captureIndicatorEl.className = 'gv-capture-indicator';
  captureIndicatorEl.textContent = 'Capturing page screenshot...';

  box.appendChild(form);
  box.appendChild(captureIndicatorEl);
  box.appendChild(messageEl);
  overlay.appendChild(box);

  // --- Inject into DOM ---
  document.body.appendChild(floatBtn);
  document.body.appendChild(overlay);

  // --- Helper: show message ---
  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    messageEl.classList.remove('gv-message-success', 'gv-message-error');
    messageEl.classList.add(type === 'success' ? 'gv-message-success' : 'gv-message-error');
  }

  function hideMessage() {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
    messageEl.classList.remove('gv-message-success', 'gv-message-error');
  }

  // --- Screenshot capture ---
  function loadHtml2canvas(callback) {
    if (html2canvasLoaded) { callback(); return; }
    if (html2canvasLoading) { return; }
    html2canvasLoading = true;
    var s = document.createElement('script');
    s.src = HTML2CANVAS_URL;
    s.onload = function() {
      html2canvasLoaded = true;
      html2canvasLoading = false;
      callback();
    };
    s.onerror = function() {
      html2canvasLoading = false;
      console.error('[GitHub Variety] html2canvas failed to load.');
      hideCaptureIndicator();
      screenshotCaptured = true;
      screenshotData = null;
    };
    document.head.appendChild(s);
  }

  function showCaptureIndicator() {
    if (captureIndicatorEl) {
      captureIndicatorEl.style.display = 'block';
    }
  }

  function hideCaptureIndicator() {
    if (captureIndicatorEl) {
      captureIndicatorEl.style.display = 'none';
    }
  }

  function captureScreenshot() {
    if (screenshotCaptured) { return; }
    showCaptureIndicator();
    try {
      loadHtml2canvas(function() {
        if (!html2canvasLoaded || typeof window.html2canvas !== 'function') {
          hideCaptureIndicator();
          screenshotCaptured = true;
          screenshotData = null;
          return;
        }
        // Temporarily hide our own UI so it doesn't appear in the screenshot.
        var prevFloatDisplay = floatBtn.style.display;
        var prevOverlayDisplay = overlay.style.display;
        floatBtn.style.display = 'none';
        overlay.style.display = 'none';

        window.html2canvas(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 0.75,
          logging: false
        }).then(function(canvas) {
          floatBtn.style.display = prevFloatDisplay;
          overlay.style.display = prevOverlayDisplay;
          try {
            var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            var base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
            screenshotData = base64;
          } catch (e) {
            console.error('[GitHub Variety] Failed to encode screenshot.', e);
            screenshotData = null;
          }
          screenshotCaptured = true;
          hideCaptureIndicator();
        }).catch(function(err) {
          floatBtn.style.display = prevFloatDisplay;
          overlay.style.display = prevOverlayDisplay;
          console.error('[GitHub Variety] html2canvas capture failed:', err);
          screenshotData = null;
          screenshotCaptured = true;
          hideCaptureIndicator();
        });
      });
    } catch (err) {
      console.error('[GitHub Variety] Screenshot capture error:', err);
      screenshotData = null;
      screenshotCaptured = true;
      hideCaptureIndicator();
    }
  }

  // --- Modal show/hide ---
  function showModal() {
    overlay.classList.add('gv-visible');
    // Reset capture state for this open, then trigger asynchronously
    // so the modal is rendered visibly before we hide it for capture.
    screenshotCaptured = false;
    screenshotData = null;
    setTimeout(captureScreenshot, 0);
  }

  function hideModal() {
    overlay.classList.remove('gv-visible');
    hideMessage();
    hideCaptureIndicator();
  }

  // --- Event listeners ---
  floatBtn.addEventListener('click', showModal);
  closeBtn.addEventListener('click', hideModal);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      hideModal();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.classList.contains('gv-visible')) {
      hideModal();
    }
  });

  // --- Form submit ---
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    hideMessage();

    var reporterName = nameInput.value.trim();
    var title = titleInput.value.trim();
    var description = descTextarea.value.trim();

    // Validation
    if (!reporterName) {
      showMessage('Please enter your name.', 'error');
      return;
    }
    if (!title) {
      showMessage('Please enter a title.', 'error');
      return;
    }
    if (title.length > 100) {
      showMessage('Title must be 100 characters or fewer.', 'error');
      return;
    }
    if (!description) {
      showMessage('Please enter a description.', 'error');
      return;
    }
    if (description.length < 10) {
      showMessage('Description must be at least 10 characters.', 'error');
      return;
    }
    if (description.length > 1000) {
      showMessage('Description must be 1000 characters or fewer.', 'error');
      return;
    }

    // Disable button + Sending state
    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';

    var payload = {
      projectKey: projectKey,
      reporterName: reporterName,
      title: title,
      description: description,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      screenshot: screenshotData || null
    };

    fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(res) {
        return res.json().then(function(body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function(result) {
        if (result.ok && result.body && result.body.success) {
          form.reset();
          showMessage('Thanks! Your feedback has been submitted as a ticket.', 'success');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          setTimeout(function() {
            hideModal();
          }, 2000);
        } else {
          var errMsg = (result.body && result.body.error)
            ? result.body.error
            : 'Something went wrong. Please try again.';
          showMessage(errMsg, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      })
      .catch(function(err) {
        console.error('[GitHub Variety] Feedback submission failed:', err);
        showMessage('Something went wrong. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
  });
})();