/**
 * AstroLens 入口
 *
 * 职责：装配各子系统，把手势 / 语音 / 文本三种输入，
 * 汇聚到 Agent 决策层，再驱动 3D 场景与音频反馈。
 */
import './style.css';

import { AstroScene } from './core/scene';
import { MORPHS, type MorphShape } from './core/morphs';
import { AudioEngine } from './audio/engine';
import { ChatPanel } from './ui/chat';
import { Hud } from './ui/hud';
import { SettingsPanel } from './ui/settings';
import { GestureController, type GestureFrame, type GestureName } from './input/gestures';
import { SpeechInput } from './input/speech';
import { LlmClient } from './ai/llm';
import { AstroAgent } from './ai/agent';
import { loadLlmConfig, type LlmConfig } from './config';

// ---------------- 基础装配 ----------------
const stage = document.getElementById('stage') as HTMLElement;
const scene = new AstroScene(stage);
scene.start();

const audio = new AudioEngine();
const chat = new ChatPanel();
const hud = new Hud();
const settings = new SettingsPanel();
const speech = new SpeechInput();

let llmConfig: LlmConfig = loadLlmConfig();
const llm = new LlmClient(llmConfig);
let warpTimer: number | undefined;

// ---------------- Agent 工具：AI → 场景 ----------------
const agent = new AstroAgent(llm, {
  setMorph: (shape: MorphShape) => {
    scene.setMorph(shape);
    // 切形态时清掉上一个知识点残留的扭曲与缩放，避免特效串台
    // 镜头距离不重置：模型调过镜头后强行回默认会产生可见的推拉漂移
    scene.setWarp(0);
    scene.setScale(1);
    window.clearTimeout(warpTimer);
    // 超新星切换时补一次脉冲，模拟爆发瞬间的向外冲击
    if (shape === 'supernova') scene.pulse(1.6);
    audio.play('morph');
  },
  setCamera: (distance: number) => {
    // 限制模型调整镜头的幅度，避免答案播放过程中出现明显的推拉漂移
    scene.setCameraDistance(Math.min(390, Math.max(330, distance)));
  },
  triggerEffect: (effect) => {
    if (effect === 'pulse') {
      scene.pulse(1);
      audio.play('peace');
    } else if (effect === 'warp_on') {
      scene.setWarp(1);
      audio.play('warp');
      // 自动收束：模型通常不会主动关闭，超时后恢复，避免扭曲一直叠加
      window.clearTimeout(warpTimer);
      warpTimer = window.setTimeout(() => scene.setWarp(0), 3000);
    } else {
      scene.setWarp(0);
      window.clearTimeout(warpTimer);
    }
  },
});

chat.setMode(!agent.hasLlm, agent.hasLlm ? '' : '未配置大模型，当前使用本地知识库');

// ---------------- 提问主流程 ----------------
let busy = false;
let abort: AbortController | null = null;

async function ask(question: string): Promise<void> {
  if (busy) return;
  busy = true;
  chat.setBusy(true);
  chat.addUserMessage(question);
  audio.play('ask');

  const handle = chat.createAiMessage();
  abort = new AbortController();

  try {
    await agent.ask(
      question,
      {
        onStatus: () => {},
        onCitations: (hits) => handle.setCitations(hits.map((h) => h.entry.title)),
        onToken: (t) => handle.append(t),
        onDone: (_full, offline) => {
          handle.finish();
          chat.setMode(offline);
          audio.play('answer');
        },
        onError: (message) => {
          chat.addErrorMessage(message);
        },
      },
      abort.signal,
    );
  } finally {
    handle.finish();
    chat.setBusy(false);
    busy = false;
    abort = null;
  }
}

chat.onAsk = (q) => void ask(q);

// ---------------- 启动流程 ----------------
const boot = document.getElementById('boot') as HTMLElement;
const bootBtn = document.getElementById('boot-btn') as HTMLButtonElement;

let entered = false;
bootBtn.addEventListener('click', async () => {
  if (entered) return;
  entered = true;
  bootBtn.disabled = true;
  bootBtn.textContent = '正在进入…';

  try {
    await audio.init();
    audio.startBgm();
  } catch {
    // 音频不可用时不影响主体功能
  }

  boot.classList.add('is-hidden');
  window.setTimeout(() => {
    boot.style.display = 'none';
  }, 720);
});

// ---------------- 设置 ----------------
settings.onSave = (cfg, audioPrefs) => {
  llmConfig = cfg;
  llm.reconfigure(cfg);
  agent.reconfigure(llm);
  chat.setMode(!agent.hasLlm, agent.hasLlm ? '' : '未配置大模型，当前使用本地知识库');
  audio.bgmEnabled = audioPrefs.bgm;
  audio.sfxEnabled = audioPrefs.sfx;
};

settings.onAudioChange = (prefs) => {
  audio.bgmEnabled = prefs.bgm;
  audio.sfxEnabled = prefs.sfx;
};

// ---------------- 语音输入 ----------------
const micBtn = document.getElementById('btn-mic') as HTMLButtonElement;
if (!speech.supported) {
  micBtn.style.display = 'none';
} else {
  micBtn.addEventListener('click', () => {
    if (speech.isListening) {
      speech.stop();
      micBtn.classList.remove('is-recording');
      return;
    }
    micBtn.classList.add('is-recording');
    speech.start(
      (text) => void ask(text),
      () => micBtn.classList.remove('is-recording'),
    );
  });
}

