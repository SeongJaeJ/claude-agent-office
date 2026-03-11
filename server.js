import { createServer } from 'http';
import { readFileSync, existsSync, watch, statSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.AGENT_OFFICE_PORT || 7777;

// ── CLAUDE.md에서 에이전트 정의 파싱 ──
function parseAgentSection(content) {
  const result = { main: null, subagents: [] };
  const lines = content.split('\n');
  let currentTarget = null;
  let pastSeparator = false;

  for (const line of lines) {
    if (line.match(/###?\s*메인\s*에이전트/i)) {
      result.main = { role: '시니어 개발자', description: '메인 에이전트' };
      currentTarget = null; pastSeparator = false; continue;
    }
    if (line.match(/서브에이전트/i) && line.match(/^#{2,4}/)) {
      currentTarget = 'sub'; pastSeparator = false; continue;
    }
    if (line.match(/보조\s*역할/i) && line.match(/^#{2,4}/)) {
      currentTarget = null; pastSeparator = false; continue;
    }
    if (line.match(/^#{1,4}\s/) && currentTarget) {
      currentTarget = null; pastSeparator = false; continue;
    }
    if (!currentTarget) continue;
    if (line.match(/^\|[\s-|]+\|$/)) { pastSeparator = true; continue; }
    if (pastSeparator && line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) result.subagents.push({ role: cells[0], description: cells[1] });
      continue;
    }
    if (pastSeparator && !line.startsWith('|') && line.trim() !== '') {
      currentTarget = null; pastSeparator = false;
    }
  }
  return result;
}

function loadAgentConfig() {
  const searchPaths = [
    join(process.cwd(), 'CLAUDE.md'),
    join(process.cwd(), '.claude', 'CLAUDE.md'),
    join(homedir(), '.claude', 'CLAUDE.md'),
  ];
  const result = { main: null, subagents: [] };
  const seen = new Set();

  for (const p of searchPaths) {
    try {
      if (!existsSync(p)) continue;
      const parsed = parseAgentSection(readFileSync(p, 'utf8'));
      if (parsed.main && !result.main) result.main = parsed.main;
      for (const a of parsed.subagents) {
        const key = a.role.toLowerCase();
        if (!seen.has(key)) { seen.add(key); result.subagents.push(a); }
      }
      console.log(`[CONFIG] CLAUDE.md 로드: ${p}`);
    } catch (e) {
      console.error(`[CONFIG] 파싱 실패: ${p}`, e.message);
    }
  }
  if (!result.main) result.main = { role: '시니어 개발자', description: '메인 에이전트' };
  console.log(`[CONFIG] 서브에이전트 ${result.subagents.length}개 로드됨`);
  return result;
}

const agentConfig = loadAgentConfig();

// ── 세션 관리 ──
const sessions = new Map();

function getOrCreateSession(event) {
  const id = event.session_id || 'default';
  if (!sessions.has(id)) {
    const session = {
      id,
      name: event.project_name || 'Unknown',
      path: event.project_path || '',
      lastActivity: Date.now(),
    };
    sessions.set(id, session);
    // 새 세션 알림
    broadcast({ type: 'session_new', session });
    console.log(`[SESSION] 새 세션: ${session.name} (${id})`);
  }
  const session = sessions.get(id);
  session.lastActivity = Date.now();
  if (event.project_name) session.name = event.project_name;
  if (event.project_path) session.path = event.project_path;
  return session;
}

// 비활성 세션 정리 (30분)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.lastActivity < cutoff) {
      sessions.delete(id);
      stopWatchingTranscript(id);
      broadcast({ type: 'session_removed', session_id: id });
      console.log(`[SESSION] 정리: ${session.name} (${id})`);
    }
  }
}, 60 * 1000);

// ── 트랜스크립트 감시 ──
const watchers = new Map(); // session_id → { watcher, offset, path }

