import { useEffect, useRef, useCallback, useState } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import { useAgentStore } from '../stores/useAgentStore';
import type { HookEvent, TranscriptEvent, LogEntry } from '../types';

function makeLog(
  agentName: string,
  color: string,
  message: string,
  toolName: string | null,
  detail?: string,
  detailType?: string,
): LogEntry {
  return {
    time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
    agentName,
    color,
    message,
    toolName,
    detail,
    detailType,
  };
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 개발 모드: Vite dev 서버(5173)에서는 백엔드(7777)로 직접 연결
    const host = import.meta.env.DEV ? `${location.hostname}:7777` : location.host;
    const ws = new WebSocket(`${protocol}//${host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case 'init':
            handleInit(data);
            break;
          case 'hook':
            handleHookEvent(data);
            break;
          case 'transcript':
            handleTranscriptEvent(data);
            break;
          case 'session_new': {
            const store = useSessionStore.getState();
            const sName = (data.session.name || '').toLowerCase();
            // 같은 이름의 interactive 세션이 있으면 모니터링 탭 생성 스킵
            let hasInteractive = false;
            for (const [, s] of store.sessions) {
              if (s.isManual && s.name.toLowerCase() === sName) { hasInteractive = true; break; }
            }
            if (hasInteractive) break;
            const linked = store.findLinkedManualSession(data.session.id);
            if (!linked) {
              store.getOrCreateSession(data.session.id, data.session.name, data.session.path);
            }
            break;
          }
          case 'session_removed':
            useSessionStore.getState().removeSession(data.session_id);
            break;
          case 'terminal_output': {
            const store = useSessionStore.getState();
            for (const [, s] of store.sessions) {
              if (s.termId === data.id && s.term) {
                s.term.write(data.data);
                if (!s.claudeDetected && data.data.match(/claude\s|Claude Code|╭─/i)) {
                  store.setClaudeDetected(s.id);
                }
                break;
              }
            }
            break;
          }
          case 'terminal_exit': {
            const store = useSessionStore.getState();
            for (const [, s] of store.sessions) {
              if (s.termId === data.id && s.term) {
                s.term.write('\r\n\x1b[90m[프로세스 종료]\x1b[0m\r\n');
                break;
              }
            }
            break;
          }
        }
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    connect();
    const handleBeforeUnload = () => wsRef.current?.close();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { ws: wsRef, send, isConnected };
}

function handleInit(data: { sessions?: Array<{ id: string; name: string; path: string }> }) {
  const store = useSessionStore.getState();
  const serverIds = new Set((data.sessions || []).map((s) => s.id));
  const toRemove: string[] = [];
  for (const [id, s] of store.sessions) {
    if (!s.isManual && !serverIds.has(id)) toRemove.push(id);
  }
  toRemove.forEach((id) => store.removeSession(id));
  for (const s of data.sessions || []) {
    store.getOrCreateSession(s.id, s.name, s.path);
  }
}

function handleHookEvent(event: HookEvent) {
  const sessionStore = useSessionStore.getState();
  const agentStore = useAgentStore.getState();
  const hookSid = event.session_id || 'default';

  const linked = sessionStore.findLinkedManualSession(hookSid, event.agent_office_term_id);
  if (!linked && event.agent_office_term_id) return;

  const sid = linked ? linked.id : hookSid;
  const session = linked || sessionStore.getOrCreateSession(hookSid, event.project_name, event.project_path);

  if (event.project_name && session.name !== event.project_name) {
    sessionStore.updateSessionName(sid, event.project_name, event.project_path);
  }

  // Interactive 세션 링크 시 같은 프로젝트의 모니터링 탭 정리
  if (linked && (event.project_path || event.project_name)) {
    const normPath = (event.project_path || '').toLowerCase();
    const normName = (event.project_name || '').toLowerCase();
    const toRemove: string[] = [];
    for (const [mSid, mSession] of sessionStore.sessions) {
      if (mSession.isManual || mSid === sid) continue;
      const pathMatch = normPath && (mSession.path || '').toLowerCase() === normPath;
      const nameMatch = normName && (mSession.name || '').toLowerCase() === normName;
      if (pathMatch || nameMatch) {
        toRemove.push(mSid);
      }
    }
    toRemove.forEach(id => sessionStore.removeSession(id));
  }

  if (!session.claudeDetected) sessionStore.setClaudeDetected(sid);

  const eventName = event.hook_event_name;
  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};

  switch (eventName) {
    case 'SessionStart':
      sessionStore.addLog(sid, makeLog('System', '#e94560', `세션 시작 (${event.source || 'startup'})`, null));
      sessionStore.updateAgentState(sid, 'main', 'working', '세션 시작됨');
      session.stats.startTime = Date.now();
      break;

    case 'PreToolUse':
      session.stats.tools++;
      if (toolName === 'Agent') {
        const desc = toolInput.description || '';
        const subagentType = toolInput.subagent_type || '';
        let subId = subagentType
          ? agentStore.ensureDynamicAgent(subagentType, desc)
          : agentStore.matchSubagent(desc + ' ' + (toolInput.prompt || '')) || agentStore.ensureDynamicAgent('general-purpose', desc);
        session.stats.agents++;
        sessionStore.updateAgentState(sid, subId, 'working', desc || '작업 시작...');
        const a = agentStore.getAgent(subId);
        sessionStore.addLog(sid, makeLog(a?.name || subId, a?.color || '#fff', desc || '서브에이전트 시작', 'Agent', toolInput.prompt?.substring(0, 300)));
      } else {
        sessionStore.updateAgentState(sid, 'main', 'working', `${toolName} 실행 중...`);
        let summary = '';
        let detail = '';
        switch (toolName) {
          case 'Bash': summary = toolInput.description || toolInput.command?.substring(0, 80) || 'Bash'; detail = toolInput.command || ''; break;
          case 'Read': summary = toolInput.file_path?.split('/').pop() || 'Read'; detail = toolInput.file_path || ''; break;
          case 'Edit': summary = toolInput.file_path?.split('/').pop() || 'Edit'; detail = toolInput.file_path || ''; break;
          case 'Write': summary = toolInput.file_path?.split('/').pop() || 'Write'; detail = toolInput.file_path || ''; break;
          case 'Grep': summary = `패턴: ${toolInput.pattern || ''}`; detail = toolInput.pattern ? `pattern: ${toolInput.pattern}${toolInput.path ? '\npath: ' + toolInput.path : ''}` : ''; break;
          case 'Glob': summary = toolInput.pattern || 'Glob'; detail = toolInput.pattern || ''; break;
          default: summary = toolName;
        }
        sessionStore.addLog(sid, makeLog('Main Agent', '#e94560', summary, toolName, detail));
      }
      break;

    case 'PostToolUse': {
      const toolOutput = event.tool_response || event.tool_output || '';
      if (toolName === 'Agent') {
        const desc = toolInput.description || '';
        const subagentType = toolInput.subagent_type || '';
        let subId = agentStore.findDynamicAgent(desc, subagentType)
          || agentStore.matchSubagent(desc)
          || agentStore.ensureDynamicAgent(subagentType || 'general-purpose', desc);

        const mapKey = desc || subagentType;
        agentStore.pendingAgentMap.delete(mapKey);

        const outputStr = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput || '');
        const isBackground = outputStr.includes('background') || outputStr.includes('Async');
        if (isBackground) {
          sessionStore.updateAgentState(sid, subId, 'working', '백그라운드 작업 중...');
        } else {
          sessionStore.updateAgentState(sid, subId, 'done', '작업 완료');
        }
      } else {
        sessionStore.updateAgentState(sid, 'main', 'working', `${toolName} 완료`);
      }
      if (toolOutput) {
        const outputStr = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2);
        if (outputStr.trim()) {
          const isError = event.tool_error || outputStr.includes('Error') || outputStr.includes('error:');
          sessionStore.addLog(sid, makeLog('Main Agent', '#e94560', `${toolName} 완료`, null, outputStr, isError ? 'error' : 'output'));
        }
      }
      break;
    }

    case 'SubagentStart': {
      const agentType = event.agent_type || '';
      let subId = agentStore.findDynamicAgent(agentType, agentType)
        || agentStore.matchSubagent(agentType)
        || agentStore.ensureDynamicAgent(agentType || 'general-purpose', agentType);
      sessionStore.updateAgentState(sid, subId, 'working', `${agentType || 'Agent'} 시작`);
      break;
    }

    case 'SubagentStop': {
      const agentType = event.agent_type || '';
      let subId = agentStore.findDynamicAgent(agentType, agentType)
        || agentStore.matchSubagent(agentType)
        || agentStore.ensureDynamicAgent(agentType || 'general-purpose', agentType);
      sessionStore.updateAgentState(sid, subId, 'done', '작업 완료!');
      const a = agentStore.getAgent(subId);
      sessionStore.addLog(sid, makeLog(a?.name || subId, a?.color || '#6bcb77', '작업 완료', null));
      break;
    }

    case 'Stop':
      sessionStore.addLog(sid, makeLog('Main Agent', '#6bcb77', '응답 완료', null));
      setTimeout(() => {
        if (session.activeAgents.size === 0) sessionStore.updateAgentState(sid, 'main', 'done', '작업 완료');
        sessionStore.flashTabDone(sid);
      }, 500);
      if (session.linkedHookSessionId) {
        sessionStore.unlinkSession(session.linkedHookSessionId);
        session.linkedHookSessionId = null;
      }
      if (sessionStore.hookSessionLinks.has(hookSid)) {
        sessionStore.unlinkSession(hookSid);
      }
      break;

    case 'Notification':
      sessionStore.addLog(sid, makeLog('System', '#ffd93d', event.notification_message || 'Notification', null));
      break;

    default:
      sessionStore.addLog(sid, makeLog('System', '#888', eventName || '', toolName || null));
  }
}

function handleTranscriptEvent(data: TranscriptEvent & { session_id: string }) {
  const sessionStore = useSessionStore.getState();
  const agentStore = useAgentStore.getState();
  const hookSid = data.session_id || 'default';
  const linked = sessionStore.findLinkedManualSession(hookSid);
  const sid = linked ? linked.id : hookSid;
  if (!linked) sessionStore.getOrCreateSession(hookSid);

  switch (data.entry_type) {
    case 'user': {
      const text = data.text || '';
      if (text.includes('task-notification') && text.includes('completed')) {
        const summaryMatch = text.match(/<summary>(.*?)<\/summary>/);
        if (summaryMatch) {
          let subId = agentStore.matchSubagent(summaryMatch[1])
            || agentStore.ensureDynamicAgent('general-purpose', summaryMatch[1]);
          sessionStore.updateAgentState(sid, subId, 'done', '작업 완료!');
          const a = agentStore.getAgent(subId);
          sessionStore.addLog(sid, makeLog(a?.name || subId, a?.color || '#6bcb77', '작업 완료', null));
        }
      }
      sessionStore.addLog(sid, makeLog('👤 User', '#ffd93d', '', null, text, 'user-input'));
      break;
    }
    case 'assistant':
      for (const part of data.parts || []) {
        if (part.type === 'text' && part.text) {
          sessionStore.addLog(sid, makeLog('🤖 Claude', '#4d96ff', '', null, part.text, 'assistant-text'));
        }
      }
      break;
    case 'tool_result':
      if (data.text) {
        sessionStore.addLog(sid, makeLog('Main Agent', '#e94560', '도구 결과', null, data.text, 'output'));
      }
      break;
  }
}
