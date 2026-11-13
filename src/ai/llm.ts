/**
 * 大模型客户端（OpenAI 兼容协议）
 *
 * 两种调用方式：
 *  1. 代理模式（默认）：请求同源 /api/llm/*，由服务端注入密钥，浏览器不持有 key
 *  2. 直连模式：用户在设置面板填入自己的 key，直接请求厂商接口（仅本地调试用）
 */
import { LLM_TIMEOUT, type LlmConfig } from '../config';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly kind: 'network' | 'auth' | 'rate' | 'server' | 'parse' = 'network',
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

function classify(status: number): LlmError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status >= 500) return 'server';
  return 'network';
}

export class LlmClient {
  private cfg: LlmConfig;

  constructor(cfg: LlmConfig) {
    this.cfg = cfg;
  }

  reconfigure(cfg: LlmConfig): void {
    this.cfg = cfg;
  }

  /** 是否具备可用配置 */
  get available(): boolean {
    return this.cfg.useProxy || this.cfg.apiKey.trim().length > 0;
  }

  private endpoint(): string {
    if (this.cfg.useProxy) return '/api/llm/chat/completions';
    const base = this.cfg.baseUrl.replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!this.cfg.useProxy && this.cfg.apiKey) {
      h.Authorization = `Bearer ${this.cfg.apiKey}`;
    }
    return h;
  }

  private async request(body: unknown, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new LlmError(
          `模型服务返回 ${res.status}：${text.slice(0, 200)}`,
          res.status,
          classify(res.status),
        );
      }
      return res;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new LlmError('模型响应超时', undefined, 'network');
      }
      throw new LlmError(`无法连接模型服务：${(err as Error).message}`, undefined, 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** 非流式：用于工具调用决策 */
  async complete(
    messages: ChatMessage[],
    tools?: ToolSchema[],
    signal?: AbortSignal,
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages,
      temperature: 0.6,
      stream: false,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await this.request(body, signal);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }>;
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new LlmError('模型返回格式异常', undefined, 'parse');

    return {
      content: msg.content ?? '',
      toolCalls: msg.tool_calls ?? [],
    };
  }

  /** 流式：逐 token 产出文本 */
  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    const res = await this.request(
      {
        model: this.cfg.model,
        messages,
        temperature: 0.7,
        stream: true,
      },
      signal,
    );

    if (!res.body) throw new LlmError('响应体为空', undefined, 'parse');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') return;

          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // 忽略不完整分片
          }
        }
      }
    } finally {
      // 收到 [DONE] 后主动取消未读完的流，避免浏览器留下 net::ERR_ABORTED 记录
      try {
        await reader.cancel();
      } catch {
        /* 流已结束，忽略 */
      }
      reader.releaseLock();
    }
  }
}
