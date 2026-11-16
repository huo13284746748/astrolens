/**
 * 手势识别
 *
 * 基于 MediaPipe Tasks Vision 的 HandLandmarker（本地 WASM + 本地模型，无需联网）。
 * 输出抽象后的手势语义，供场景与音频层消费，二者与识别实现解耦。
 */
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export type GestureName =
  | 'none'
  | 'fist'
  | 'open'
  | 'peace'
  | 'ok'
  | 'rock'
  | 'pinch'
  | 'point';

export interface GestureFrame {
  handCount: number;
  gesture: GestureName;
  /** 手掌倾斜量，用于水平环绕相机 */
  handRotation: number;
  /** 双手腕间距（归一化），无双手时为 0 */
  twoHandDistance: number;
  /** 双手均握拳 */
  bothFist: boolean;
}

const dist = (a: NormalizedLandmark, b: NormalizedLandmark): number =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_PIPS = [6, 10, 14, 18];

/** 判断五根手指的弯曲状态：[拇指, 食指, 中指, 无名指, 小指] */
export function fingerStates(lm: NormalizedLandmark[]): boolean[] {
  const wrist = lm[0];
  const folded: boolean[] = [];

  // 拇指：比较指尖到小指根的距离与拇指关节到小指根的距离
  const pinkyMcp = lm[17];
  folded.push(dist(lm[4], pinkyMcp) < dist(lm[3], pinkyMcp) * 1.05);

  for (let i = 0; i < 4; i++) {
    const tip = lm[FINGER_TIPS[i]];
    const pip = lm[FINGER_PIPS[i]];
    folded.push(dist(tip, wrist) < dist(pip, wrist));
  }
  return folded;
}

export function classify(lm: NormalizedLandmark[]): GestureName {
  const f = fingerStates(lm);
  const [thumb, index, middle, ring, pinky] = f;
  const foldedCount = f.filter(Boolean).length;

  const thumbIndexClose = dist(lm[4], lm[8]) < 0.075;

  // OK：拇指与食指成环，其余三指伸展
  if (thumbIndexClose && !middle && !ring && !pinky) return 'ok';
  // 捏合：拇指与食指贴合，其余三指收拢
  if (thumbIndexClose && middle && ring && pinky) return 'pinch';

  // 胜利 V：食指与中指伸展
  if (!index && !middle && ring && pinky) return 'peace';
  // 摇滚：食指与小指伸展
  if (!index && middle && ring && !pinky) return 'rock';
  // 指向：仅食指伸展
  if (!index && middle && ring && pinky && thumb) return 'point';

  if (foldedCount >= 4) return 'fist';
  if (foldedCount <= 1) return 'open';
  return 'none';
}

export class GestureController {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private lastVideoTime = -1;

  private stableGesture: GestureName = 'none';
  private candidate: GestureName = 'none';
  private candidateFrames = 0;

  onFrame: ((frame: GestureFrame) => void) | null = null;
  onPreview: ((lm: NormalizedLandmark[][], video: HTMLVideoElement) => void) | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  async start(): Promise<void> {
    // 防重入：按钮可重复点击，重复启动会叠加多条识别循环并泄漏摄像头流
    if (this.running) return;

    const vision = await FilesetResolver.forVisionTasks('/mediapipe');
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/models/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.landmarker = landmarker;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      // 摄像头不可用时释放已创建的模型，避免下次重试重复占用
      landmarker.close();
      this.landmarker = null;
      throw err;
    }

    this.video.srcObject = this.stream;
    await this.video.play();

    this.running = true;
    this.loop();
  }

  private loop = (): void => {
    if (!this.running || !this.landmarker) return;
    this.rafId = requestAnimationFrame(this.loop);

    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    let result;
    try {
      result = this.landmarker.detectForVideo(this.video, performance.now());
    } catch {
      return;
    }

    const hands = result.landmarks ?? [];
    this.onPreview?.(hands, this.video);

    if (hands.length === 0) {
      this.candidateFrames = 0;
      this.stableGesture = 'none';
      this.onFrame?.({
        handCount: 0,
        gesture: 'none',
        handRotation: 0,
        twoHandDistance: 0,
        bothFist: false,
      });
      return;
    }

    const primary = hands[0];
    const raw = classify(primary);

    // 连续 4 帧一致才切换，抑制抖动
    if (raw === this.candidate) {
      this.candidateFrames++;
      if (this.candidateFrames >= 4) this.stableGesture = raw;
    } else {
      this.candidate = raw;
      this.candidateFrames = 0;
    }

    // 手腕 → 中指根 的横向偏移，映射为环绕速度
    const wrist = primary[0];
    const middleBase = primary[9];
    const handRotation = (middleBase.x - wrist.x) * -5;

    let twoHandDistance = 0;
    let bothFist = false;
    if (hands.length >= 2) {
      const a = hands[0][0];
      const b = hands[1][0];
      twoHandDistance = Math.hypot(a.x - b.x, a.y - b.y);
      bothFist = classify(hands[0]) === 'fist' && classify(hands[1]) === 'fist';
    }

    this.onFrame?.({
      handCount: hands.length,
      gesture: this.stableGesture,
      handRotation,
      twoHandDistance,
      bothFist,
    });
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
