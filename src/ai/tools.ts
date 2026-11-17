/**
 * Agent 工具集
 *
 * 把「讲解」与「演绎」打通：大模型通过 Function Calling 调用这些工具，
 * 直接驱动 3D 场景的形态、镜头与特效，形成可解释的 AI → 画面闭环。
 */
import type { ToolSchema } from './llm';
import type { MorphShape } from '../core/morphs';

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'set_morph',
      description:
        '切换粒子星球的形态以匹配当前讲解的天文对象。必须在每次回答前调用一次。',
      parameters: {
        type: 'object',
        properties: {
          shape: {
            type: 'string',
            enum: ['sphere', 'blackhole', 'supernova', 'spiral', 'nebula', 'ring', 'vortex', 'ripple'],
            description:
              'sphere=恒星本体；blackhole=黑洞吸积盘；supernova=超新星爆发；spiral=涡旋星系；nebula=星云；ring=行星环；vortex=引力涡旋；ripple=时空涟漪（引力波）',
          },
          reason: {
            type: 'string',
            description: '一句话说明为什么选择这个形态',
          },
        },
        required: ['shape'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_camera',
      description: '调整观察镜头距离，用于突出细节或展现全貌。',
      parameters: {
        type: 'object',
        properties: {
          distance: {
            type: 'number',
            description: '镜头距离。默认 360，可用范围 140（最近）到 380（最远）；超过 380 画面主体会小到看不清，不要使用',
          },
        },
        required: ['distance'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trigger_effect',
      description: '触发一次视觉特效，用于强调关键概念。',
      parameters: {
        type: 'object',
        properties: {
          effect: {
            type: 'string',
            enum: ['pulse', 'warp_on', 'warp_off'],
            description: 'pulse=能量脉冲；warp_on=开启时空扭曲；warp_off=关闭时空扭曲',
          },
        },
        required: ['effect'],
      },
    },
  },
];

export interface ToolHandlers {
  setMorph: (shape: MorphShape) => void;
  setCamera: (distance: number) => void;
  triggerEffect: (effect: 'pulse' | 'warp_on' | 'warp_off') => void;
}

export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
  /** 回传给模型的结果 */
  result: string;
}

const VALID_SHAPES = new Set<MorphShape>([
  'sphere',
  'blackhole',
  'supernova',
  'spiral',
  'nebula',
  'ring',
  'vortex',
  'ripple',
]);

/** 执行一次工具调用，返回可读结果 */
export function executeTool(
  call: { name: string; args: string },
  handlers: ToolHandlers,
): ToolInvocation {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = call.args ? (JSON.parse(call.args) as Record<string, unknown>) : {};
  } catch {
    return { name: call.name, args: {}, result: '参数解析失败' };
  }

  switch (call.name) {
    case 'set_morph': {
      const shape = String(parsed.shape ?? '');
      if (!VALID_SHAPES.has(shape as MorphShape)) {
        return { name: call.name, args: parsed, result: `不支持的形态：${shape}` };
      }
      handlers.setMorph(shape as MorphShape);
      return { name: call.name, args: parsed, result: `已切换形态为 ${shape}` };
    }
    case 'set_camera': {
      const d = Number(parsed.distance);
      if (!Number.isFinite(d)) {
        return { name: call.name, args: parsed, result: '距离参数无效' };
      }
      handlers.setCamera(Math.min(380, Math.max(140, d)));
      return { name: call.name, args: parsed, result: `镜头距离已设为 ${d}` };
    }
    case 'trigger_effect': {
      const e = String(parsed.effect ?? '');
      if (e !== 'pulse' && e !== 'warp_on' && e !== 'warp_off') {
        return { name: call.name, args: parsed, result: `不支持的特效：${e}` };
      }
      handlers.triggerEffect(e);
      return { name: call.name, args: parsed, result: `已触发 ${e}` };
    }
    default:
      return { name: call.name, args: parsed, result: `未知工具：${call.name}` };
  }
}
