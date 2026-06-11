type MpegtsPlayer = {
  attachMediaElement: (video: HTMLVideoElement) => void;
  destroy: () => void;
  load: () => void;
};

type SubtitleOptions = {
  splitTime: number;
  jsonSplit: number;
  maxLength: number;
  minLength: number;
};

type SlideOptions = {
  coarseInterval: number;
  diffThreshold: number;
  compareSize: number;
  dedupGap: number;
};

declare global {
  interface Window {
    $?: (selector: string) => { prop: (name: string) => unknown };
    HyperaudioLite: new (
      transcriptId: string,
      playerId: string,
      minimizedMode: boolean,
      autoScroll: boolean,
      doubleClick: boolean,
      webMonetization: boolean,
      playOnClick: boolean,
    ) => unknown;
    caption: () => {
      init: (
        transcriptId: string,
        playerId: string,
        maxLength: number,
        minLength: number,
      ) => unknown;
    };
    detectSlideChanges: (
      videoEl: HTMLVideoElement,
      sectionEl: HTMLElement,
      onStatus: (message: string) => void,
      options: SlideOptions,
    ) => Promise<number>;
    hyperaudioDesktop?: {
      changeRatio: (ratio: string, customRatio?: string) => void;
      runSlideDetection: () => void;
      setPlaybackRate: (value: number) => void;
      setSlideOptions: (options: SlideOptions) => void;
      setSubtitleOptions: (options: SubtitleOptions) => void;
    };
    mpegts?: {
      createPlayer: (options: { type: string; url: string }) => MpegtsPlayer;
      isSupported: () => boolean;
    };
    jQuery?: {
      Velocity?: unknown;
    };
    processASS?: (content: string) => void;
    processJSON?: (content: string) => void;
    processSRT?: (content: string) => void;
    processSubtitles?: (file: File) => void;
    processVTT?: (content: string) => void;
    _filmstripCleanup?: (() => void) | null;
  }
}

let initialized = false;
let mpegtsPlayer: MpegtsPlayer | null = null;
let captionController: ReturnType<Window['caption']> | null = null;
let reprocessTimer: number | undefined;
let resizeTimer: number | undefined;
let clicks: Array<{ x: number; y: number }> = [];
let currentRatio = 'unset';
let currentCustomRatio = '';
let currentSlideOptions: SlideOptions = {
  coarseInterval: 30,
  diffThreshold: 5,
  compareSize: 128,
  dedupGap: 2,
};

const legacyScripts = [
  'https://cdnjs.cloudflare.com/ajax/libs/velocity/1.5.0/velocity.js',
  'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.min.js',
  '/js/hyperaudio-lite.js',
  '/js/share-this.js',
  '/js/share-this-twitter.js',
  '/js/share-this-clipboard.js',
  '/js/caption.js',
  '/js/subtitle.js',
  '/js/slide-detect.js',
];

export function initializeLegacyDesktopPage() {
  if (initialized) return;
  initialized = true;

  installGlobals();
  exposeBridgeApi();
  bindLocalInteractions();

  void loadLegacyScripts().then(() => {
    initializeCaption();
    handleUrlParameters();
  });
}

function installGlobals() {
  window.minimizedMode = false;
  window.autoScroll = true;
  window.doubleClick = true;
  window.webMonetization = false;
  window.playOnClick = true;
  window.paraSplitTime = 2;
  window.paraPunct = false;
  window.jsonSplitTime = 0.25;
  window.captionMaxLen = 37;
  window.captionMinLen = 21;
  window.lastSubtitleContent = null;
  window.lastSubtitleType = null;

  if (typeof window.$ === 'undefined') {
    window.$ = (selector: string) => {
      const el = document.querySelector(selector) as Record<string, unknown> | null;

      return {
        prop(name: string) {
          return el ? el[name] : undefined;
        },
      };
    };
  }

  window.jQuery = window.jQuery || {};
}

