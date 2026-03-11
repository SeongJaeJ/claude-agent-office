#!/usr/bin/env node
// Claude Code Hook → Agent Office 서버로 이벤트 전송
// stdin으로 이벤트 JSON을 받아 프로젝트 정보를 추가한 뒤 POST
import { createHash } from 'crypto';
import { basename } from 'path';

const PORT = process.env.AGENT_OFFICE_PORT || 7777;

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', async () => {
  try {
    const event = JSON.parse(data);
    const projectPath = event.cwd || process.cwd();
    if (!event.project_path) event.project_path = projectPath;
    if (!event.project_name) event.project_name = basename(projectPath);
    // Claude Code가 제공하는 session_id 우선 사용, 없으면 경로 해시 fallback
    if (!event.session_id) {
      event.session_id = createHash('md5').update(projectPath).digest('hex').slice(0, 8);
    }

    await fetch(`http://localhost:${PORT}/hooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // 서버 미실행 시 조용히 무시
  }
});
