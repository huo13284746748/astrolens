/**
 * 全局配置与运行时设置
 * - 大模型配置默认从环境变量读取（.env），不在仓库中硬编码密钥
 * - 用户也可在设置面板中覆写，仅保存在本地 localStorage
 */

export interface LlmConfig {
  /** OpenAI 兼容协议的 baseURL，例如 https://api.deepseek.com/v1 */
  baseUrl: string;
  /** API Key。留空则使用服务端代理（推荐），浏览器内不持有密钥 */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 是否经由本地/服务端代理转发（推荐开启，避免密钥暴露） */
  useProxy: boolean;
}

const STORAGE_KEY = 'astrolens.llm';

const env = import.meta.env;

const DEFAULT_LLM: LlmConfig = {
  baseUrl: (env.VITE_LLM_BASE_URL as string) || 'https://api.deepseek.com/v1',
  apiKey: (env.VITE_LLM_API_KEY as string) || '',
  model: (env.VITE_LLM_MODEL as string) || 'deepseek-chat',
  // 只要没在浏览器里填 key，就走代理
  useProxy: !(env.VITE_LLM_API_KEY as string),
};

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM };
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    return { ...DEFAULT_LLM, ...parsed };
  } catch {
    return { ...DEFAULT_LLM };
  }
}

export function saveLlmConfig(cfg: LlmConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 视觉与交互参数 */
export const VISUAL = {
  planetParticles: 9000,
  ringParticles: 4200,
  starCount: 2600,
  nebulaCount: 5000,
  baseRadius: 50,
  minCameraDistance: 120,
  maxCameraDistance: 460,
  defaultCameraDistance: 360,
} as const;

/** 请求超时（毫秒）。流式生成较慢，留足 60 秒 */
export const LLM_TIMEOUT = 60000;