function exposeBridgeApi() {
  window.hyperaudioDesktop = {
    changeRatio,
    runSlideDetection,
    setPlaybackRate,
    setSlideOptions(options) {
      currentSlideOptions = options;
    },
    setSubtitleOptions(options) {
      window.paraSplitTime = options.splitTime;
      window.jsonSplitTime = options.jsonSplit;
      window.captionMaxLen = options.maxLength;
      window.captionMinLen = options.minLength;
      reprocessSubtitles();
    },
  };

  window.changeRatio = () => {
    changeRatio(currentRatio, currentCustomRatio);
  };
  window.processVideo = processVideo;
  window.insertSubtitles = insertSubtitles;
  window.updateHeight = updateHeight;
  window.runSlideDetection = runSlideDetection;
}

function bindLocalInteractions() {
  bindUploader();
  bindResize();
  bindResizer();
  bindZoomSubtitleObserver();
  bindTranscriptThumbnails();
}

function bindUploader() {
  const uploader = document.getElementById('Uploader') as HTMLInputElement | null;
  if (!uploader) return;

  uploader.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []).sort((a, b) => b.name.localeCompare(a.name));
    const videoExts = [
      '.mp4',
      '.webm',
      '.ogg',
      '.ogv',
      '.mkv',
      '.flv',
      '.avi',
      '.wmv',
      '.mov',
      '.ts',
      '.m2ts',
      '.mp3',
      '.wav',
      '.m4a',
      '.aac',
      '.flac',
    ];
    const subtitleExts = ['.json', '.vtt', '.srt', '.ass'];
    let videoFile: File | undefined;
    let subtitleFile: File | undefined;

    for (const file of files) {
      const ext = getFileExtension(file.name);

      if (file.type.startsWith('video/') || file.type.startsWith('audio/') || videoExts.includes(ext)) {
        videoFile = file;
      } else if (
        ['application/json', 'text/vtt', 'application/x-subrip'].includes(file.type) ||
        subtitleExts.includes(ext)
      ) {
        subtitleFile = file;
      }
    }

    if (videoFile) {
      processVideo(URL.createObjectURL(videoFile), getFileExtension(videoFile.name));
    }

    if (subtitleFile && window.processSubtitles) {
      window.processSubtitles(subtitleFile);
    }

    if (videoFile && subtitleFile) {
      autoDetectSlidesAfterUpload();
    }
  });
}

function bindResize() {
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      changeRatio(currentRatio, currentCustomRatio);
      checkLayout();
    }, 100);
  });

  checkLayout();
}

function bindResizer() {
  const resizer = document.getElementById('resizer');
  const leftPanel = document.getElementById('left-panel');
  const rightPanel = document.getElementById('right-panel');
  const container = document.getElementById('split-container');
  if (!resizer || !leftPanel || !rightPanel || !container) return;

  let isResizing = false;

  const onStart = (event: Event) => {
    if (!container.classList.contains('landscape')) return;
    isResizing = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.preventDefault();
  };

  const onMove = (clientX: number) => {
    if (!isResizing) return;
    const rect = container.getBoundingClientRect();
    const offset = clientX - rect.left;
    const total = rect.width;
    const resizerWidth = resizer.offsetWidth;
    const leftWidth = Math.max(280, Math.min(offset, total - 260 - resizerWidth));
    const rightWidth = total - leftWidth - resizerWidth;

    leftPanel.style.flex = 'none';
    leftPanel.style.width = `${leftWidth}px`;
    rightPanel.style.flex = 'none';
    rightPanel.style.width = `${rightWidth}px`;
  };

  const onEnd = () => {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  resizer.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', (event) => onMove(event.clientX));
  document.addEventListener('mouseup', onEnd);
  resizer.addEventListener('touchstart', onStart);
  document.addEventListener(
    'touchmove',
    (event) => {
      if (!isResizing || !event.touches[0]) return;
      event.preventDefault();
      onMove(event.touches[0].clientX);
    },
    { passive: false },
  );
  document.addEventListener('touchend', onEnd);
}

function bindZoomSubtitleObserver() {
  const transcript = document.getElementById('hypertranscript');
  const zoomEl = document.getElementById('zoom-subtitle');
  if (!transcript || !zoomEl) return;

  let lastContent = '';

  const observer = new MutationObserver(() => {
    if (zoomEl.classList.contains('filmstrip-mode')) return;

    const activePara = transcript.querySelector('p.active, section.active, div.active');
    const overlay = document.getElementById('pbr-overlay');

    if (!activePara) return;

    const text = activePara.textContent || '';
    if (text === lastContent) return;

    lastContent = text;
    while (zoomEl.firstChild) zoomEl.removeChild(zoomEl.firstChild);

    if (overlay) zoomEl.appendChild(overlay);
    zoomEl.appendChild(activePara.cloneNode(true));
  });

  observer.observe(transcript, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });
}

