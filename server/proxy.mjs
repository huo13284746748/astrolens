/**
 * 生产演示服务器
 *
 * 同时承担两件事：
 *   1. 托管 `dist/` 下的前端静态产物
 *   2. 反向代理 `/api/llm/*` 到真实模型服务，密钥只存在于服务端环境变量
 *
 * 用法：
 *   npm run build
 *   LLM_BASE_URL=... LLM_API_KEY=... node server/proxy.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 可通过命令行参数或环境变量指定要托管的目录，默认为构建产物 dist
const DIST = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.SERVE_DIR
    ? path.resolve(process.env.SERVE_DIR)
    : path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 8080);

/** 读取项目根目录的 .env，避免每次手动传环境变量 */
function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  const result = {};
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return result;
}

const dotEnv = loadDotEnv();
const LLM_BASE_URL = process.env.LLM_BASE_URL || dotEnv.LLM_BASE_URL || 'https://api.deepseek.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY || dotEnv.LLM_API_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** 转发 LLM 请求，注入密钥 */
async function proxyLlm(req, res) {
  const targetUrl = LLM_BASE_URL.replace(/\/+$/, '') + req.url.replace(/^\/api\/llm/, '');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });

    if (!upstream.body) {
      res.end();
      return;
    }
    // 流式透传，保证前端可逐字渲染
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `上游模型服务不可用：${err.message}` }));
  }
}

/** 静态文件服务，带 SPA 回退 */
function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST, safePath);

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/llm')) {
    void proxyLlm(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`AstroLens 演示服务器已启动: http://localhost:${PORT}`);
  console.log(`LLM 代理目标: ${LLM_BASE_URL}${LLM_API_KEY ? '（已注入密钥）' : '（未配置密钥，前端将降级为本地模式）'}`);
});
