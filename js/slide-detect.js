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
  var COMPARE_SIZE = 64;
  var COARSE_INTERVAL = 60;
  var DIFF_THRESHOLD = 15;
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
  var thumbH = Math.round(thumbW * (videoEl.videoHeight || 360) / (videoEl.videoWidth || 640));
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  var thumbCtx = thumbCanvas.getContext('2d');

  function seekAndCapture(time, ctx, w, h) {
    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() {
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
    var p1 = d1.data, p2 = d2.data;
    var totalDiff = 0, count = 0;
    for (var i = 0; i < p1.length; i += 4) {
      totalDiff += Math.abs(p1[i] - p2[i]);
      totalDiff += Math.abs(p1[i + 1] - p2[i + 1]);
      totalDiff += Math.abs(p1[i + 2] - p2[i + 2]);
      count += 3;
    }
    return totalDiff / count;
  }

  // Returns { node, insertBefore } where insertBefore indicates the img should go before the node
  function findInsertionPoint(timeMs) {
    var paragraphs = sectionEl.querySelectorAll('p');
    if (paragraphs.length === 0) return null;
    var target = null;
    for (var i = 0; i < paragraphs.length; i++) {
      var firstSpan = paragraphs[i].querySelector('span[data-m]');
      if (firstSpan && parseInt(firstSpan.getAttribute('data-m')) <= timeMs) {
        target = paragraphs[i];
      }
    }
    // If timeMs is before all paragraphs, insert before the first one
    if (target === null) {
      return { node: paragraphs[0], insertBefore: true };
    }
    return { node: target, insertBefore: false };
  }

  try {
    // Phase 1: Coarse sampling
    var interval = Math.min(COARSE_INTERVAL, duration / 4);
    if (interval < 0.5) interval = duration; // very short video, just compare start vs end
    var sampleTimes = [];
    for (var t = 0; t < duration; t += interval) {
      sampleTimes.push(t);
    }
    // Always include near-end
    if (sampleTimes[sampleTimes.length - 1] < duration - 1) {
      sampleTimes.push(duration - 0.5);
    }

    onStatus('Sampling 0/' + sampleTimes.length + '...');
    var frames = [];
    for (var si = 0; si < sampleTimes.length; si++) {
      onStatus('Sampling ' + (si + 1) + '/' + sampleTimes.length + '...');
      var imgData = await seekAndCapture(sampleTimes[si], cmpCtx, COMPARE_SIZE, COMPARE_SIZE);
      frames.push({ time: sampleTimes[si], data: imgData });
    }

    // Phase 2: Find candidate intervals
    var candidates = [];
    for (var ci = 1; ci < frames.length; ci++) {
      var diff = computeDifference(frames[ci - 1].data, frames[ci].data);
      if (diff > DIFF_THRESHOLD) {
        candidates.push({ tLow: frames[ci - 1].time, tHigh: frames[ci].time });
      }
    }

    onStatus('Found ' + candidates.length + ' candidate interval(s), refining...');

    // Phase 3: Recursive divide-and-conquer refinement
    // For each candidate interval, find ALL transition points within it.
    // If mid differs from both low and high, there are multiple transitions —
    // recurse into both [low, mid] and [mid, high].
    var transitions = [];

    async function findTransitions(tLow, tHigh, frameLow, frameHigh) {
      if (tHigh - tLow <= MIN_BINARY_GAP) {
        transitions.push(tHigh);
        return;
      }
      var tMid = (tLow + tHigh) / 2;
      var frameMid = await seekAndCapture(tMid, cmpCtx, COMPARE_SIZE, COMPARE_SIZE);
      var diffLowMid = computeDifference(frameLow, frameMid);
      var diffMidHigh = computeDifference(frameMid, frameHigh);

      if (diffLowMid > DIFF_THRESHOLD && diffMidHigh > DIFF_THRESHOLD) {
        // Mid differs from both sides — transitions in both halves
        await findTransitions(tLow, tMid, frameLow, frameMid);
        await findTransitions(tMid, tHigh, frameMid, frameHigh);
      } else if (diffLowMid > DIFF_THRESHOLD) {
        // Transition only in [tLow, tMid]
        await findTransitions(tLow, tMid, frameLow, frameMid);
      } else if (diffMidHigh > DIFF_THRESHOLD) {
        // Transition only in [tMid, tHigh]
        await findTransitions(tMid, tHigh, frameMid, frameHigh);
      }
      // else: neither half differs — no transition (noise in coarse pass)
    }

    for (var bi = 0; bi < candidates.length; bi++) {
      onStatus('Refining ' + (bi + 1) + '/' + candidates.length + '...');
      var tLow = candidates[bi].tLow;
      var tHigh = candidates[bi].tHigh;
      var frameLow = await seekAndCapture(tLow, cmpCtx, COMPARE_SIZE, COMPARE_SIZE);
      var frameHigh = await seekAndCapture(tHigh, cmpCtx, COMPARE_SIZE, COMPARE_SIZE);
      await findTransitions(tLow, tHigh, frameLow, frameHigh);
    }

    // Phase 4: Deduplicate
    transitions.sort(function(a, b) { return a - b; });
    var deduped = [];
    for (var di = 0; di < transitions.length; di++) {
      if (deduped.length === 0 || transitions[di] - deduped[deduped.length - 1] > DEDUP_GAP) {
        deduped.push(transitions[di]);
      }
    }
    transitions = deduped;

    if (transitions.length === 0) {
      onStatus('No slide changes detected.');
      videoEl.currentTime = savedTime;
      if (!wasPaused) videoEl.play().catch(function() {});
      return 0;
    }

    // Phase 5: Capture full-res thumbnails and insert into DOM
    // Remove any previously inserted thumbnails
    var oldThumbs = sectionEl.querySelectorAll('.slide-thumbnail');
    for (var ri = 0; ri < oldThumbs.length; ri++) {
      oldThumbs[ri].parentNode.removeChild(oldThumbs[ri]);
    }

    onStatus('Capturing ' + transitions.length + ' thumbnail(s)...');

    // Insert in reverse order so DOM positions remain stable
    for (var ti = transitions.length - 1; ti >= 0; ti--) {
      var slideTime = transitions[ti];
      var captureTime = Math.min(slideTime + 0.5, duration - 0.1);
      onStatus('Capturing thumbnail ' + (transitions.length - ti) + '/' + transitions.length + '...');

      // Capture thumbnail
      await seekAndCapture(captureTime, thumbCtx, thumbW, thumbH);
      var dataUrl = thumbCanvas.toDataURL('image/jpeg', THUMB_QUALITY);

      // Find insertion point
      var timeMs = Math.round(slideTime * 1000);
      var insertPoint = findInsertionPoint(timeMs);
      if (!insertPoint) continue;

      // Create thumbnail element
      var img = document.createElement('img');
      img.src = dataUrl;
      img.className = 'slide-thumbnail';
      img.setAttribute('data-slide-time', String(timeMs));
      img.title = 'Slide @ ' + formatTimeForTitle(slideTime);

      // Insert at the correct position
      if (insertPoint.insertBefore) {
        insertPoint.node.parentNode.insertBefore(img, insertPoint.node);
      } else if (insertPoint.node.nextSibling) {
        insertPoint.node.parentNode.insertBefore(img, insertPoint.node.nextSibling);
      } else {
        insertPoint.node.parentNode.appendChild(img);
      }
    }

    // Restore video state
    videoEl.currentTime = savedTime;
    if (!wasPaused) videoEl.play().catch(function() {});

    return transitions.length;
  } catch (err) {
    // Restore video state on error
    videoEl.currentTime = savedTime;
    if (!wasPaused) videoEl.play().catch(function() {});
    throw err;
  }
}

function formatTimeForTitle(seconds) {
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
