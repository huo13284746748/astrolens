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
  | 'vortex';

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
      // 吸积盘：扁平圆盘 + 螺旋扭曲，中心留空
      const r = baseR * (1.3 + s1 * 1.6);
      const ang = s2 * TAU + r * 0.02;
      const thin = (s3 - 0.5) * baseR * 0.06;
      out[0] = Math.cos(ang) * r;
      out[1] = thin;
      out[2] = Math.sin(ang) * r;
      return;
    }

    case 'supernova': {
      // 爆发：沿方向向外抛射，距离随机
      const r = baseR * (1.4 + s1 * s1 * 4.2);
      const jitter = 0.85 + s2 * 0.3;
      out[0] = dx * r * jitter;
      out[1] = dy * r * jitter * 0.75;
      out[2] = dz * r * jitter;
      return;
    }

    case 'spiral': {
      // 双臂旋涡：半径线性增长，角度随半径累积
      const arm = s1 > 0.5 ? 0 : Math.PI;
      const t = s2;
      const r = baseR * (0.25 + t * 2.6);
      const ang = arm + t * 3.4 + (s3 - 0.5) * 0.55;
      out[0] = Math.cos(ang) * r;
      out[1] = (s3 - 0.5) * baseR * 0.16;
      out[2] = Math.sin(ang) * r;
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
      // 薄盘环
      const r = baseR * (1.4 + s1 * 1.3);
      const ang = s2 * TAU;
      out[0] = Math.cos(ang) * r;
      out[1] = (s3 - 0.5) * baseR * 0.04;
      out[2] = Math.sin(ang) * r;
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
  }
}