function bindTranscriptThumbnails() {
  const transcript = document.getElementById('hypertranscript');
  const video = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  if (!transcript || !video) return;

  transcript.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('slide-thumbnail')) return;

    event.stopPropagation();
    const timeMs = parseInt(target.getAttribute('data-slide-time') || '0', 10);
    video.currentTime = timeMs / 1000;
    void video.play().catch(() => undefined);
  });
}

function loadLegacyScripts() {
  return legacyScripts.reduce(
    (promise, src) => promise.then(() => loadScript(src)),
    Promise.resolve(),
  );
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => {
      if (src.startsWith('http')) {
        console.warn(`Optional legacy script failed to load: ${src}`);
        resolve();
        return;
      }

      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(script);
  });
}

function initializeCaption() {
  if (!window.caption) return;
  captionController = window.caption();
  captionController.init('hypertranscript', 'hyperplayer', window.captionMaxLen, window.captionMinLen);
  setPlaybackRate(1);
}

function handleUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  const videoUrl = params.get('video');
  const subtitleUrl = params.get('subtitle');

  if (subtitleUrl) {
    void fetch(subtitleUrl)
      .then((response) => response.text())
      .then((content) => {
        processSubtitleContent(subtitleUrl, content);
      })
      .catch((error) => console.error('Error fetching subtitle:', error));
  }

  if (videoUrl) {
    const videoExt = getFileExtension(videoUrl.split('?')[0]);
    window.setTimeout(() => processVideo(videoUrl, videoExt), 500);
  }

  if (videoUrl && subtitleUrl) {
    const fileUploader = document.getElementById('fileUploader');
    if (fileUploader) fileUploader.style.display = 'none';
  }
}

function processSubtitleContent(subtitleUrl: string, content: string) {
  const subtitleType = getFileExtension(subtitleUrl);

  switch (subtitleType) {
    case '.vtt':
      window.processVTT?.(content);
      break;
    case '.srt':
      window.processSRT?.(content);
      break;
    case '.json':
      window.processJSON?.(content);
      break;
    case '.ass':
      window.processASS?.(content);
      break;
    default:
      console.log('Unsupported subtitle format');
      break;
  }
}

function processVideo(url: string, ext: string) {
  const articleElement = document.querySelector('#hypertranscript article');
  const videoElement = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  if (!articleElement || !videoElement) return;

  const newSection = document.createElement('section');
  newSection.setAttribute('data-media-src', url);
  articleElement.insertBefore(newSection, articleElement.firstChild);

  if (mpegtsPlayer) {
    mpegtsPlayer.destroy();
    mpegtsPlayer = null;
  }

  const mpegtsExts = ['.flv', '.ts', '.m2ts'];
  if (mpegtsExts.includes(ext) && window.mpegts?.isSupported()) {
    videoElement.removeAttribute('src');
    mpegtsPlayer = window.mpegts.createPlayer({
      type: ext === '.flv' ? 'flv' : 'mpegts',
      url,
    });
    mpegtsPlayer.attachMediaElement(videoElement);
    mpegtsPlayer.load();
  } else {
    videoElement.setAttribute('src', url);
    videoElement.load();
  }
}

function insertSubtitles(content: string) {
  const articleElement = document.querySelector('#hypertranscript article');
  let firstSection = articleElement?.querySelector('section');
  if (!articleElement) return;

  if (!firstSection) {
    firstSection = document.createElement('section');
    articleElement.appendChild(firstSection);
  }

  firstSection.innerHTML = content;

  const sections = articleElement.querySelectorAll('section');
  for (let i = 1; i < sections.length; i += 1) {
    sections[i].remove();
  }
}