function startWatchingTranscript(sessionId, transcriptPath) {
  if (!transcriptPath || watchers.has(sessionId)) return;
  if (!existsSync(transcriptPath)) return;

  try {
    const stat = statSync(transcriptPath);
    let offset = stat.size; // 기존 내용 건너뛰고 새 줄만 읽기

    const watcher = watch(transcriptPath, (eventType) => {
      if (eventType !== 'change') return;
      try {
        const newStat = statSync(transcriptPath);
        if (newStat.size <= offset) return;

        const stream = createReadStream(transcriptPath, {
          start: offset, encoding: 'utf8',
        });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });

        let newOffset = offset;
        rl.on('line', (line) => {
          newOffset += Buffer.byteLength(line, 'utf8') + 1; // +1 for \n
          if (!line.trim()) return;
          try {
            const entry = JSON.parse(line);
            const parsed = parseTranscriptEntry(entry);
            if (parsed) {
              broadcast({
                type: 'transcript',
                session_id: sessionId,
                ...parsed,
                timestamp: Date.now(),
              });
            }
          } catch {}
        });
        rl.on('close', () => { offset = newOffset; });
      } catch {}
    });

    watchers.set(sessionId, { watcher, path: transcriptPath });
    console.log(`[TRANSCRIPT] 감시 시작: ${transcriptPath}`);
  } catch (e) {
    console.error(`[TRANSCRIPT] 감시 실패: ${transcriptPath}`, e.message);
  }
}

function stopWatchingTranscript(sessionId) {
  const entry = watchers.get(sessionId);
  if (entry) {
    entry.watcher.close();
    watchers.delete(sessionId);
    console.log(`[TRANSCRIPT] 감시 종료: ${sessionId}`);
  }
}

function parseTranscriptEntry(entry) {
  const entryType = entry.type;

  if (entryType === 'assistant') {
    const content = entry.message?.content;
    if (!Array.isArray(content)) return null;

    const parts = [];
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        parts.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({
          type: 'tool_use',
          tool: block.name,
          input: block.input,
        });
      }
    }
    if (parts.length === 0) return null;
    return { entry_type: 'assistant', parts };
  }

  if (entryType === 'user') {
    // 도구 결과 (tool_use_result)
    if (entry.toolUseResult) {
      const result = entry.toolUseResult;
      let text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (Array.isArray(result)) {
        text = result
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
      }
      return { entry_type: 'tool_result', text: text.substring(0, 2000) };
    }
    // 사용자 입력
    const content = entry.message?.content;
    if (typeof content === 'string') {
      return { entry_type: 'user', text: content };
    }
    if (Array.isArray(content)) {
      const text = content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      if (text) return { entry_type: 'user', text };
    }
    return null;
  }

  return null;
}

// ── HTTP 서버 ──
const server = createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 에이전트 설정 API
  if (req.method === 'GET' && req.url === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agentConfig));
    return;
  }

  // 세션 목록 API
  if (req.method === 'GET' && req.url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([...sessions.values()]));
    return;
  }

  // Hook 이벤트 수신
  if (req.method === 'POST' && req.url === '/hooks') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        const session = getOrCreateSession(event);
        console.log(`[HOOK] [${session.name}] ${event.hook_event_name} → ${event.tool_name || ''}`);
        // 트랜스크립트 경로가 있으면 감시 시작
        if (event.transcript_path) {
          startWatchingTranscript(session.id, event.transcript_path);
        }
        broadcast({
          type: 'hook',
          session_id: session.id,
          ...event,
          timestamp: Date.now(),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        console.error('[HOOK] 파싱 실패:', e.message);
        res.writeHead(400);
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  // 정적 파일 서빙
  let filePath = req.url === '/' ? '/index.html' : req.url;
  const fullPath = join(__dirname, 'public', filePath);
  const ext = filePath.split('.').pop();
  const mimeTypes = {
    html: 'text/html; charset=utf-8',
    js: 'application/javascript',
    css: 'text/css',
    png: 'image/png',
    json: 'application/json',
  };

  try {
    const content = readFileSync(fullPath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// ── WebSocket ──
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] 연결 (총 ${clients.size})`);

  // 현재 세션 목록 전송
  ws.send(JSON.stringify({
    type: 'init',
    sessions: [...sessions.values()],
    timestamp: Date.now(),
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] 해제 (총 ${clients.size})`);
  });
});

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║       AGENT OFFICE SERVER             ║');
  console.log(`  ║       http://localhost:${PORT}             ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
