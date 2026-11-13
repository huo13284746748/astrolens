/**
 * 深空环境：渐变天穹 + 远景星场 + 星云粒子
 */
import * as THREE from 'three';
import { VISUAL } from '../config';

/** 生成圆形柔光贴图，用于星点与星云 */
function createSoftDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 天穹：内侧渲染的渐变球，代替纯黑背景 */
export function createSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(2200, 32, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0a0418) },
      uBottom: { value: new THREE.Color(0x000006) },
      uAccent: { value: new THREE.Color(0x1b0a3a) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uAccent;
      varying vec3 vDir;

      void main() {
        float h = vDir.y * 0.5 + 0.5;
        vec3 col = mix(uBottom, uTop, pow(h, 1.4));
        // 沿银河带方向叠加一层紫蓝色调，制造不均匀感
        float band = exp(-pow((vDir.y - sin(vDir.x * 1.7) * 0.25) * 3.2, 2.0));
        col += uAccent * band * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export interface StarField {
  object: THREE.Points;
  update: (elapsed: number) => void;
}

/** 远景星场：球壳分布 + 尺寸闪烁 */
export function createStarField(): StarField {
  const n = VISUAL.starCount;
  const positions = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const phases = new Float32Array(n);
  const colors = new Float32Array(n * 3);

  const palette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xbfd4ff),
    new THREE.Color(0xffd9b3),
    new THREE.Color(0xa8c8ff),
  ];

  for (let i = 0; i < n; i++) {
    const r = 1100 + Math.random() * 700;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    sizes[i] = 6 + Math.random() * 16;
    phases[i] = Math.random() * Math.PI * 2;

    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: createSoftDotTexture() },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase);
        vAlpha = tw;
        gl_PointSize = aSize * uPixelRatio * tw;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const object = new THREE.Points(geo, mat);
  object.frustumCulled = false;

  return {
    object,
    update(elapsed: number) {
      mat.uniforms.uTime.value = elapsed;
      object.rotation.y = elapsed * 0.004;
    },
  };
}

export interface NebulaField {
  object: THREE.Points;
  update: (elapsed: number) => void;
}

/** 星云：多色大颗粒半透明云团 */
export function createNebulaField(): NebulaField {
  const n = VISUAL.nebulaCount;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);

  const palette = [
    new THREE.Color(0x6a3cff),
    new THREE.Color(0xff3c8a),
    new THREE.Color(0x2fa8ff),
    new THREE.Color(0x8affe0),
  ];

  for (let i = 0; i < n; i++) {
    // 三个团块，制造不均匀的星云结构
    const cluster = Math.floor(Math.random() * 3);
    const cx = [180, -220, 60][cluster];
    const cy = [-90, 120, 240][cluster];
    const cz = [-160, 200, -240][cluster];

    const spread = 130 + Math.random() * 110;
    positions[i * 3] = cx + (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = cy + (Math.random() - 0.5) * spread * 1.4;
    positions[i * 3 + 2] = cz + (Math.random() - 0.5) * spread * 2;

    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = 8 + Math.random() * 22;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: createSoftDotTexture() },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (120.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor, tex.a * 0.13);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const object = new THREE.Points(geo, mat);
  object.frustumCulled = false;

  return {
    object,
    update(elapsed: number) {
      object.rotation.y = elapsed * 0.006;
      object.rotation.x = Math.sin(elapsed * 0.12) * 0.08;
    },
  };
}
