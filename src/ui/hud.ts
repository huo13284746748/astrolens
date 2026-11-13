/**
 * HUD：手势状态、镜头距离、帧率与形态指示
 */
import { MORPHS, type MorphShape } from '../core/morphs';
import type { GestureName } from '../input/gestures';

const GESTURE_LABEL: Record<GestureName, string> = {
  none: '未识别',
  fist: '握拳 · 拉远',
  open: '张开 · 靠近',
  peace: 'V 手势 · 脉冲',
  ok: 'OK · 跃迁',
  rock: '摇滚 · 变色',
  pinch: '捏合 · 共鸣',
  point: '指向',
};

export class Hud {
  private gestureEl: HTMLElement;
  private handsEl: HTMLElement;
  private distanceEl: HTMLElement;
  private fpsEl: HTMLElement;
  private shapeLabel: HTMLElement;
  private shapeDot: HTMLElement;
  private camBtn: HTMLButtonElement;
  private hud: HTMLElement;

  constructor() {
    this.gestureEl = document.getElementById('hud-gesture') as HTMLElement;
    this.handsEl = document.getElementById('hud-hands') as HTMLElement;
    this.distanceEl = document.getElementById('hud-distance') as HTMLElement;
    this.fpsEl = document.getElementById('hud-fps') as HTMLElement;
    this.shapeLabel = document.getElementById('shape-label') as HTMLElement;
    this.shapeDot = document.querySelector('.shape-tag__dot') as HTMLElement;
    this.camBtn = document.getElementById('cam-toggle') as HTMLButtonElement;
    this.hud = document.getElementById('hud') as HTMLElement;
  }

  onCameraToggle: (() => void) | null = null;

  bindCameraToggle(): void {
    this.camBtn.addEventListener('click', () => this.onCameraToggle?.());
  }

  setCameraActive(active: boolean, label: string): void {
    this.camBtn.textContent = label;
    this.camBtn.classList.toggle('is-on', active);
  }

  setDisabled(disabled: boolean): void {
    this.camBtn.disabled = disabled;
  }

  updateGesture(gesture: GestureName, hands: number): void {
    this.gestureEl.textContent = GESTURE_LABEL[gesture] ?? '未识别';
    this.handsEl.textContent = `${hands} / 2`;
  }

  updateDistance(d: number): void {
    this.distanceEl.textContent = d.toFixed(0);
  }

  updateFps(fps: number): void {
    this.fpsEl.textContent = `${fps} fps`;
  }

  updateShape(shape: MorphShape): void {
    const meta = MORPHS[shape];
    this.shapeLabel.textContent = meta.label;
    const hue = Math.round(meta.hue * 360);
    this.shapeDot.style.background = `hsl(${hue} 85% 62%)`;
    this.shapeDot.style.boxShadow = `0 0 12px hsl(${hue} 85% 62%)`;
  }

  toggleTuck(tucked: boolean): void {
    this.hud.classList.toggle('is-tucked', tucked);
  }
}
