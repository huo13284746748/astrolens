/**
 * AI 安全与可控性
 *
 * 三道防线：
 *  1. 输入侧：长度限制、控制字符清洗、明显违规内容拦截
 *  2. 提示词侧：系统提示限定回答范围与输出格式
 *  3. 输出侧：长度截断、脚本注入清理、异常兜底
 */

export const MAX_INPUT_LENGTH = 500;
export const MAX_OUTPUT_LENGTH = 600;

export interface GuardResult {
  ok: boolean;
  text: string;
  reason?: string;
}

/** 明显违规的输入模式（演示用最小集合，可按需扩展） */
const BLOCKED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(制作|合成)(炸弹|毒药|爆炸物)/, reason: '涉及危险物品制作' },
  { re: /(自杀|自残)(方法|方式)/, reason: '涉及自伤内容' },
  { re: /<script|javascript:|onerror\s*=/i, reason: '包含可疑脚本代码' },
];

export function guardInput(raw: string): GuardResult {
  const text = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length === 0) {
    return { ok: false, text: '', reason: '请输入问题' };
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return {
      ok: false,
      text: text.slice(0, MAX_INPUT_LENGTH),
      reason: `问题过长，请控制在 ${MAX_INPUT_LENGTH} 字以内`,
    };
  }
  for (const p of BLOCKED_PATTERNS) {
    if (p.re.test(text)) {
      return { ok: false, text: '', reason: p.reason };
    }
  }
  return { ok: true, text };
}

/** 输出清理：去标签、限长、压缩空行 */
export function guardOutput(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_OUTPUT_LENGTH);
}

/** 模型不可用时的兜底话术 */
export function fallbackAnswer(title: string, content: string): string {
  return `【${title}】\n${content}\n\n（当前为本地知识库模式，未连接大模型）`;
}
