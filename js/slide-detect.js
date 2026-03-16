'use strict';

/**
 * Detect slide changes in a video by comparing frames, then insert
 * thumbnail images between subtitle paragraphs at transition points.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLElement} sectionEl - The <section> containing <p> subtitle elements
 * @param {function(string):void} onStatus - Status callback
 * @returns {Promise<number>} Number of slide changes detected
 */
async function detectSlideChanges(videoEl, sectionEl, onStatus) {
  var COMPARE_SIZE = 128;
  var COARSE_INTERVAL = 60;
  var DIFF_THRESHOLD = 5;
  var MIN_BINARY_GAP = 0.5;
  var DEDUP_GAP = 2;
  var THUMB_QUALITY = 0.7;

  var duration = videoEl.duration;
  if (!duration || !isFinite(duration)) {
    throw new Error('Video has no valid duration');
  }

  // Save and pause
  var wasPaused = videoEl.paused;
  var savedTime = videoEl.currentTime;
  videoEl.pause();

  // Offscreen canvas for comparison (small)
  var cmpCanvas = document.createElement('canvas');
  cmpCanvas.width = COMPARE_SIZE;
  cmpCanvas.height = COMPARE_SIZE;
  var cmpCtx = cmpCanvas.getContext('2d');

  // Thumbnail canvas (larger, video aspect ratio)
  var thumbW = Math.min(videoEl.videoWidth || 640, 640);
  var thumbH = Math.round((thumbW * (videoEl.videoHeight || 360)) / (videoEl.videoWidth || 640));
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  var thumbCtx = thumbCanvas.getContext('2d');

  function seekAndCapture(time, ctx, w, h) {
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () {
        videoEl.removeEventListener('seeked', onSeeked);
        reject(new Error('Seek timeout at ' + time.toFixed(1) + 's'));
      }, 5000);
      function onSeeked() {
        clearTimeout(timeout);
        videoEl.removeEventListener('seeked', onSeeked);
        try {
          ctx.drawImage(videoEl, 0, 0, w, h);
          resolve(ctx.getImageData(0, 0, w, h));
        } catch (e) {
          reject(new Error('Cannot capture frame (CORS?): ' + e.message));
        }
      }
      videoEl.addEventListener('seeked', onSeeked);
      var targetTime = Math.max(0, Math.min(time, duration - 0.05));
      if (Math.abs(videoEl.currentTime - targetTime) < 0.01) {
        onSeeked();
      } else {
        videoEl.currentTime = targetTime;
      }
    });
  }

  function computeDifference(d1, d2) {
    var p1 = d1.data,
      p2 = d2.data;
    var totalDiff = 0,
      count = 0;
    for (var i = 0; i < p1.length; i += 4) {
      totalDiff += Math.abs(p1[i] - p2[i]);
      totalDiff += Math.abs(p1[i + 1] - p2[i + 1]);
      totalDiff += Math.abs(p1[i + 2] - p2[i + 2]);
      count += 3;
    }
    return totalDiff / count;
  }

  // Returns { node, insertBefore } where insertBefore indicates the img should go before the node.
  // If the transition falls mid-paragraph, check whether most of that paragraph is before or after
  // the transition. If most is after → insert before that paragraph (the slide changed, then most
  // of the text belongs to the new slide).
  function findInsertionPoint(timeMs) {
    var paragraphs = sectionEl.querySelectorAll('p');
    if (paragraphs.length === 0) return null;

    // Build array of { el, startMs, endMs } for each paragraph
    var paraInfo = [];
    for (var i = 0; i < paragraphs.length; i++) {
      var spans = paragraphs[i].querySelectorAll('span[data-m]');
      if (spans.length === 0) continue;
      var startMs = parseInt(spans[0].getAttribute('data-m'));
      var lastSpan = spans[spans.length - 1];
      var endMs = parseInt(lastSpan.getAttribute('data-m')) + (parseInt(lastSpan.getAttribute('data-d')) || 0);
      paraInfo.push({ el: paragraphs[i], startMs: startMs, endMs: endMs });
    }
    if (paraInfo.length === 0) return null;

    // If transition is before all paragraphs
    if (timeMs < paraInfo[0].startMs) {
      return { node: paraInfo[0].el, insertBefore: true };
    }

    // Find which paragraph the transition falls in (or between)
    for (var j = 0; j < paraInfo.length; j++) {
      var p = paraInfo[j];
      var nextStart = j + 1 < paraInfo.length ? paraInfo[j + 1].startMs : Infinity;

      if (timeMs >= p.startMs && timeMs < nextStart) {
        // Transition is during or after this paragraph
        var paraDuration = p.endMs - p.startMs;
        var timeIntoPara = timeMs - p.startMs;

        if (paraDuration > 0 && timeIntoPara < paraDuration / 2) {
          // Transition is in the first half → most content is after transition
          // → this paragraph belongs to the NEW slide → insert thumbnail BEFORE it
          return { node: p.el, insertBefore: true };
        } else if (paraDuration > 0 && timeIntoPara >= paraDuration / 2) {
          // Transition is in the second half → most content is before transition
          // → this paragraph belongs to the OLD slide → insert thumbnail after it
          if (j + 1 < paraInfo.length) {
            return { node: paraInfo[j + 1].el, insertBefore: true };
          }
          return { node: p.el, insertBefore: false };
        } else {
          // Zero-duration paragraph or transition between paragraphs → insert after
          return { node: p.el, insertBefore: false };
        }
      }
    }

    // Transition is after all paragraphs
    return { node: paraInfo[paraInfo.length - 1].el, insertBefore: false };
  }

  // Recursive divide-and-conquer: find all transitions within [tLow, tHigh]
  async function findTransitions(tLow, tHigh, frameLow, frameHigh) {
    var results = [];
    if (tHigh - tLow <= MIN_BINARY_GAP) {
      results.push(tHigh);
      return results;
    }
    var tMid = (tLow + tHigh) / 2;
    var frameMid = await seekAndCapture(tMid, cmpCtx, COMPARE_SIZE, COMPARE_SIZE);
    var diffLowMid = computeDifference(frameLow, frameMid);
    var diffMidHigh = computeDifference(frameMid, frameHigh);

    if (diffLowMid > DIFF_THRESHOLD && diffMidHigh > DIFF_THRESHOLD) {
      var left = await findTransitions(tLow, tMid, frameLow, frameMid);
      var right = await findTransitions(tMid, tHigh, frameMid, frameHigh);
      results = left.concat(right);
    } else if (diffLowMid > DIFF_THRESHOLD) {
      results = await findTransitions(tLow, tMid, frameLow, frameMid);
    } else if (diffMidHigh > DIFF_THRESHOLD) {
      results = await findTransitions(tMid, tHigh, frameMid, frameHigh);
    } else {
      if (diffLowMid > diffMidHigh) {
        results = await findTransitions(tLow, tMid, frameLow, frameMid);
      } else {
        results = await findTransitions(tMid, tHigh, frameMid, frameHigh);
      }
    }
    return results;
  }

  // Insert a single slide's thumbnail into the transcript, returns the <img> element
  function insertSlideIntoTranscript(sd) {
    var insertPoint = findInsertionPoint(sd.timeMs);
    if (!insertPoint) return null;

    var img = document.createElement('img');
    img.src = sd.dataUrl;
    img.className = 'slide-thumbnail';
    img.setAttribute('data-slide-time', String(sd.timeMs));
    img.title = 'Slide @ ' + formatTimeForTitle(sd.timeMs / 1000);

    if (insertPoint.insertBefore) {
      insertPoint.node.parentNode.insertBefore(img, insertPoint.node);
    } else if (insertPoint.node.nextSibling) {
      insertPoint.node.parentNode.insertBefore(img, insertPoint.node.nextSibling);
    } else {
      insertPoint.node.parentNode.appendChild(img);
    }
    return img;
  }

  try {
    // Remove any previously inserted thumbnails
    var oldThumbs = sectionEl.querySelectorAll('.slide-thumbnail');
    for (var ri = 0; ri < oldThumbs.length; ri++) {
      oldThumbs[ri].parentNode.removeChild(oldThumbs[ri]);
    }

    // Initialize filmstrip immediately so thumbs appear one by one
    var filmstrip = initFilmstrip(videoEl);
    var totalFound = 0;

    // Process video in chunks: sample → refine → capture → insert, then next chunk
    var chunkSize = Math.min(COARSE_INTERVAL, duration / 2);
    if (chunkSize < 1) chunkSize = duration;
    var totalChunks = Math.ceil(duration / chunkSize);

    // We need the frame at t=0 to start
    var prevFrame = await seekAndCapture(0, cmpCtx, COMPARE_SIZE, COMPARE_SIZE);
    var prevTime = 0;
    var lastTransitionTime = 0;

    for (var chunk = 0; chunk < totalChunks; chunk++) {
      var chunkStart = chunk * chunkSize;
      var chunkEnd = Math.min((chunk + 1) * chunkSize, duration - 0.1);
      if (chunkEnd <= chunkStart) break;

      onStatus(
        'Chunk ' +
          (chunk + 1) +
          '/' +
          totalChunks +
          ' [' +
          formatTimeForTitle(chunkStart) +
          ' - ' +
          formatTimeForTitle(chunkEnd) +
          ']...',
      );

      // Capture frame at chunk end
      var endFrame = await seekAndCapture(chunkEnd, cmpCtx, COMPARE_SIZE, COMPARE_SIZE);

      // Compare chunk start vs end
      var chunkDiff = computeDifference(prevFrame, endFrame);
      if (chunkDiff > DIFF_THRESHOLD) {
        // There's at least one transition in this chunk — refine
        var chunkTransitions = await findTransitions(chunkStart, chunkEnd, prevFrame, endFrame);

        // Process transitions:
        for (var ct = 0; ct < chunkTransitions.length; ct++) {
          var t = chunkTransitions[ct];

          if (t - lastTransitionTime < DEDUP_GAP) {
            continue;
          }

          // Capture the final form of the *previous* slide just before this new transition
          var captureTime = Math.max(0, t - 2);
          await seekAndCapture(captureTime, thumbCtx, thumbW, thumbH);
          var dataUrl = thumbCanvas.toDataURL('image/jpeg', THUMB_QUALITY);

          var sd = { timeMs: Math.round(lastTransitionTime * 1000), dataUrl: dataUrl };

          insertSlideIntoTranscript(sd);
          if (filmstrip) filmstrip.addThumb(sd);
          totalFound++;

          // This transition starts the next phase
          lastTransitionTime = t;
        }
      }

      // Carry forward
      prevFrame = endFrame;
      prevTime = chunkEnd;
    }

    // Capture the final state of the very last slide
    if (duration - lastTransitionTime >= DEDUP_GAP || totalFound === 0) {
      var finalCaptureTime = Math.max(0, duration - 0.5);
      await seekAndCapture(finalCaptureTime, thumbCtx, thumbW, thumbH);
      var finalDataUrl = thumbCanvas.toDataURL('image/jpeg', THUMB_QUALITY);
      var finalSd = { timeMs: Math.round(lastTransitionTime * 1000), dataUrl: finalDataUrl };
      insertSlideIntoTranscript(finalSd);
      if (filmstrip) filmstrip.addThumb(finalSd);
      totalFound++;
    }

    if (totalFound === 0) {
      onStatus('No slide changes detected.');
    }

    // Restore video state
    videoEl.currentTime = savedTime;
    if (!wasPaused) videoEl.play().catch(function () {});

    return totalFound;
  } catch (err) {
    // Restore video state on error
    videoEl.currentTime = savedTime;
    if (!wasPaused) videoEl.play().catch(function () {});
    throw err;
  }
}

