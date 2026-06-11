declare global {
  interface Window {
    autoScroll: boolean;
    captionMaxLen: number;
    captionMinLen: number;
    changeRatio: () => void;
    doubleClick: boolean;
    insertSubtitles: (content: string) => void;
    jsonSplitTime: number;
    lastSubtitleContent: string | null;
    lastSubtitleType: string | null;
    minimizedMode: boolean;
    paraPunct: boolean;
    paraSplitTime: number;
    playOnClick: boolean;
    processVideo: (url: string, ext: string) => void;
    runSlideDetection: () => void;
    updateHeight: () => void;
    webMonetization: boolean;
  }
}

export {};