// ---------------- 手势 ----------------
const previewWrap = document.getElementById('preview-wrap') as HTMLElement;
const previewCanvas = document.getElementById('preview') as HTMLCanvasElement;
const previewCtx = previewCanvas.getContext('2d')!;
const video = document.getElementById('cam') as HTMLVideoElement;
const gestures = new GestureController(video);

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

gestures.onPreview = (hands) => {
  previewCtx.save();
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (video.readyState >= 2) {
    previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
  }
  previewCtx.strokeStyle = 'rgba(111,227,255,0.9)';
  previewCtx.lineWidth = 1.5;
  previewCtx.fillStyle = 'rgba(255,180,84,0.95)';

  for (const lm of hands) {
    for (const [a, b] of HAND_CONNECTIONS) {
      previewCtx.beginPath();
      previewCtx.moveTo(lm[a].x * previewCanvas.width, lm[a].y * previewCanvas.height);
      previewCtx.lineTo(lm[b].x * previewCanvas.width, lm[b].y * previewCanvas.height);
      previewCtx.stroke();
    }
    for (const p of lm) {
      previewCtx.beginPath();
      previewCtx.arc(p.x * previewCanvas.width, p.y * previewCanvas.height, 2, 0, Math.PI * 2);
      previewCtx.fill();
    }
  }
  previewCtx.restore();
};

let lastGesture: GestureName = 'none';
let morphCursor = 0;
const MORPH_ORDER = Object.keys(MORPHS) as MorphShape[];

function handleGestureFrame(frame: GestureFrame): void {
  hud.updateGesture(frame.gesture, frame.handCount);

  // 手腕倾斜 → 环绕；推拉 → 镜头
  scene.setHandRotation(frame.handRotation);

  if (frame.gesture === 'fist') scene.setZoomIntent('out');
  else if (frame.gesture === 'open') scene.setZoomIntent('in');
  else scene.setZoomIntent(null);

  // 双手：间距控制整体缩放，双拳进入时空扭曲
  if (frame.handCount >= 2 && frame.twoHandDistance > 0) {
    const scale = Math.min(2.2, Math.max(0.45, frame.twoHandDistance / 0.32));
    scene.setScale(scale);
  } else {
    scene.setScale(1);
  }

  if (frame.bothFist) {
    scene.setWarp(1);
    if (lastGesture !== 'fist') audio.play('warp');
  } else {
    scene.setWarp(0);
  }

  // 手势切换时的一次性反馈
  if (frame.gesture !== lastGesture) {
    switch (frame.gesture) {
      case 'fist':
        audio.play('fist');
        break;
      case 'open':
        audio.play('open');
        break;
      case 'peace':
        scene.pulse(1);
        audio.play('peace');
        break;
      case 'ok':
        scene.setCameraDistance(150);
        audio.play('ok');
        break;
      case 'rock': {
        morphCursor = (morphCursor + 1) % MORPH_ORDER.length;
        scene.setMorph(MORPH_ORDER[morphCursor]);
        audio.play('rock');
        break;
      }
      case 'pinch':
        scene.pulse(0.6);
        audio.play('pinch');
        break;
      default:
        break;
    }
    lastGesture = frame.gesture;
  }
}

gestures.onFrame = handleGestureFrame;

let camStarting = false;
hud.onCameraToggle = async () => {
  if (camStarting) return;
  camStarting = true;
  hud.setDisabled(true);
  hud.setCameraActive(false, '正在连接…');

  try {
    await gestures.start();
    previewWrap.hidden = false;
    hud.setCameraActive(true, '手势识别中');
  } catch (err) {
    const msg = (err as Error).message ?? '';
    const hint = /permission|denied|NotAllowed/i.test(msg)
      ? '摄像头权限被拒绝，已启用鼠标操控'
      : `摄像头不可用（${msg.slice(0, 40)}），已启用鼠标操控`;
    hud.setCameraActive(false, '开启手势识别');
    chat.addErrorMessage(hint);
  } finally {
    hud.setDisabled(false);
    camStarting = false;
  }
};

hud.bindCameraToggle();

// ---------------- 鼠标 / 触摸降级操控 ----------------
let dragging = false;
let lastX = 0;

stage.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  stage.setPointerCapture?.(e.pointerId);
});

stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  scene.orbit(dx * 0.005);
});

stage.addEventListener('pointerup', () => {
  dragging = false;
});

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  scene.zoomBy(e.deltaY * 0.9);
}, { passive: false });

// ---------------- 状态轮询 ----------------
let lastShape = scene.planet.currentShape;
window.setInterval(() => {
  const shape = scene.planet.currentShape;
  if (shape !== lastShape) {
    lastShape = shape;
    hud.updateShape(shape);
  }
  hud.updateDistance(scene.telemetry().cameraDistance);
  hud.updateFps(scene.telemetry().fps);
}, 400);

// ---------------- 页面卸载 ----------------
window.addEventListener('beforeunload', () => {
  abort?.abort();
  gestures.stop();
  scene.dispose();
  audio.dispose();
});

// 记录当前配置，便于调试面板展示
(window as unknown as { __astrolens?: unknown }).__astrolens = { scene, agent, llmConfig };
