/**
 * 3D 场景引擎：渲染器、相机、后期、星空、星球、星环与相机轨道控制
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VISUAL } from '../config';
import { ParticlePlanet } from './planet';
import { createNebulaField, createSkyDome, createStarField, type NebulaField, type StarField } from './sky';
import type { MorphShape } from './morphs';

function createPointsTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createRing(innerR: number, outerR: number, count: number, color: number, tiltX: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = THREE.MathUtils.lerp(innerR, outerR, Math.random());
    positions[i * 3] = Math.cos(ang) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
    positions[i * 3 + 2] = Math.sin(ang) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size: 2,
    map: createPointsTexture(),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.rotation.x = tiltX;
  return points;
}

export interface SceneTelemetry {
  cameraDistance: number;
  shape: MorphShape;
  warp: number;
  fps: number;
}

export class AstroScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private clock = new THREE.Clock();

  readonly planet: ParticlePlanet;
  private stars: StarField;
  private nebula: NebulaField;
  private ringA: THREE.Points;
  private ringB: THREE.Points;

  // 相机轨道参数
  private radius: number = VISUAL.defaultCameraDistance;
  private radiusTarget: number = VISUAL.defaultCameraDistance;
  private phi = 0;
  private theta = Math.PI / 2;
  private handRotation = 0;
  private zoomVelocity = 0;
  private autoRotate = true;
  /** 装饰环透明度，黑洞形态下淡出以免遮挡吸积盘 */
  private decorFade = 1;
  private decorTarget = 1;

  private running = false;
  private frameCount = 0;
  private fpsTimer = 0;
  private fps = 60;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000006, 0.00032);

    this.camera = new THREE.PerspectiveCamera(
      58,
      container.clientWidth / container.clientHeight,
      1,
      4000,
    );

    // 后期：只用一层泛光，兼顾效果与性能
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      1.35,
      0.65,
      0.12,
    );
    this.composer.addPass(bloom);

    // 场景内容
    this.scene.add(createSkyDome());
    this.stars = createStarField();
    this.scene.add(this.stars.object);

    this.nebula = createNebulaField();
    this.scene.add(this.nebula.object);

    this.planet = new ParticlePlanet();
    this.scene.add(this.planet.object);

    this.ringA = createRing(70, 112, VISUAL.ringParticles, 0xffc987, Math.PI / 3);
    this.ringB = createRing(88, 148, VISUAL.ringParticles, 0x93c8ff, -Math.PI / 4.4);
    this.scene.add(this.ringA, this.ringB);

    window.addEventListener('resize', this.onResize);
    this.updateCameraPosition();
  }

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.planet.setPixelRatio(window.devicePixelRatio);
  };

  /** 手势倾斜 → 水平环绕 */
  setHandRotation(v: number): void {
    this.handRotation = v;
  }

  /** 握拳/张开 → 推拉镜头 */
  setZoomIntent(intent: 'in' | 'out' | null): void {
    if (intent === 'out') {
      this.zoomVelocity += 0.55;
      this.autoRotate = false;
      return;
    }
    if (intent === 'in') {
      const diff = this.radius - VISUAL.minCameraDistance;
      this.zoomVelocity = -diff * 0.05;
      this.autoRotate = false;
      return;
    }
    this.zoomVelocity *= 0.9;
    this.autoRotate = true;
  }

  /** 直接设定镜头距离（供 AI 工具调用） */
  setCameraDistance(d: number, immediate = false): void {
    this.radiusTarget = THREE.MathUtils.clamp(d, VISUAL.minCameraDistance, VISUAL.maxCameraDistance);
    if (immediate) this.radius = this.radiusTarget;
  }

  /** 鼠标拖拽环绕（无摄像头时的降级交互） */
  orbit(delta: number): void {
    this.phi += delta;
    this.autoRotate = false;
  }

  /** 滚轮推拉镜头 */
  zoomBy(delta: number): void {
    this.radiusTarget = THREE.MathUtils.clamp(
      this.radiusTarget + delta,
      VISUAL.minCameraDistance,
      VISUAL.maxCameraDistance,
    );
  }

  setMorph(shape: MorphShape): void {
    this.planet.setMorph(shape);
    // 仅恒星形态保留装饰轨道环，其余形态淡出，避免与主体结构混淆
    this.decorTarget = shape === 'sphere' ? 1 : 0;
  }

  setWarp(v: number): void {
    this.planet.setWarp(v);
  }

  setScale(v: number): void {
    this.planet.setScale(v);
  }

  pulse(strength = 1): void {
    this.planet.triggerPulse(strength);
  }

  private updateCameraPosition(): void {
    this.camera.position.set(
      this.radius * Math.sin(this.theta) * Math.sin(this.phi),
      this.radius * Math.cos(this.theta),
      this.radius * Math.sin(this.theta) * Math.cos(this.phi),
    );
    this.camera.lookAt(0, 0, 0);
  }

  telemetry(): SceneTelemetry {
    return {
      cameraDistance: this.radius,
      shape: this.planet.currentShape,
      warp: 0,
      fps: this.fps,
    };
  }

  private step = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.step);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    // FPS 统计
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // 相机：手势旋转 + 惯性推拉 + 空闲自转
    if (Math.abs(this.handRotation) > 0.05) {
      this.phi += this.handRotation * 0.06;
    } else if (this.autoRotate) {
      this.phi -= dt * 0.08;
    }

    this.zoomVelocity *= Math.pow(0.05, dt);
    this.radius += this.zoomVelocity;
    this.radius += (this.radiusTarget - this.radius) * dt * 0.8;
    this.radius = THREE.MathUtils.clamp(this.radius, VISUAL.minCameraDistance, VISUAL.maxCameraDistance);

    // 轻微俯仰摆动，避免完全水平的呆板视角
    this.theta = Math.PI / 2 + Math.sin(elapsed * 0.15) * 0.12;
    this.updateCameraPosition();

    // 场景动画
    this.planet.update(dt, elapsed);
    this.stars.update(elapsed);
    this.nebula.update(elapsed);

    // 只在自身盘面内自转：轴向固定，避免转到与视线共面时粒子叠成一条刺眼亮线
    this.ringA.rotation.y -= dt * 0.16;
    this.ringB.rotation.y += dt * 0.22;
    this.ringA.rotation.x = Math.PI / 3 + Math.sin(elapsed * 0.28) * 0.05;
    this.ringB.rotation.x = -Math.PI / 4.4 + Math.cos(elapsed * 0.22) * 0.04;

    // 装饰环淡入淡出
    this.decorFade += (this.decorTarget - this.decorFade) * Math.min(dt * 3, 1);
    (this.ringA.material as THREE.PointsMaterial).opacity = 0.55 * this.decorFade;
    (this.ringB.material as THREE.PointsMaterial).opacity = 0.55 * this.decorFade;
    const decorVisible = this.decorFade > 0.02;
    this.ringA.visible = decorVisible;
    this.ringB.visible = decorVisible;

    this.composer.render();
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.step();
  }

  stop(): void {
    this.running = false;
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.planet.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
