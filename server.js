import { createServer } from 'http';
import { readFileSync, existsSync, watch, statSync, createReadStream, readdirSync, openSync, readSync, closeSync, writeFileSync as fsWriteFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.AGENT_OFFICE_PORT || 7777;
const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

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

// ── 세션 자동감지 (SessionScanner) ──
// ~/.claude/projects/ 디렉토리의 .jsonl 파일을 감시하여 활성 Claude CLI 세션을 자동 발견
const SCAN_INTERVAL = 5000;     // 5초마다 활성 세션 스캔
const ACTIVE_THRESHOLD = 30000; // 30초 이내 파일 수정 = 활성 세션
const discoveredSessions = new Map(); // transcriptPath → { sessionId, project, ... }
const projectWatchers = new Map();    // projectDir → watcher

function parseTranscriptFirstEntry(filePath) {
  // 파일의 첫 몇 줄을 읽어 세션 메타데이터 추출
  try {
    const fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const bytesRead = readSync(fd, buf, 0, 4096, 0);
    closeSync(fd);
    const text = buf.toString('utf8', 0, bytesRead);
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId && entry.type === 'user') {
          return {
            sessionId: entry.sessionId,
            cwd: entry.cwd || '',
            gitBranch: entry.gitBranch || '',
            version: entry.version || '',
            projectName: entry.cwd ? basename(entry.cwd) : '',
            projectPath: entry.cwd || '',
          };
        }
      } catch {}
    }
  } catch {}
  return null;
}

function scanActiveTranscripts() {
  if (!existsSync(PROJECTS_DIR)) return;
  try {
    const projectDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    const now = Date.now();
    const activeFiles = new Set();

    for (const dir of projectDirs) {
      const projPath = join(PROJECTS_DIR, dir.name);
      try {
        const files = readdirSync(projPath, { withFileTypes: true })
          .filter(f => f.isFile() && f.name.endsWith('.jsonl'));

        for (const file of files) {
          const fullPath = join(projPath, file.name);
          try {
            const stat = statSync(fullPath);
            const mtime = stat.mtimeMs;
            if (now - mtime < ACTIVE_THRESHOLD) {
              activeFiles.add(fullPath);
              if (!discoveredSessions.has(fullPath)) {
                const meta = parseTranscriptFirstEntry(fullPath);
                if (meta) {
                  discoveredSessions.set(fullPath, meta);
                  onSessionDiscovered(fullPath, meta);
                }
              }
            }
          } catch {}
        }
      } catch {}
    }

    // 비활성 세션 제거
    for (const [path, meta] of discoveredSessions) {
      if (!activeFiles.has(path)) {
        discoveredSessions.delete(path);
        // 세션은 기존 5분 타이머로 자연 정리됨
      }
    }
  } catch (e) {
    console.error('[SCANNER] 스캔 실패:', e.message);
  }
}

function onSessionDiscovered(transcriptPath, meta) {
  // 훅으로 이미 등록된 세션이면 트랜스크립트 감시만 추가
  const existingSession = sessions.get(meta.sessionId);
  if (existingSession) {
    startWatchingTranscript(meta.sessionId, transcriptPath);
    console.log(`[SCANNER] 기존 세션에 트랜스크립트 연결: ${meta.projectName} (${meta.sessionId.slice(0, 8)})`);
    return;
  }

  // 같은 프로젝트 경로로 이미 등록된 세션이 있으면 중복 생성 방지
  const normPath = (meta.projectPath || '').toLowerCase().replace(/\\/g, '/');
  for (const [sid, s] of sessions) {
    const sPath = (s.path || '').toLowerCase().replace(/\\/g, '/');
    if (sPath === normPath && sid !== meta.sessionId) {
      startWatchingTranscript(sid, transcriptPath);
      console.log(`[SCANNER] 동일 프로젝트 세션 병합: ${meta.projectName} (${sid.slice(0, 8)} ← ${meta.sessionId.slice(0, 8)})`);
      return;
    }
  }

  // 새 세션 생성
  const session = {
    id: meta.sessionId,
    name: meta.projectName || 'Unknown',
    path: meta.projectPath || '',
    lastActivity: Date.now(),
    discoveredByScanner: true,
  };
  sessions.set(meta.sessionId, session);
  startWatchingTranscript(meta.sessionId, transcriptPath);
  broadcast({ type: 'session_new', session });
  console.log(`[SCANNER] 새 세션 발견: ${session.name} (${meta.sessionId.slice(0, 8)}) branch:${meta.gitBranch}`);
}