function reprocessSubtitles() {
  const content = window.lastSubtitleContent;
  const type = window.lastSubtitleType;
  if (!content || !type) return;

  window.clearTimeout(reprocessTimer);
  reprocessTimer = window.setTimeout(() => {
    const hadThumbs = Boolean(document.querySelector('#hypertranscript .slide-thumbnail'));
    const section = document.querySelector('#hypertranscript article section[data-media-src]');
    const savedSrc = section?.getAttribute('data-media-src') || null;

    section?.removeAttribute('data-media-src');

    switch (type) {
      case '.srt':
        window.processSRT?.(content);
        break;
      case '.json':
        window.processJSON?.(content);
        break;
      case '.vtt':
        window.processVTT?.(content);
        break;
      case '.ass':
        window.processASS?.(content);
        break;
      default:
        break;
    }

    if (window.caption) {
      captionController = window.caption();
      captionController.init('hypertranscript', 'hyperplayer', window.captionMaxLen, window.captionMinLen);
    }

    if (savedSrc) {
      document.querySelector('#hypertranscript article section')?.setAttribute('data-media-src', savedSrc);
    }

    if (hadThumbs) {
      resetFilmstrip('Thumbnails removed. Re-run Detect Slides.');
    }
  }, 100);
}

function resetFilmstrip(message: string) {
  const statusEl = document.getElementById('slideDetectStatus');
  const zoomEl = document.getElementById('zoom-subtitle');
  const overlay = document.getElementById('pbr-overlay');

  if (statusEl) statusEl.textContent = message;
  if (zoomEl) {
    zoomEl.classList.remove('filmstrip-mode');
    while (zoomEl.firstChild) zoomEl.removeChild(zoomEl.firstChild);
    if (overlay) zoomEl.appendChild(overlay);
  }

  if (window._filmstripCleanup) {
    window._filmstripCleanup();
    window._filmstripCleanup = null;
  }
}

function autoDetectSlidesAfterUpload() {
  const video = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  if (!video) return;

  const tryAutoDetect = () => {
    const section = document.querySelector('#hypertranscript article section');
    if (video.duration && section?.querySelector('span[data-m]')) {
      runSlideDetection();
      return;
    }

    window.setTimeout(tryAutoDetect, 500);
  };

  video.addEventListener('loadeddata', function onLoaded() {
    video.removeEventListener('loadeddata', onLoaded);
    window.setTimeout(tryAutoDetect, 300);
  });
}

