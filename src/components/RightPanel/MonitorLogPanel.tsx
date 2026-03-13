import { useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { escapeHtml, simpleMarkdown } from '../../utils/markdown';
import type { LogEntry } from '../../types';

export function MonitorLogPanel() {
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const contentRef = useRef<HTMLDivElement>(null);
  // 리렌더 트리거
  useSessionStore((s) => s._tick);

  const isMonitoring = activeSession && !activeSession.isManual;
  const logs = activeSession?.logs || [];

  // 새 로그 추가 시 스크롤
  useEffect(() => {
    if (contentRef.current && isMonitoring) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [logs.length, isMonitoring]);

  if (!isMonitoring) return null;

  return (
    <div className="monitor-log-panel visible">
      <div className="monitor-log-header">
        <span className="monitor-log-title">MONITORING</span>
        <span className="monitor-log-badge">READ ONLY</span>
        <span style={{ color: '#666', fontSize: '12px' }}>
          {activeSession?.name}
        </span>
      </div>
      <div ref={contentRef} className="monitor-log-content">
        {logs.map((log, i) => (
          <LogEntryComponent key={i} log={log} />
        ))}
      </div>
    </div>
  );
}

function LogEntryComponent({ log }: { log: LogEntry }) {
  const toolTag = log.toolName
    ? `<span class="log-tool">[${log.toolName}]</span>`
    : '';

  let detailHtml = '';
  if (log.detail) {
    if (log.detailType === 'assistant-text') {
      detailHtml = `<div class="log-chat">${simpleMarkdown(log.detail)}</div>`;
    } else {
      const cls =
        log.detailType === 'output'
          ? ' output'
          : log.detailType === 'error'
            ? ' error'
            : log.detailType === 'user-input'
              ? ' user-input'
              : '';
      detailHtml = `<div class="log-detail${cls}">${escapeHtml(log.detail)}</div>`;
    }
  }

  const html = `<div class="log-entry-header">
    <span class="log-time">${log.time}</span>
    <span class="log-agent" style="color:${log.color}">${log.agentName}</span>
    ${toolTag}
    <span class="log-msg">${escapeHtml(log.message)}</span>
  </div>${detailHtml}`;

  return (
    <div
      className="log-entry no-anim"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