function watchProjectDirs() {
  if (!existsSync(PROJECTS_DIR)) return;
  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of dirs) {
      const projPath = join(PROJECTS_DIR, dir.name);
      if (projectWatchers.has(projPath)) continue;
      try {
        const watcher = watch(projPath, (eventType, filename) => {
          if (filename && filename.endsWith('.jsonl')) {
            const fullPath = join(projPath, filename);
            if (!discoveredSessions.has(fullPath) && existsSync(fullPath)) {
              // mtime 체크 — 최근 활성 파일만 등록
              try {
                const stat = statSync(fullPath);
                if (Date.now() - stat.mtimeMs > ACTIVE_THRESHOLD) return;
              } catch { return; }
              const meta = parseTranscriptFirstEntry(fullPath);
              if (meta) {
                discoveredSessions.set(fullPath, meta);
                onSessionDiscovered(fullPath, meta);
              }
            }
          }
        });
        projectWatchers.set(projPath, watcher);
      } catch {}
    }
  } catch {}
}

function startSessionScanner() {
  console.log('[SCANNER] 세션 자동감지 시작...');
  // 초기 스캔
  scanActiveTranscripts();
  watchProjectDirs();
  // 주기적 스캔 (새 프로젝트 디렉토리 감지 + 활성 상태 확인)
  setInterval(() => {
    scanActiveTranscripts();
    watchProjectDirs();
  }, SCAN_INTERVAL);
}

// ── 세션 관리 ──
const sessions = new Map();

function getOrCreateSession(event) {
  const id = event.session_id || 'default';
  if (sessions.has(id)) {
    const session = sessions.get(id);
    session.lastActivity = Date.now();
    if (event.project_name) session.name = event.project_name;
    if (event.project_path) session.path = event.project_path;
    return session;
  }

  // 같은 프로젝트 경로의 기존 세션이 있으면 그쪽에 합류
  if (event.project_path) {
    const normPath = event.project_path.toLowerCase().replace(/\\/g, '/');
    for (const [, s] of sessions) {
      const sPath = (s.path || '').toLowerCase().replace(/\\/g, '/');
      if (sPath === normPath) {
        s.lastActivity = Date.now();
        if (event.project_name) s.name = event.project_name;
        return s;
      }
    }
  }

  // project_name 없는 이벤트로 새 세션 생성 방지 (Unknown 쓰레기 세션 차단)
  if (!event.project_name) {
    return null;
  }
  const session = {
    id,
    name: event.project_name,
    path: event.project_path || '',
    lastActivity: Date.now(),
  };
  sessions.set(id, session);
  broadcast({ type: 'session_new', session });
  console.log(`[SESSION] 새 세션: ${session.name} (${id})`);
  return session;
}

