/**
 * 粒子星球
 *
 * - 使用自定义 ShaderMaterial：逐粒子色相 + 圆形软边 + 尺寸随距离衰减
 * - 形态切换采用「目标位置 + 阻尼插值」，过渡连续自然
 * - 支持呼吸脉动、扭曲强度、色相偏移等运行时参数
 */
import * as THREE from 'three';
import { VISUAL } from '../config';
import { MORPHS, morphTarget, type MorphShape } from './morphs';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aHue;
  attribute float aPhase;

  uniform float uPixelRatio;
  uniform float uHueShift;
  uniform float uTime;
  uniform float uWarp;

  varying float vHue;
  varying float vTwinkle;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // 尺寸随距离衰减；扭曲时整体放大
    float size = aSize * (1.0 + uWarp * 0.9);
    gl_PointSize = size * uPixelRatio * (260.0 / max(-mv.z, 1.0));

    // 呼吸闪烁
    float twinkle = 0.75 + 0.25 * sin(uTime * 2.2 + aPhase * 6.2831);
    vTwinkle = twinkle;

    gl_Position = projectionMatrix * mv;
    vHue = mod(aHue + uHueShift, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying float vHue;
  varying float vTwinkle;

  vec3 hsl2rgb(float h, float s, float l) {
    vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // 软边光点：中心亮、边缘柔和衰减
    float alpha = smoothstep(0.5, 0.0, d);
    alpha = pow(alpha, 2.4);

    vec3 col = hsl2rgb(vHue, 0.88, 0.62);
    // 中心提亮，制造泛光核心
    col += vec3(0.35) * smoothstep(0.18, 0.0, d);

    gl_FragColor = vec4(col, alpha * vTwinkle);
  }
`;

export class ParticlePlanet {
  readonly object: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private dirs: Float32Array;
  private seeds: Float32Array;
  private basePositions: Float32Array;
  private targetPositions: Float32Array;
  private currentPositions: Float32Array;
  private count: number;

  private shape: MorphShape = 'sphere';
  private hueShift = 0;
  private hueShiftTarget = 0;
  private warp = 0;
  private warpTarget = 0;
  private pulse = 0;
  private scale = 1;
  private scaleTarget = 1;

  constructor() {
    this.count = VISUAL.planetParticles;
    const n = this.count;

    this.dirs = new Float32Array(n * 3);
    this.seeds = new Float32Array(n * 3);
    this.basePositions = new Float32Array(n * 3);
    this.targetPositions = new Float32Array(n * 3);
    this.currentPositions = new Float32Array(n * 3);

    const sizes = new Float32Array(n);
    const hues = new Float32Array(n);
    const phases = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      // 球面均匀采样
      const u = Math.random();
      const v = Math.random();
      const theta = Math.PI * 2 * u;
      const phi = Math.acos(2 * v - 1);

      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta);
      const dz = Math.cos(phi);

      this.dirs[i * 3] = dx;
      this.dirs[i * 3 + 1] = dy;
      this.dirs[i * 3 + 2] = dz;

      const s1 = Math.random();
      const s2 = Math.random();
      const s3 = Math.random();
      this.seeds[i * 3] = s1;
      this.seeds[i * 3 + 1] = s2;
      this.seeds[i * 3 + 2] = s3;

      // 85% 分布在表面，15% 内部填充，让星球有体积感
      const r = Math.random() < 0.85 ? VISUAL.baseRadius : VISUAL.baseRadius * Math.cbrt(Math.random());

      this.basePositions[i * 3] = dx * r;
      this.basePositions[i * 3 + 1] = dy * r;
      this.basePositions[i * 3 + 2] = dz * r;

      this.currentPositions[i * 3] = dx * r;
      this.currentPositions[i * 3 + 1] = dy * r;
      this.currentPositions[i * 3 + 2] = dz * r;

      sizes[i] = 1.2 + Math.random() * 2.2;
      // 色相在主色附近抖动，形成层次
      hues[i] = (Math.random() - 0.5) * 0.08 + (Math.random() < 0.12 ? 0.5 : 0);
      phases[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uHueShift: { value: 0 },
        uTime: { value: 0 },
        uWarp: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;

    this.applyMorph('sphere');
  }

  /** 切换形态：重算目标位置 */
  setMorph(shape: MorphShape): void {
    if (shape === this.shape) return;
    this.shape = shape;
    this.applyMorph(shape);
    this.hueShiftTarget = MORPHS[shape].hue - MORPHS.sphere.hue;
  }

  get currentShape(): MorphShape {
    return this.shape;
  }

  private applyMorph(shape: MorphShape): void {
    const tmp: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.count; i++) {
      morphTarget(
        shape,
        [this.dirs[i * 3], this.dirs[i * 3 + 1], this.dirs[i * 3 + 2]],
        [this.seeds[i * 3], this.seeds[i * 3 + 1], this.seeds[i * 3 + 2]],
        VISUAL.baseRadius,
        tmp,
      );
      this.targetPositions[i * 3] = tmp[0];
      this.targetPositions[i * 3 + 1] = tmp[1];
      this.targetPositions[i * 3 + 2] = tmp[2];
    }
  }

  /** 触发一次脉冲（V 手势 / 知识点高亮） */
  triggerPulse(strength = 1): void {
    this.pulse = Math.max(this.pulse, strength);
  }

  setWarp(v: number): void {
    this.warpTarget = THREE.MathUtils.clamp(v, 0, 1);
  }

  setScale(v: number): void {
    this.scaleTarget = v;
  }

  update(dt: number, elapsed: number): void {
    // 参数缓动
    const k = 1 - Math.pow(0.001, dt);
    this.hueShift += (this.hueShiftTarget - this.hueShift) * k * 0.6;
    this.warp += (this.warpTarget - this.warp) * k * 0.5;
    this.scale += (this.scaleTarget - this.scale) * k * 0.5;
    this.pulse *= Math.pow(0.02, dt);

    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uHueShift.value = this.hueShift;
    this.material.uniforms.uWarp.value = this.warp;

    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;

    // 位置阻尼插值 + 呼吸 + 扭曲震荡
    const lerpK = 1 - Math.pow(0.0015, dt);
    const breathe = 1 + Math.sin(elapsed * 1.1) * 0.02 + this.pulse * 0.22;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const tx = this.targetPositions[i3];
      const ty = this.targetPositions[i3 + 1];
      const tz = this.targetPositions[i3 + 2];

      let cx = arr[i3] + (tx - arr[i3]) * lerpK;
      let cy = arr[i3 + 1] + (ty - arr[i3 + 1]) * lerpK;
      let cz = arr[i3 + 2] + (tz - arr[i3 + 2]) * lerpK;

      // 呼吸缩放
      cx *= breathe;
      cy *= breathe;
      cz *= breathe;

      // 扭曲：沿法线方向的高频震荡，模拟时空被搅动
      if (this.warp > 0.01) {
        const phase = this.seeds[i3 + 1] * 6.2831;
        const amp = this.warp * 9;
        const f = Math.sin(elapsed * 7 + phase * 3);
        const len = Math.hypot(cx, cy, cz) || 1;
        cx += (cx / len) * f * amp;
        cy += (cy / len) * f * amp;
        cz += (cz / len) * f * amp;
      }

      arr[i3] = cx;
      arr[i3 + 1] = cy;
      arr[i3 + 2] = cz;
    }

    pos.needsUpdate = true;
    this.object.scale.setScalar(this.scale);
    this.object.rotation.y += dt * 0.08;
  }

  setPixelRatio(ratio: number): void {
    this.material.uniforms.uPixelRatio.value = Math.min(ratio, 2);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
