/**
 * 粒子形态定义
 *
 * 每种形态都是一个「位置生成函数」：给定粒子的单位方向向量与随机种子，
 * 输出目标坐标。切换形态时只重算目标位置，渲染循环用阻尼插值过渡，
 * 因此变形过程是连续的，不会出现瞬移。
 */

export type MorphShape =
  | 'sphere'
  | 'blackhole'
  | 'supernova'
  | 'spiral'
  | 'nebula'
  | 'ring'
  | 'vortex'
  | 'ripple';

export interface MorphMeta {
  key: MorphShape;
  label: string;
  /** 主题色（HSL 色相 0-1） */
  hue: number;
  desc: string;
}

export const MORPHS: Record<MorphShape, MorphMeta> = {
  sphere: { key: 'sphere', label: '恒星', hue: 0.06, desc: '球形恒星本体' },
  blackhole: { key: 'blackhole', label: '黑洞', hue: 0.72, desc: '扁平吸积盘与中心视界' },
  supernova: { key: 'supernova', label: '超新星', hue: 0.99, desc: '剧烈爆发、物质抛射' },
  spiral: { key: 'spiral', label: '涡旋星系', hue: 0.58, desc: '双臂旋涡结构' },
  nebula: { key: 'nebula', label: '星云', hue: 0.85, desc: '弥散气体云' },
  ring: { key: 'ring', label: '行星环', hue: 0.13, desc: '薄盘环系' },
  vortex: { key: 'vortex', label: '时空涡旋', hue: 0.48, desc: '引力扭曲的漏斗结构' },
  ripple: { key: 'ripple', label: '时空涟漪', hue: 0.52, desc: '同心波前的时空扰动' },
};

const TAU = Math.PI * 2;

/**
 * 计算单个粒子在指定形态下的目标位置
 * @param shape 形态
 * @param dir   原始单位方向向量
 * @param s     三个稳定随机种子（0-1）
 * @param baseR 基础半径
 */