// 비활성 세션 정리 (5분)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
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
          newOffset += Buffer.byteLength(line, 'utf8') + (process.platform === 'win32' ? 2 : 1); // \r\n on Windows, \n on Unix
          if (!line.trim()) return;
          try {
            const entry = JSON.parse(line);
            const parsed = parseTranscriptEntry(entry);
            if (parsed) {
              // 트랜스크립트 활동 시 세션 lastActivity 갱신
              const sess = sessions.get(sessionId);
              if (sess) sess.lastActivity = Date.now();
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

// ── Multipart 파서 (파일 업로드용) ──
function parseMultipart(body, boundary) {
  const parts = [];
  const delimiter = Buffer.from(`--${boundary}`);
  const end = Buffer.from(`--${boundary}--`);

  let start = body.indexOf(delimiter) + delimiter.length + 2; // skip \r\n
  while (start < body.length) {
    let partEnd = body.indexOf(delimiter, start);
    if (partEnd === -1) break;
    const partData = body.subarray(start, partEnd - 2); // -2 for \r\n before delimiter

    const headerEnd = partData.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = partEnd + delimiter.length + 2; continue; }

    const headers = partData.subarray(0, headerEnd).toString();
    const content = partData.subarray(headerEnd + 4);
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    parts.push({
      filename: filenameMatch?.[1] || null,
      data: content,
      headers,
    });

    start = partEnd + delimiter.length;
    if (body.subarray(start, start + 2).toString() === '--') break; // end
    start += 2; // skip \r\n
  }
  return parts;
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
        if (!session) {
          // project_name 없는 이벤트 → 세션 생성 안 함, 무시
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true,"skipped":true}');
          return;
        }
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

  // 파일 업로드 (Windows DnD fallback)
  if (req.method === 'POST' && req.url === '/api/upload') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const boundary = req.headers['content-type']?.match(/boundary=(.+)/)?.[1];
        if (!boundary) { res.writeHead(400); res.end('{"error":"no boundary"}'); return; }

        const parts = parseMultipart(body, boundary);
        const uploadedPaths = [];

        for (const part of parts) {
          if (part.filename) {
            // 터미널의 cwd에 저장하거나 임시 디렉토리에 저장
            const uploadDir = join(tmpdir(), 'agent-office-uploads');
            if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
            const savePath = join(uploadDir, part.filename);
            fsWriteFileSync(savePath, part.data);
            uploadedPaths.push(savePath.replace(/\\/g, '/'));
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, paths: uploadedPaths }));
      } catch (e) {
        console.error('[UPLOAD] 실패:', e.message);
        res.writeHead(500);
        res.end('{"error":"upload failed"}');
      }
    });
    return;
  }

  // node_modules 정적 파일 (xterm)
  if (req.url.startsWith('/node_modules/')) {
    const nmPath = join(__dirname, req.url);
    const ext = req.url.split('.').pop();
    const mimeTypes = { js: 'application/javascript', css: 'text/css', mjs: 'application/javascript' };
    try {
      const content = readFileSync(nmPath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Not Found');
    }
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

// ── PTY 터미널 관리 ──
const terminals = new Map(); // id → { pty, clients: Set<ws> }

function createTerminal(id, cwd, cols = 120, rows = 30) {
  if (terminals.has(id)) return terminals.get(id);

  const shell = process.platform === 'win32'
    ? (process.env.COMSPEC || 'cmd.exe')
    : (process.env.SHELL || '/bin/zsh');
  // Claude Code 중첩 세션 방지: CLAUDECODE 환경변수 제거
  const ptyEnv = { ...process.env, TERM: 'xterm-256color' };
  delete ptyEnv.CLAUDECODE;
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols, rows,
    cwd: cwd || homedir(),
    env: ptyEnv,
  });

  const term = { pty: ptyProcess, clients: new Set(), id, owner: null };

  ptyProcess.onData((data) => {
    const msg = JSON.stringify({ type: 'terminal_output', id, data });
    for (const ws of term.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[TERMINAL] 종료: ${id} (code: ${exitCode})`);
    const msg = JSON.stringify({ type: 'terminal_exit', id, exitCode });
    for (const ws of term.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
    terminals.delete(id);
  });

  terminals.set(id, term);
  console.log(`[TERMINAL] 생성: ${id} (cwd: ${cwd || homedir()})`);
  return term;
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] 연결 (총 ${clients.size})`);

  // 현재 세션 목록 전송
  ws.send(JSON.stringify({
    type: 'init',
    sessions: [...sessions.values()],
    timestamp: Date.now(),
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'terminal_create': {
          const term = createTerminal(msg.id, msg.cwd, msg.cols, msg.rows);
          term.clients.add(ws);
          term.owner = ws; // 이 터미널을 만든 클라이언트 기록
          ws.send(JSON.stringify({ type: 'terminal_ready', id: msg.id }));
          break;
        }
        case 'terminal_input': {
          const term = terminals.get(msg.id);
          if (term) term.pty.write(msg.data);
          break;
        }
        case 'terminal_resize': {
          const term = terminals.get(msg.id);
          if (term) term.pty.resize(msg.cols, msg.rows);
          break;
        }
        case 'terminal_close': {
          const term = terminals.get(msg.id);
          if (term) {
            term.clients.delete(ws);
            if (term.clients.size === 0) {
              term.pty.kill();
              // terminals.delete는 onExit 콜백에서 처리
            }
          }
          break;
        }
      }
    } catch {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    // 이 클라이언트가 owner인 PTY만 종료 (모니터링 세션은 유지)
    for (const [id, term] of terminals) {
      term.clients.delete(ws);
      if (term.owner === ws) {
        console.log(`[TERMINAL] owner 연결 해제, 종료: ${id}`);
        term.pty.kill();
        // terminals.delete는 onExit 콜백에서 처리
      }
    }
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
  // 세션 자동감지 시작
  startSessionScanner();
});

// ── Graceful Shutdown ──
function shutdown() {
  console.log('\n[SHUTDOWN] 정리 시작...');
  // PTY 프로세스 전부 종료
  for (const [id, term] of terminals) {
    console.log(`[SHUTDOWN] PTY 종료: ${id}`);
    term.pty.kill();
  }
  terminals.clear();
  // 트랜스크립트 워쳐 정리
  for (const [id] of watchers) {
    stopWatchingTranscript(id);
  }
  // 프로젝트 디렉토리 워쳐 정리
  for (const [, w] of projectWatchers) {
    w.close();
  }
  projectWatchers.clear();
  // WebSocket 클라이언트 종료
  for (const ws of clients) {
    ws.close();
  }
  server.close(() => {
    console.log('[SHUTDOWN] 서버 종료 완료');
    process.exit(0);
  });
  // 3초 안에 안 끝나면 강제 종료
  setTimeout(() => process.exit(1), 3000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
