/**
 * 轻量级 RAG 检索器
 *
 * 设计取舍：赛项强调 RAG 架构，但引入向量数据库 + Embedding API 会带来
 * 额外的网络依赖与成本。这里采用「中文二元组 + TF-IDF + 余弦相似度」的
 * 稀疏检索方案，完全在浏览器内完成，零延迟、零成本、可离线运行，
 * 并在回答中回传命中来源，满足可解释性要求。
 */
import { KNOWLEDGE, type KnowledgeEntry } from './knowledge';

export interface RetrievalHit {
  entry: KnowledgeEntry;
  score: number;
}

const STOP_BIGRAMS = new Set([
  '什么', '是什', '么是', '怎么', '如何', '为什', '哪些', '可以', '有没', '没有',
  '介绍', '一下', '为什', '这个', '那个', '告诉', '我想', '知道', '请问',
]);

/** 中文按二元组切分，英文按单词切分，统一小写 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();

  // 英文单词与数字
  for (const m of lower.matchAll(/[a-z0-9]+/g)) tokens.push(m[0]);

  // 中文连续片段 → 二元组（比单字更能表达语义）
  for (const m of lower.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const seg = m[0];
    if (seg.length === 1) {
      tokens.push(seg);
      continue;
    }
    for (let i = 0; i < seg.length - 1; i++) {
      const bg = seg.slice(i, i + 2);
      if (!STOP_BIGRAMS.has(bg)) tokens.push(bg);
    }
  }
  return tokens;
}

interface IndexedDoc {
  entry: KnowledgeEntry;
  tf: Map<string, number>;
  norm: number;
}

export class Retriever {
  private docs: IndexedDoc[] = [];
  private idf = new Map<string, number>();

  constructor(entries: KnowledgeEntry[] = KNOWLEDGE) {
    const docTokens: string[][] = entries.map((e) =>
      tokenize([e.title, ...e.aliases, e.content].join(' ')),
    );

    // 计算 IDF
    const df = new Map<string, number>();
    for (const toks of docTokens) {
      for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const N = entries.length;
    for (const [t, d] of df) this.idf.set(t, Math.log((N + 1) / (d + 0.5)) + 1);

    // 构建 TF-IDF 向量
    this.docs = entries.map((entry, i) => {
      const tf = new Map<string, number>();
      for (const t of docTokens[i]) tf.set(t, (tf.get(t) ?? 0) + 1);
      let sum = 0;
      for (const [t, v] of tf) {
        const w = v * (this.idf.get(t) ?? 1);
        sum += w * w;
      }
      return { entry, tf, norm: Math.sqrt(sum) || 1 };
    });
  }

  /** 检索最相关的 topK 条知识 */
  search(query: string, topK = 3): RetrievalHit[] {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];

    const qTf = new Map<string, number>();
    for (const t of qTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);

    let qNorm = 0;
    const qVec = new Map<string, number>();
    for (const [t, v] of qTf) {
      const w = v * (this.idf.get(t) ?? 1);
      qVec.set(t, w);
      qNorm += w * w;
    }
    qNorm = Math.sqrt(qNorm) || 1;

    const hits: RetrievalHit[] = [];
    for (const doc of this.docs) {
      let dot = 0;
      for (const [t, w] of qVec) {
        const dw = doc.tf.get(t);
        if (dw) dot += w * dw * (this.idf.get(t) ?? 1);
      }
      const score = dot / (qNorm * doc.norm);

      // 标题精确命中给予额外加权，避免长文本淹没核心词
      const titleBoost = query.includes(doc.entry.title) ? 0.35 : 0;
      const aliasBoost = doc.entry.aliases.some((a) => a.length > 1 && query.includes(a)) ? 0.25 : 0;

      hits.push({ entry: doc.entry, score: score + titleBoost + aliasBoost });
    }

    return hits
      .filter((h) => h.score > 0.02)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

export const retriever = new Retriever();

/** 将检索结果拼装为提示词上下文 */
export function buildContext(hits: RetrievalHit[]): string {
  if (hits.length === 0) return '（本地知识库未检索到直接相关内容，请基于通用天文学知识回答）';
  return hits
    .map((h, i) => `[资料${i + 1}] ${h.entry.title}\n${h.entry.content}`)
    .join('\n\n');
}
