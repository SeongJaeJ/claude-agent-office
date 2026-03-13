import { createServer } from 'http';
import { readFileSync, existsSync, watch, statSync, createReadStream, writeFileSync as fsWriteFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname, basename } from 'path';
import { tmpdir, homedir } from 'os';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pty from 'node-pty';

const execFileAsync = promisify(execFile);

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

// ── 프로세스 기반 세션 스캐너 ──
// 1. ps로 Claude 프로세스 발견
// 2. lsof로 열린 .jsonl 파일 → 세션 UUID 식별
// 3. lsof -d cwd로 작업 디렉토리 → 탭 네이밍
// 4. PTY 자손 여부 확인 → 인터랙티브 탭 연동
const SCAN_INTERVAL = 5000;
const knownPids = new Map(); // pid → { sessionId, cwd, name, transcriptPath, isInteractive }

function normalizePath(p) {
  return (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
}

async function scanClaudeProcesses() {
  try {
    // 1단계: 현재 사용자의 프로세스 트리 조회 (비동기, -u로 현재 사용자만)
    const { stdout: psOutput } = await execFileAsync('ps', ['-xo', 'pid=,ppid=,command='], {
      timeout: 3000, maxBuffer: 10 * 1024 * 1024,
    });

    const parentOf = new Map();
    const claudePids = [];

    for (const line of psOutput.trim().split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = parseInt(match[1]);
      const ppid = parseInt(match[2]);
      const cmd = match[3];
      parentOf.set(pid, ppid);

      // Claude Code 프로세스: 독립 실행 파일명이 claude인 경우만
      if (/(?:\/|^|\s)claude(?:\s|$)/i.test(cmd)) {
        claudePids.push(pid);
      }
    }

    if (claudePids.length === 0) {
      handleDisappearedProcesses(new Set());
      return;
    }

    // 2단계: PTY 자손 여부 판별
    const ptyPids = new Set();
    for (const [, term] of terminals) {
      if (term.pty.pid) ptyPids.add(term.pty.pid);
    }

    function isDescendantOfPty(pid) {
      let cur = pid;
      const visited = new Set();
      while (cur && !visited.has(cur)) {
        if (ptyPids.has(cur)) return true;
        visited.add(cur);
        cur = parentOf.get(cur);
      }
      return false;
    }

    // 3단계: 신규 PID만 lsof 조회 (기존 PID는 캐시 사용)
    const newPids = claudePids.filter(pid => !knownPids.has(pid));
    const processInfo = new Map(); // pid → { cwd, jsonlFiles: [] }

    // 기존 PID는 활성 여부만 확인, lsof 스킵
    for (const pid of claudePids) {
      if (knownPids.has(pid)) {
        const known = knownPids.get(pid);
        processInfo.set(pid, { cwd: known.cwd, jsonlFiles: [known.transcriptPath] });
      }
    }

    // 신규 PID만 lsof 배치 호출
    if (newPids.length > 0) {
      const pidList = newPids.join(',');
      let lsofOutput = '';
      try {
        const { stdout } = await execFileAsync(
          'lsof', ['-p', pidList, '-F', 'pfn'],
          { timeout: 5000, maxBuffer: 5 * 1024 * 1024 },
        );
        lsofOutput = stdout;
      } catch (e) {
        if (e.stdout) lsofOutput = e.stdout;
        else console.error('[SCANNER] lsof 실패:', e.message);
      }

      // lsof 출력 파싱: p<pid>, f<fd>, n<name>
      let currentPid = null;
      let currentFd = null;

      for (const line of lsofOutput.split('\n')) {
        if (line.startsWith('p')) {
          currentPid = parseInt(line.slice(1));
          if (!processInfo.has(currentPid)) {
            processInfo.set(currentPid, { cwd: null, jsonlFiles: [] });
          }
        } else if (line.startsWith('f')) {
          currentFd = line.slice(1);
        } else if (line.startsWith('n') && currentPid) {
          const name = line.slice(1);
          const info = processInfo.get(currentPid);
          if (currentFd === 'cwd') {
            info.cwd = name;
          } else if (name.endsWith('.jsonl') && name.includes('.claude/projects/')) {
            info.jsonlFiles.push(name);
          }
        }
      }
    }

    // 4단계: 세션 생성/업데이트
    const activePids = new Set();

    for (const pid of claudePids) {
      const info = processInfo.get(pid);
      if (!info || !info.cwd) continue;

      // .jsonl 파일에서 세션 UUID 추출 (파일명이 UUID.jsonl)
      const jsonlFile = info.jsonlFiles[0]; // 가장 첫 번째 .jsonl
      if (!jsonlFile) continue;

      const jsonlBasename = basename(jsonlFile, '.jsonl');
      const sessionId = jsonlBasename; // UUID가 세션 ID
      const projectName = basename(info.cwd);
      const isInteractive = ptyPids.size > 0 && isDescendantOfPty(pid);

      activePids.add(pid);

      // 이미 추적 중인 프로세스
      if (knownPids.has(pid)) {
        const known = knownPids.get(pid);
        // 세션 lastActivity 갱신
        const session = sessions.get(known.sessionId);
        if (session) session.lastActivity = Date.now();
        continue;
      }

      // 신규 Claude 프로세스 발견
      knownPids.set(pid, {
        sessionId,
        cwd: info.cwd,
        name: projectName,
        transcriptPath: jsonlFile,
        isInteractive,
      });

      if (isInteractive) {
        // 인터랙티브 세션: 클라이언트에서 자체 관리, 서버는 ID만 기록
        interactiveSessionIds.add(sessionId);
        console.log(`[SCANNER] interactive Claude 발견: ${projectName} (PID:${pid}, ${sessionId.slice(0, 8)})`);

        // 이 세션이 이미 모니터링 탭으로 생성됐으면 제거
        if (sessions.has(sessionId) && sessions.get(sessionId).discoveredByScanner) {
          sessions.delete(sessionId);
          stopWatchingTranscript(sessionId);
          broadcast({ type: 'session_removed', session_id: sessionId });
          console.log(`[SCANNER] 모니터링 탭 → interactive 전환: ${projectName}`);
        }
      } else {
        // 외부 Claude: 모니터링 세션 생성
        // 같은 cwd의 기존 세션이 있으면 합류 (Claude 재시작 시 UUID 변경 대응)
        let targetSid = sessionId;
        const normCwd = normalizePath(info.cwd);
        for (const [sid, s] of sessions) {
          if (sid !== sessionId && normalizePath(s.path) === normCwd) {
            targetSid = sid;
            s.lastActivity = Date.now();
            s.name = projectName;
            break;
          }
        }

        if (!sessions.has(targetSid)) {
          const session = {
            id: targetSid,
            name: projectName,
            path: info.cwd,
            lastActivity: Date.now(),
            discoveredByScanner: true,
          };
          sessions.set(targetSid, session);
          broadcast({ type: 'session_new', session });
          console.log(`[SCANNER] 외부 Claude 발견: ${projectName} (PID:${pid}, ${sessionId.slice(0, 8)})`);
        }
        // 트랜스크립트 감시 시작 (새 .jsonl도 감시 등록)
        startWatchingTranscript(targetSid, jsonlFile);
      }
    }

    handleDisappearedProcesses(activePids);
  } catch (e) {
    console.error('[SCANNER] 프로세스 스캔 실패:', e.message);
  }
}

function handleDisappearedProcesses(activePids) {
  // 사라진 프로세스 정리
  for (const [pid, info] of knownPids) {
    if (!activePids.has(pid)) {
      knownPids.delete(pid);
      console.log(`[SCANNER] Claude 프로세스 종료: ${info.name} (PID:${pid})`);
      // 세션은 5분 비활성 타이머로 자연 정리 (즉시 제거하지 않음 — 로그 유지)
    }
  }
}

function startSessionScanner() {
  console.log('[SCANNER] 프로세스 기반 세션 스캐너 시작...');
  scanClaudeProcesses().catch(e => console.error('[SCANNER]', e));
  setInterval(() => scanClaudeProcesses().catch(e => console.error('[SCANNER]', e)), SCAN_INTERVAL);
}

// ── 세션 관리 ──
const sessions = new Map();
const interactiveSessionIds = new Set(); // Agent Office 터미널에서 실행된 Claude 세션 ID

function getOrCreateSession(event) {
  const id = event.session_id || 'default';
  // interactive 마킹을 세션 생성 전에 먼저 처리 (race condition 방지)
  if (event.agent_office_term_id) {
    interactiveSessionIds.add(id);
  }
  if (sessions.has(id)) {
    const session = sessions.get(id);
    session.lastActivity = Date.now();
    if (event.project_name) session.name = event.project_name;
    if (event.project_path) session.path = event.project_path;
    return session;
  }

  // 같은 프로젝트 경로의 기존 세션이 있으면 그쪽에 합류
  if (event.project_path) {
    const normPath = normalizePath(event.project_path);
    for (const [, s] of sessions) {
      if (normalizePath(s.path) === normPath) {
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
  // interactive 세션은 클라이언트에서 자체 관리하므로 broadcast 하지 않음
  if (!interactiveSessionIds.has(id)) {
    broadcast({ type: 'session_new', session });
  }
  console.log(`[SESSION] 새 세션: ${session.name} (${id})${interactiveSessionIds.has(id) ? ' (interactive)' : ''}`);
  return session;
}

// 비활성 세션 정리 (5분)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.lastActivity < cutoff) {
      sessions.delete(id);
      interactiveSessionIds.delete(id);
      stopWatchingTranscript(id);
      // knownPids에서도 해당 세션 정리 (좀비 방지)
      for (const [pid, info] of knownPids) {
        if (info.sessionId === id) knownPids.delete(pid);
      }
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

  // 세션 목록 API (interactive 세션 제외 — 클라이언트에서 자체 관리)
  if (req.method === 'GET' && req.url === '/api/sessions') {
    const filtered = [...sessions.values()].filter(s => !interactiveSessionIds.has(s.id));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(filtered));
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
        // agent_office_term_id 마킹은 getOrCreateSession에서 이미 처리됨
        console.log(`[HOOK] [${session.name}] ${event.hook_event_name} → ${event.tool_name || ''}${event.agent_office_term_id ? ' (interactive)' : ''}`);
        // 트랜스크립트 경로가 있으면 감시 시작
        if (event.transcript_path) {
          startWatchingTranscript(session.id, event.transcript_path);
        }
        broadcast({
          ...event,
          type: 'hook',
          session_id: session.id,
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

  // 정적 파일 서빙 — dist/(빌드 결과) 우선, public/ fallback
  let filePath = req.url === '/' ? '/index.html' : req.url;
  const distPath = join(__dirname, 'dist', filePath);
  const pubPath = join(__dirname, 'public', filePath);
  const fullPath = existsSync(distPath) ? distPath : pubPath;
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
  // Agent Office 터미널 마커: 훅/스캐너가 interactive 세션을 구분하도록
  const ptyEnv = { ...process.env, TERM: 'xterm-256color', AGENT_OFFICE_TERM_ID: id };
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

  // 현재 세션 목록 전송 (interactive 세션 제외)
  const initSessions = [...sessions.values()].filter(s => !interactiveSessionIds.has(s.id));
  ws.send(JSON.stringify({
    type: 'init',
    sessions: initSessions,
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
