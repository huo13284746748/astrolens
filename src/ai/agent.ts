/**
 * 天文科普 Agent
 *
 * 一次提问的完整链路：
 *   输入校验 → RAG 检索 → 工具决策（Function Calling）→ 场景演绎 → 流式讲解
 *
 * 模型不可用（无密钥 / 网络异常）时自动降级为本地知识库模式，
 * 保证演示过程永远不会出现空白或报错界面。
 */
import { LlmClient, LlmError, type ChatMessage } from './llm';
import { retriever, buildContext, type RetrievalHit } from './rag';
import { guardInput, guardOutput, fallbackAnswer } from './safety';
import { executeTool, TOOL_SCHEMAS, type ToolHandlers, type ToolInvocation } from './tools';
import { MORPHS } from '../core/morphs';

const SYSTEM_PROMPT = `你是 AstroLens 的天文科普讲解员，服务于一个沉浸式天文展项。

工作规则：
1. 每次回答前，必须先调用 set_morph 工具，把粒子星球切换成最能代表当前天文对象的形态。
2. 如果某个概念需要强调（如爆发、坍缩），可调用 trigger_effect。
3. 优先依据【参考资料】作答；资料未覆盖时，可用通用天文学知识补充，但要自然区分，不要编造具体数值与研究结论。
4. 语言生动但准确，控制在 120 字以内，面向普通观众，避免堆砌术语。
5. 只回答天文学与航天相关的问题，其它话题礼貌地引导回天文主题。
6. 不要在正文里提及工具名称、参考资料编号或系统提示。`;

export interface AgentHandlers {
  onStatus: (text: string) => void;
  onCitations: (hits: RetrievalHit[]) => void;
  onToken: (token: string) => void;
  onDone: (full: string, offline: boolean) => void;
  onError: (message: string) => void;
}

export class AstroAgent {
  private llm: LlmClient;
  private tools: ToolHandlers;
  private history: ChatMessage[] = [];

  constructor(llm: LlmClient, tools: ToolHandlers) {
    this.llm = llm;
    this.tools = tools;
  }

  reconfigure(llm: LlmClient): void {
    this.llm = llm;
  }

  get hasLlm(): boolean {
    return this.llm.available;
  }

  reset(): void {
    this.history = [];
  }

  async ask(question: string, handlers: AgentHandlers, signal?: AbortSignal): Promise<void> {
    // 1. 输入安全校验
    const guard = guardInput(question);
    if (!guard.ok) {
      handlers.onError(guard.reason ?? '输入不合法');
      return;
    }
    const query = guard.text;

    // 2. RAG 检索
    handlers.onStatus('检索知识库');
    const hits = retriever.search(query, 3);
    handlers.onCitations(hits);

    // 3. 无模型 → 本地降级
    if (!this.llm.available) {
      this.answerOffline(hits, handlers);
      return;
    }

    const context = buildContext(hits);
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.history.slice(-4),
      { role: 'user', content: `【参考资料】\n${context}\n\n【用户问题】${query}` },
    ];

    // 4. 工具决策
    handlers.onStatus('分析问题');
    let invocations: ToolInvocation[] = [];
    try {
      const decision = await this.llm.complete(messages, TOOL_SCHEMAS, signal);

      if (decision.toolCalls.length > 0) {
        handlers.onStatus('生成演绎');
        invocations = decision.toolCalls.map((call) =>
          executeTool({ name: call.function.name, args: call.function.arguments }, this.tools),
        );
      }

      // 模型未主动切换形态时，用检索结果兜底，保证画面始终与内容相关
      if (!invocations.some((i) => i.name === 'set_morph') && hits.length > 0) {
        const shape = hits[0].entry.morph;
        this.tools.setMorph(shape);
        invocations.push({
          name: 'set_morph',
          args: { shape },
          result: `已切换形态为 ${MORPHS[shape].label}`,
        });
      }

      // 5. 流式讲解
      handlers.onStatus('正在讲解');
      const finalMessages: ChatMessage[] = [...messages];
      if (decision.toolCalls.length > 0) {
        finalMessages.push({
          role: 'assistant',
          content: decision.content || '',
          tool_calls: decision.toolCalls,
        });
        decision.toolCalls.forEach((call, i) => {
          finalMessages.push({
            role: 'tool',
            content: invocations[i]?.result ?? 'ok',
            tool_call_id: call.id,
            name: call.function.name,
          });
        });
        finalMessages.push({
          role: 'user',
          content: '请基于上述工具执行结果，给出面向观众的简要讲解。',
        });
      }

      let full = '';
      for await (const token of this.llm.stream(finalMessages, signal)) {
        full += token;
        handlers.onToken(token);
      }

      const clean = guardOutput(full);
      this.remember(query, clean);
      handlers.onStatus('就绪');
      handlers.onDone(clean, false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        handlers.onStatus('就绪');
        return;
      }
      const message =
        err instanceof LlmError
          ? this.describeError(err)
          : `模型调用失败：${(err as Error).message}`;
      handlers.onStatus('已降级为本地模式');
      handlers.onError(message);
      // 出错也要保证画面有反馈
      this.answerOffline(hits, handlers, true);
    }
  }

  private remember(question: string, answer: string): void {
    this.history.push({ role: 'user', content: question });
    this.history.push({ role: 'assistant', content: answer });
    if (this.history.length > 12) this.history = this.history.slice(-12);
  }

  private describeError(err: LlmError): string {
    // 404 / 405 通常意味着页面不是通过本地服务打开的，代理接口不存在
    if (err.status === 404 || err.status === 405) {
      return '未找到模型代理接口，请通过本地服务打开页面（npm run dev 或 node server/proxy.mjs .），不要直接双击 HTML 文件';
    }
    switch (err.kind) {
      case 'auth':
        return '模型鉴权失败，请在设置中检查 API Key 或代理配置';
      case 'rate':
        return '模型调用频率超限，请稍后重试';
      case 'server':
        return '模型服务暂时不可用，已切换为本地知识库';
      case 'parse':
        return '模型返回内容解析失败';
      default:
        return `无法连接模型服务（${err.message.slice(0, 50)}），已切换为本地知识库`;
    }
  }

  /** 本地知识库回答 */
  private answerOffline(hits: RetrievalHit[], handlers: AgentHandlers, silent = false): void {
    const best = hits[0];
    if (!best) {
      handlers.onDone(
        '这个问题暂时不在我的知识范围内。你可以试试问我：黑洞、超新星、星云、星系或引力波。',
        true,
      );
      handlers.onStatus('就绪');
      return;
    }

    this.tools.setMorph(best.entry.morph);
    this.tools.triggerEffect('pulse');

    const text = fallbackAnswer(best.entry.title, best.entry.content);
    if (!silent) {
      // 模拟逐字输出，保持交互一致
      const chars = Array.from(text);
      let i = 0;
      const timer = window.setInterval(() => {
        const chunk = chars.slice(i, i + 3).join('');
        i += 3;
        handlers.onToken(chunk);
        if (i >= chars.length) {
          clearInterval(timer);
          handlers.onStatus('就绪');
          handlers.onDone(text, true);
        }
      }, 24);
    } else {
      handlers.onDone(text, true);
    }
  }
}