export function morphTarget(
  shape: MorphShape,
  dir: [number, number, number],
  s: [number, number, number],
  baseR: number,
  out: [number, number, number],
): void {
  const [dx, dy, dz] = dir;
  const [s1, s2, s3] = s;

  switch (shape) {
    case 'sphere': {
      out[0] = dx * baseR;
      out[1] = dy * baseR;
      out[2] = dz * baseR;
      return;
    }

    case 'blackhole': {
      // 吸积盘：极薄、内缘锐利，中心彻底留空形成黑洞阴影；
      // 15% 的粒子压实为光子环，紧贴阴影边缘形成一圈亮边。
      // 盘面整体倾斜约 20°，避免默认视角下完全侧看的「一条线」
      const tilt = 0.34;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);

      let r: number;
      let ang: number;
      let h: number;

      if (s3 > 0.85) {
        // 光子环
        r = baseR * (1.02 + s1 * 0.05);
        ang = s1 * TAU;
        h = (s2 - 0.5) * baseR * 0.01;
      } else {
        // 盘面：半径向内侧聚集，越靠里越密、越亮
        const t = Math.pow(s1, 1.7);
        r = baseR * (1.06 + t * 1.5);
        ang = s2 * TAU + r * 0.02;
        h = (s3 - 0.5) * baseR * 0.03;
      }

      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      out[0] = px;
      out[1] = h * ct + pz * st;
      out[2] = pz * ct - h * st;
      return;
    }

    case 'supernova': {
      // 爆发：亮核 — 稀疏空腔 — 密集冲击波壳，三段密度差拉开层次
      let r: number;
      if (s3 < 0.12) {
        // 中心坍缩核
        r = baseR * (0.12 + s1 * 0.3);
      } else if (s3 < 0.45) {
        // 抛射介质：薄薄一层，留出空腔
        r = baseR * (0.55 + s1 * 0.6);
      } else {
        // 外缘冲击波：过半粒子压在这层薄壳上
        r = baseR * (2.05 + s1 * 0.28);
      }
      const jitter = 0.97 + s2 * 0.06;
      out[0] = dx * r * jitter;
      out[1] = dy * r * jitter * 0.8;
      out[2] = dz * r * jitter;
      return;
    }

    case 'spiral': {
      // 倾斜的旋涡星系：核球 + 盘面背景星 + 两条旋臂，三层叠加才有星系体积感
      const tilt = 0.55;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);

      let px: number;
      let pz: number;
      let h: number;

      if (s3 > 0.85) {
        // 核球：中心小球，比盘厚
        const pr = baseR * 0.5 * Math.cbrt(s1 + 0.001);
        out[0] = dx * pr;
        out[1] = dy * pr * 0.75;
        out[2] = dz * pr;
        return;
      } else if (s3 > 0.45) {
        // 盘面背景：指数盘，填满整个盘面
        const t = Math.pow(s1, 0.6);
        const r = baseR * (0.35 + t * 2.4);
        const ang = s2 * TAU;
        px = Math.cos(ang) * r;
        pz = Math.sin(ang) * r;
        h = (s3 - 0.5) * baseR * 0.1;
      } else {
        // 旋臂：两条较宽的臂
        const arm = s1 > 0.5 ? 0 : Math.PI;
        const t = s2;
        const r = baseR * (0.5 + t * 2.2);
        const ang = arm + t * 3.6 + (s3 - 0.5) * 0.55;
        px = Math.cos(ang) * r;
        pz = Math.sin(ang) * r;
        h = (s3 - 0.5) * baseR * 0.05;
      }

      out[0] = px;
      out[1] = h * ct + pz * st;
      out[2] = pz * ct - h * st;
      return;
    }

    case 'nebula': {
      // 弥散云团：大半径、各向随机
      const r = baseR * (2.0 + s1 * 3.2);
      const theta = s2 * TAU;
      const phi = Math.acos(2 * s3 - 1);
      const sp = Math.sin(phi);
      out[0] = r * sp * Math.cos(theta);
      out[1] = r * Math.cos(phi) * 0.7;
      out[2] = r * sp * Math.sin(theta);
      return;
    }

    case 'ring': {
      // 行星环：中心一颗球形行星，外侧薄环倾斜约 25°，
      // 避免环面正侧对镜头被压成一条亮线
      const tilt = 0.44;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);

      if (s3 > 0.78) {
        // 被环绕的行星本体
        const pr = baseR * 0.4;
        out[0] = dx * pr;
        out[1] = dy * pr;
        out[2] = dz * pr;
        return;
      }

      const t = s3 / 0.78;
      const r = baseR * (1.35 + t * 1.25);
      const ang = s2 * TAU;
      const h = (s1 - 0.5) * baseR * 0.05;

      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      out[0] = px;
      out[1] = h * ct + pz * st;
      out[2] = pz * ct - h * st;
      return;
    }

    case 'vortex': {
      // 漏斗涡旋：高度决定半径，角度随高度旋转
      const h = (s1 - 0.5) * baseR * 3.6;
      const r = baseR * 0.35 + Math.abs(h) * 0.55;
      const ang = s2 * TAU + h * 0.035;
      out[0] = Math.cos(ang) * r;
      out[1] = h;
      out[2] = Math.sin(ang) * r;
      return;
    }

    case 'ripple': {
      // 时空涟漪：中心致密天体 + 三圈向外扩散的同心波前
      const tilt = 0.5;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);

      if (s3 < 0.42) {
        // 中心致密天体
        const pr = baseR * 0.55 * Math.cbrt(s1 + 0.001);
        out[0] = dx * pr;
        out[1] = dy * pr;
        out[2] = dz * pr;
        return;
      }

      // 三道波前，越外越稀
      const band = s3 < 0.63 ? 1.15 : s3 < 0.83 ? 1.9 : 2.6;
      const r = baseR * (band + (s1 - 0.5) * 0.14);
      const ang = s2 * TAU;
      const h = (s2 - 0.5) * baseR * 0.03;

      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      out[0] = px;
      out[1] = h * ct + pz * st;
      out[2] = pz * ct - h * st;
      return;
    }
  }
}