function runSlideDetection() {
  const video = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  const section = document.querySelector('#hypertranscript article section') as HTMLElement | null;
  const statusEl = document.getElementById('slideDetectStatus');
  const btn = document.getElementById('detectSlidesBtn') as HTMLButtonElement | null;

  if (!video || !section || !statusEl) return;

  if (!video.duration || !section.querySelector('span[data-m]')) {
    statusEl.textContent = 'Please load video and subtitles first.';
    return;
  }

  if (!window.detectSlideChanges) {
    statusEl.textContent = 'Slide detector is still loading.';
    return;
  }

  if (btn) btn.disabled = true;
  statusEl.textContent = 'Detecting...';

  window
    .detectSlideChanges(video, section, (message) => {
      statusEl.textContent = message;
    }, currentSlideOptions)
    .then((count) => {
      statusEl.textContent = `Found ${count} slide change(s).`;
    })
    .catch((error: Error) => {
      statusEl.textContent = `Error: ${error.message}`;
      console.error(error);
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function setPlaybackRate(value: number) {
  const video = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  const pbr = document.getElementById('pbr') as HTMLInputElement | null;
  const pbrValue = document.getElementById('currentPbr');
  const overlayPbr = document.getElementById('overlayPbr') as HTMLInputElement | null;
  const overlayPbrVal = document.getElementById('overlayPbrVal');
  const normalized = String(value);

  if (video) video.playbackRate = value;
  if (pbr) pbr.value = normalized;
  if (pbrValue) pbrValue.textContent = normalized;
  if (overlayPbr) overlayPbr.value = normalized;
  if (overlayPbrVal) overlayPbrVal.textContent = normalized;
}

function changeRatio(ratio: string, customRatio = '') {
  currentRatio = ratio;
  currentCustomRatio = customRatio;

  const video = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  const viewport = document.getElementById('viewport');
  const guide = document.getElementById('guide');
  if (!video || !viewport) return;

  if (ratio === 'unset') {
    viewport.style.transform = 'none';
    video.style.height = 'auto';
    updateHeight();
    video.removeEventListener('click', handleClick);
    if (guide) guide.style.display = 'none';
    return;
  }

  if (ratio === 'vertex') {
    video.addEventListener('click', handleClick);
    if (guide) guide.style.display = 'block';
    return;
  }

  video.removeEventListener('click', handleClick);
  clicks = [];
  viewport.style.transform = 'none';
  if (guide) guide.style.display = 'none';

  const nextRatio = ratio === 'custom' ? customRatio : ratio;
  if (nextRatio) {
    setVideoRatio(nextRatio, video);
  }
}

function setVideoRatio(ratio: string, video: HTMLVideoElement) {
  const [width, height] = ratio.split(':').map(Number);
  if (!width || !height) return;

  video.style.height = `${video.offsetWidth * (height / width)}px`;
  updateHeight();
}

function handleClick(event: MouseEvent) {
  const video = document.getElementById('hyperplayer') as HTMLVideoElement | null;
  const guide = document.getElementById('guide');
  if (!video || !guide) return;

  guide.textContent = 'Click the top-left point, then the bottom-right point.';
  guide.style.display = 'block';

  const rect = video.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  clicks.push({ x, y });

  if (clicks.length === 1) {
    guide.textContent = `First point: ${Math.round(x)}, ${Math.round(y)}. Pick the bottom-right point.`;
    return;
  }

  if (clicks.length === 2) {
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    const widthZoom = video.offsetWidth / (clicks[1].x - clicks[0].x);
    const heightZoom = video.offsetHeight / (clicks[1].y - clicks[0].y);
    const zoom = Math.min(widthZoom, heightZoom);

    viewport.style.transform = `scale(${zoom}) translate(-${clicks[0].x}px, -${clicks[0].y}px)`;
    guide.textContent = `Zoom applied from ${Math.round(x)}, ${Math.round(y)}.`;
    video.removeEventListener('click', handleClick);
    clicks = [];
    window.setTimeout(() => {
      guide.style.display = 'none';
    }, 3000);
  }
}

function checkLayout() {
  const container = document.getElementById('split-container');
  const leftPanel = document.getElementById('left-panel');
  const rightPanel = document.getElementById('right-panel');
  const transcript = document.getElementById('hypertranscript');
  if (!container || !leftPanel || !rightPanel || !transcript) return;

  if (window.innerWidth > window.innerHeight) {
    container.classList.add('landscape');
    container.classList.remove('portrait');
    transcript.style.height = '';
    return;
  }

  container.classList.add('portrait');
  container.classList.remove('landscape');
  leftPanel.style.flex = '';
  leftPanel.style.width = '';
  rightPanel.style.flex = '';
  rightPanel.style.width = '';
  updateHeight();
}

function updateHeight() {
  if (window.innerWidth > window.innerHeight) return;

  const box = document.getElementById('Thebox');
  const player = document.getElementById('hyperplayer');
  const transcript = document.getElementById('hypertranscript');
  if (!box || !player || !transcript) return;

  const boxHeight = window.getComputedStyle(box).height;
  const playerHeight = window.getComputedStyle(player).height;
  const transcriptHeight = `${parseInt(boxHeight, 10) - parseInt(playerHeight, 10) - 90}px`;
  transcript.style.height = transcriptHeight;
}

function getFileExtension(fileName: string) {
  const cleanName = fileName.split('?')[0];
  return cleanName.substring(cleanName.lastIndexOf('.')).toLowerCase();
}

export {};