function formatTimeForTitle(seconds) {
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/**
 * Initialize the filmstrip below the video.
 * Call once before detection starts, then use addFilmstripThumb() to add each slide.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {{ addThumb: function({timeMs, dataUrl}): void }} controller
 */
function initFilmstrip(videoEl) {
  var zoomEl = document.getElementById('zoom-subtitle');
  if (!zoomEl) return null;

  // Cleanup previous filmstrip if any
  if (window._filmstripCleanup) {
    window._filmstripCleanup();
    window._filmstripCleanup = null;
  }

  // Switch to filmstrip mode
  zoomEl.classList.add('filmstrip-mode');

  // Preserve the playback rate overlay
  var pbrOverlay = document.getElementById('pbr-overlay');

  // Clear existing content
  while (zoomEl.firstChild) zoomEl.removeChild(zoomEl.firstChild);

  // Re-append the overlay so it stays on top
  if (pbrOverlay) zoomEl.appendChild(pbrOverlay);

  var thumbEls = [];
  var slideTimes = []; // parallel array of timeMs values

  // Click handler
  zoomEl.addEventListener('click', function (e) {
    if (e.target.classList.contains('filmstrip-thumb')) {
      var timeMs = parseInt(e.target.getAttribute('data-slide-time'));
      videoEl.currentTime = timeMs / 1000;
      videoEl.play().catch(function () {});
    }
  });

  // Vertical mouse wheel → horizontal scroll
  zoomEl.addEventListener(
    'wheel',
    function (e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        zoomEl.scrollLeft += e.deltaY;
      }
    },
    { passive: false },
  );

  // Track active slide and auto-scroll
  var lastActiveIndex = -1;

  function updateActiveSlide() {
    if (thumbEls.length === 0) return;
    var currentMs = videoEl.currentTime * 1000;

    var activeIndex = -1;
    for (var i = 0; i < slideTimes.length; i++) {
      if (slideTimes[i] <= currentMs) {
        activeIndex = i;
      } else {
        break;
      }
    }

    if (activeIndex === lastActiveIndex) return;
    lastActiveIndex = activeIndex;

    for (var j = 0; j < thumbEls.length; j++) {
      if (j === activeIndex) {
        thumbEls[j].classList.add('active');
      } else {
        thumbEls[j].classList.remove('active');
      }
    }

    if (activeIndex >= 0) {
      var targetIndex = Math.max(0, activeIndex - 1);
      var targetEl = thumbEls[targetIndex];
      zoomEl.scrollTo({
        left: targetEl.offsetLeft - zoomEl.offsetLeft,
        behavior: 'smooth',
      });
    }
  }

  videoEl.addEventListener('timeupdate', updateActiveSlide);

  window._filmstripCleanup = function () {
    videoEl.removeEventListener('timeupdate', updateActiveSlide);
  };

  // Return controller for adding thumbnails incrementally
  return {
    addThumb: function (sd) {
      var idx = thumbEls.length;
      var img = document.createElement('img');
      img.src = sd.dataUrl;
      img.className = 'filmstrip-thumb';
      img.setAttribute('data-slide-time', String(sd.timeMs));
      img.setAttribute('data-slide-index', String(idx));
      img.title = 'Slide ' + (idx + 1) + ' @ ' + formatTimeForTitle(sd.timeMs / 1000);

      // Insert before the overlay (which is the last child)
      if (pbrOverlay && pbrOverlay.parentNode === zoomEl) {
        zoomEl.insertBefore(img, pbrOverlay);
      } else {
        zoomEl.appendChild(img);
      }

      thumbEls.push(img);
      slideTimes.push(sd.timeMs);
    },
    removeLastThumb: function () {
      if (thumbEls.length === 0) return;
      var img = thumbEls.pop();
      slideTimes.pop();
      if (img.parentNode) img.parentNode.removeChild(img);
      lastActiveIndex = -1; // reset so next update recalculates
    },
  };
}
