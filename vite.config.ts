import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

/** 从 .env 读取单个键值（不依赖 Vite 的 env 加载时机） */
function readEnv(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf-8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in result)) result[key] = value;
    }
  }
  return result;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * LLM 反向代理中间件
 *
 * 浏览器只访问同源 /api/llm/*，密钥在服务端读取并注入 Authorization 头，
 * 前端产物中不包含任何密钥。
 */
function llmProxyPlugin(root: string): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const env = { ...readEnv(root), ...process.env };
    const baseUrl = (env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
    const apiKey = env.LLM_API_KEY || '';

    // middleware 挂载点已被剥离，req.url 形如 /chat/completions
    const target = `${baseUrl}${req.url ?? ''}`;
    const body = await readBody(req);

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      });

      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      // 流式透传，保证前端逐字渲染
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `上游模型服务不可用：${(err as Error).message}` }));
    }
  };

  return {
    name: 'astrolens-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm', (req, res) => {
        void handle(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/llm', (req, res) => {
        void handle(req, res);
      });
    },
  };
}

export default defineConfig(() => {
  const root = process.cwd();

  return {
    plugins: [llmProxyPlugin(root)],
    server: {
      port: 5173,
      host: true,
    },
    preview: {
      port: 4173,
      host: true,
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            mediapipe: ['@mediapipe/tasks-vision'],
          },
        },
      },
    },
  };
});
