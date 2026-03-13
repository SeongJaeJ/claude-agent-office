#!/usr/bin/env node
// Agent Office CLI
// 사용법: agent-office [start|setup|uninstall|help]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const command = process.argv[2] || 'start';
const PORT = process.env.AGENT_OFFICE_PORT || 7777;

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop'];
const HOOK_MARKER = 'agent-office-hook';

// ── 유틸 ──
function getSettingsPath() {
  return join(homedir(), '.claude', 'settings.json');
}

function isSetup() {
  const p = getSettingsPath();
  if (!existsSync(p)) return false;
  try {
    const s = JSON.parse(readFileSync(p, 'utf8'));
    return HOOK_EVENTS.some(e =>
      s.hooks?.[e]?.some(h => h.hooks?.some(hk => hk.command?.includes(HOOK_MARKER)))
    );
  } catch { return false; }
}

// ── setup: 글로벌 hooks 설정 ──
function setup() {
  const p = getSettingsPath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let settings = {};
  if (existsSync(p)) {
    try { settings = JSON.parse(readFileSync(p, 'utf8')); } catch {}
  }
  if (!settings.hooks) settings.hooks = {};

  for (const event of HOOK_EVENTS) {
    // 기존 agent-office 훅 제거
    const filtered = (settings.hooks[event] || []).filter(h =>
      !h.hooks?.some(hk => hk.command?.includes(HOOK_MARKER))
    );
    // 새 훅 추가
    filtered.push({
      matcher: '',
      hooks: [{
        type: 'command',
        command: HOOK_MARKER,
        timeout: 3,
      }],
    });
    settings.hooks[event] = filtered;
  }

  writeFileSync(p, JSON.stringify(settings, null, 2));
  console.log('');
  console.log('  ✓ Claude Code hooks 설정 완료');
  console.log(`    경로: ${p}`);
  console.log('');
  console.log('  ※ 이미 실행 중인 Claude CLI는 재시작해야 hooks가 적용됩니다.');
  console.log('');
}

// ── uninstall: hooks 제거 ──
function uninstall() {
  const p = getSettingsPath();
  if (!existsSync(p)) { console.log('  설정 파일 없음'); return; }

  const settings = JSON.parse(readFileSync(p, 'utf8'));
  if (!settings.hooks) { console.log('  hooks 없음'); return; }

  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = (settings.hooks[event] || []).filter(h =>
      !h.hooks?.some(hk => hk.command?.includes(HOOK_MARKER))
    );
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;

  writeFileSync(p, JSON.stringify(settings, null, 2));
  console.log('');
  console.log('  ✓ Agent Office hooks 제거 완료');
  console.log('');
}

// ── start: 서버 시작 ──
async function start() {
  // hooks 미설정 시 자동 설정
  if (!isSetup()) {
    console.log('');
    console.log('  [초기 설정] Claude Code hooks 자동 구성 중...');
    setup();
  }

  // dist/ 빌드 확인 — 없으면 자동 빌드
  const distIndex = join(__dirname, '..', 'dist', 'index.html');
  if (!existsSync(distIndex)) {
    console.log('  [빌드] React 클라이언트 빌드 중...');
    const { execSync } = await import('child_process');
    try {
      execSync('npx vite build', { cwd: join(__dirname, '..'), stdio: 'inherit' });
    } catch (e) {
      console.error('  [빌드] 실패 — public/index.html fallback 사용');
    }
  }

  // 서버 실행
  const serverPath = join(__dirname, '..', 'server.js');
  await import(serverPath);

  // 브라우저 열기
  setTimeout(() => {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} ${url}`);
  }, 800);
}

// ── 라우팅 ──
switch (command) {
  case 'start': start(); break;
  case 'setup': setup(); break;
  case 'uninstall': uninstall(); break;
  case 'help': default:
    console.log(`
  agent-office - Claude Code 실시간 에이전트 대시보드

  사용법:
    agent-office            서버 시작 + 브라우저 열기
    agent-office setup      Claude Code hooks 설정
    agent-office uninstall  hooks 제거
    agent-office help       도움말

  환경변수:
    AGENT_OFFICE_PORT       서버 포트 (기본: 7777)
`);
}
