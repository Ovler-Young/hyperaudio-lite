import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  ConfigProvider,
  Divider,
  Input,
  InputNumber,
  Layout,
  Select,
  Slider,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import {
  BorderOutlined,
  ColumnWidthOutlined,
  ExpandAltOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { initializeLegacyDesktopPage } from './legacyBridge';

const { Text } = Typography;

const videoRatioOptions = [
  { value: 'unset', label: 'Native' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
  { value: 'custom', label: 'Custom' },
  { value: 'vertex', label: 'Pick Zoom Area' },
];

type RatioMode = (typeof videoRatioOptions)[number]['value'];

export function DesktopStudio() {
  const [ratioMode, setRatioMode] = useState<RatioMode>('unset');
  const [customRatio, setCustomRatio] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [splitTime, setSplitTime] = useState(2);
  const [jsonSplit, setJsonSplit] = useState(0.25);
  const [captionMaxLen, setCaptionMaxLen] = useState(37);
  const [captionMinLen, setCaptionMinLen] = useState(21);
  const [slideInterval, setSlideInterval] = useState(30);
  const [slideThreshold, setSlideThreshold] = useState(5);
  const [slideSize, setSlideSize] = useState(128);
  const [slideDedup, setSlideDedup] = useState(2);

  useEffect(() => initializeLegacyDesktopPage(), []);

  const slideOptions = useMemo(
    () => ({
      coarseInterval: slideInterval,
      diffThreshold: slideThreshold,
      compareSize: slideSize,
      dedupGap: slideDedup,
    }),
    [slideDedup, slideInterval, slideSize, slideThreshold],
  );

  useEffect(() => {
    window.hyperaudioDesktop?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    window.hyperaudioDesktop?.setSubtitleOptions({
      splitTime,
      jsonSplit,
      maxLength: captionMaxLen,
      minLength: captionMinLen,
    });
  }, [captionMaxLen, captionMinLen, jsonSplit, splitTime]);

  useEffect(() => {
    window.hyperaudioDesktop?.setSlideOptions(slideOptions);
  }, [slideOptions]);

  useEffect(() => {
    window.hyperaudioDesktop?.changeRatio(ratioMode, customRatio);
  }, [customRatio, ratioMode]);

  const openUploader = () => {
    document.getElementById('Uploader')?.click();
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorPrimary: '#176b87',
          colorSuccess: '#4f7d4f',
          colorWarning: '#b46a2b',
          fontFamily:
            '"Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
        },
      }}
    >
      <Layout className="studio-shell" id="Thebox">
        <header className="studio-topbar">
          <div>
            <Text className="studio-kicker">Hyperaudio Lite</Text>
            <h1>Desktop Transcript Studio</h1>
          </div>
          <Space size={8} wrap>
            <Tag color="cyan">React</Tag>
            <Tag color="geekblue">Vite</Tag>
            <Tag color="green">Ant Design</Tag>
          </Space>
        </header>

        <main id="split-container" className="desktop-split">
          <section id="left-panel" className="media-panel">
            <div id="wrapper" className="player-frame">
              <div id="viewport">
                <video id="hyperplayer" className="hyperaudio-player" controls>
                  <track
                    id="hyperplayer-vtt"
                    label="English"
                    kind="subtitles"
                    srcLang="en"
                    src=""
                  />
                </video>
              </div>
            </div>

            <section id="zoom-subtitle" className="focus-strip">
              <div
                id="pbr-overlay"
                className="playback-overlay"
                aria-label="Overlay playback rate"
              >
                <span id="overlayPbrVal">1</span>x
                <input
                  id="overlayPbr"
                  type="range"
                  defaultValue="1"
                  min="0.5"
                  max="5"
                  step="0.05"
                />
              </div>
              <div className="focus-placeholder">
                <PlayCircleOutlined />
                <span>Active caption focus appears here during playback.</span>
              </div>
            </section>
          </section>

          <div id="resizer" title="Resize panels" />

          <aside id="right-panel" className="transcript-panel">
            <section id="hypertranscript" className="hyperaudio-transcript">
              <form id="searchForm" className="control-board">
                <div className="control-header">
                  <div>
                    <Text className="control-eyebrow">Source</Text>
                    <h2>Media & Transcript</h2>
                  </div>
                  <div id="fileUploader">
                    <input
                      id="Uploader"
                      className="visually-hidden"
                      type="file"
                      accept="video/*,audio/*,.json,.srt,.vtt,.ass,.mkv,.flv,.avi,.wmv,.mov,.webm,.ts,.m2ts"
                      multiple
                    />
                    <Tooltip title="Load local media and subtitle files">
                      <Button
                        icon={<UploadOutlined />}
                        onClick={openUploader}
                        type="primary"
                      >
                        Upload
                      </Button>
                    </Tooltip>
                  </div>
                </div>

                <div className="toolbar-row">
                  <label className="field-stack ratio-field">
                    <span>Video Ratio</span>
                    <Select
                      id="videoRatio"
                      value={ratioMode}
                      options={videoRatioOptions}
                      onChange={(value) => setRatioMode(value)}
                    />
                  </label>
                  {ratioMode === 'custom' ? (
                    <label className="field-stack custom-ratio">
                      <span>Custom</span>
                      <Input
                        id="customRatio"
                        value={customRatio}
                        placeholder="4:3"
                        onChange={(event) => setCustomRatio(event.target.value)}
                      />
                    </label>
                  ) : (
                    <input id="customRatio" type="hidden" value={customRatio} readOnly />
                  )}
                  <p id="guide" className="zoom-guide">
                    Click the top-left point, then the bottom-right point.
                  </p>
                </div>

                <ControlSection title="Playback" icon={<PlayCircleOutlined />}>
                  <RangeControl
                    id="pbr"
                    label="Rate"
                    value={playbackRate}
                    min={0.5}
                    max={5}
                    step={0.05}
                    suffix="x"
                    onChange={setPlaybackRate}
                  />
                  <span id="currentPbr" className="legacy-value">
                    {playbackRate}
                  </span>
                </ControlSection>

                <ControlSection title="Caption Rules" icon={<ColumnWidthOutlined />}>
                  <RangeControl
                    id="splitTimeSlider"
                    label="SRT gap"
                    value={splitTime}
                    min={0}
                    max={10}
                    step={0.1}
                    suffix="s"
                    onChange={setSplitTime}
                  />
                  <span id="currentSplitTime" className="legacy-value">
                    {splitTime}
                  </span>
                  <RangeControl
                    id="jsonSplitSlider"
                    label="JSON gap"
                    value={jsonSplit}
                    min={0}
                    max={2}
                    step={0.05}
                    suffix="s"
                    onChange={setJsonSplit}
                  />
                  <span id="currentJsonSplit" className="legacy-value">
                    {jsonSplit}
                  </span>
                  <RangeControl
                    id="maxLenSlider"
                    label="Max length"
                    value={captionMaxLen}
                    min={10}
                    max={80}
                    step={1}
                    onChange={setCaptionMaxLen}
                  />
                  <span id="currentMaxLen" className="legacy-value">
                    {captionMaxLen}
                  </span>
                  <RangeControl
                    id="minLenSlider"
                    label="Min length"
                    value={captionMinLen}
                    min={5}
                    max={60}
                    step={1}
                    onChange={setCaptionMinLen}
                  />
                  <span id="currentMinLen" className="legacy-value">
                    {captionMinLen}
                  </span>
                </ControlSection>

                <ControlSection title="Slide Detection" icon={<FileSearchOutlined />}>
                  <div className="detect-row">
                    <Button
                      id="detectSlidesBtn"
                      icon={<FileSearchOutlined />}
                      onClick={() => window.hyperaudioDesktop?.runSlideDetection()}
                    >
                      Detect Slides
                    </Button>
                    <span id="slideDetectStatus" className="detect-status" />
                  </div>
                  <NumberSlider
                    sliderId="sdIntervalSlider"
                    numberId="sdIntervalNum"
                    label="Sample interval"
                    value={slideInterval}
                    min={1}
                    max={300}
                    step={1}
                    suffix="s"
                    onChange={setSlideInterval}
                  />
                  <NumberSlider
                    sliderId="sdThresholdSlider"
                    numberId="sdThresholdNum"
                    label="Diff threshold"
                    value={slideThreshold}
                    min={1}
                    max={100}
                    step={1}
                    onChange={setSlideThreshold}
                  />
                  <NumberSlider
                    sliderId="sdSizeSlider"
                    numberId="sdSizeNum"
                    label="Compare size"
                    value={slideSize}
                    min={16}
                    max={512}
                    step={16}
                    suffix="px"
                    onChange={setSlideSize}
                  />
                  <NumberSlider
                    sliderId="sdDedupSlider"
                    numberId="sdDedupNum"
                    label="Min duration"
                    value={slideDedup}
                    min={0}
                    max={30}
                    step={0.5}
                    suffix="s"
                    onChange={setSlideDedup}
                  />
                </ControlSection>
              </form>

              <article data-wm="$ilp.uphold.com/123article">
                <section
                  data-media-src="https://lab.hyperaud.io/video/BBC/education.mp4"
                  data-wm="$ilp.uphold.com/123section"
                />
              </article>
            </section>
          </aside>
        </main>
      </Layout>
    </ConfigProvider>
  );
}

function ControlSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="control-section">
      <div className="section-title">
        {icon}
        <span>{title}</span>
      </div>
      <Divider />
      {children}
    </section>
  );
}

function RangeControl({
  id,
  label,
  max,
  min,
  onChange,
  step,
  suffix = '',
  value,
}: {
  id: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="range-control">
      <label htmlFor={id}>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </label>
      <Slider
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </div>
  );
}

function NumberSlider({
  label,
  max,
  min,
  numberId,
  onChange,
  sliderId,
  step,
  suffix = '',
  value,
}: {
  label: string;
  max: number;
  min: number;
  numberId: string;
  onChange: (value: number) => void;
  sliderId: string;
  step: number;
  suffix?: string;
  value: number;
}) {
  const icon = suffix === 'px' ? <BorderOutlined /> : <ExpandAltOutlined />;

  return (
    <div className="number-slider">
      <label htmlFor={numberId}>
        {icon}
        <span>{label}</span>
      </label>
      <InputNumber
        id={numberId}
        min={min}
        max={max}
        step={step}
        value={value}
        addonAfter={suffix || undefined}
        onChange={(next) => onChange(typeof next === 'number' ? next : min)}
      />
      <Slider
        id={sliderId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
