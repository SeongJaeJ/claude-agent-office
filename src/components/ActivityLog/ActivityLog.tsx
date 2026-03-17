import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useViewStore } from '@/stores/useViewStore';
import { cn, isErrorLog, createStableKeyFn } from '@/lib/utils';
import { LogEntry } from './LogEntry';
import type { LogEntry as LogEntryType } from '@/types';

const FILTERS = ['all', 'tools', 'agents', 'errors'] as const;
const getLogKey = createStableKeyFn<LogEntryType>('log');

function filterLogs(logs: LogEntryType[], filter: string): LogEntryType[] {
  if (filter === 'all') return logs;
  if (filter === 'tools') return logs.filter((l) => l.toolName);
  if (filter === 'agents') return logs.filter((l) => l.agentName.includes('Agent') || l.detailType === 'assistant-text');
  if (filter === 'errors') return logs.filter(isErrorLog);
  return logs;
}

export function ActivityLog() {
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const logFilter = useViewStore((s) => s.logFilter);
  const setLogFilter = useViewStore((s) => s.setLogFilter);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const tick = useSessionStore((s) => s._tick);

  const logs = activeSession?.logs || [];
  // tick을 deps에 포함: mutable 배열(push/splice)의 변경을 확실히 반영
  const filtered = useMemo(() => filterLogs(logs, logFilter), [tick, logFilter]);

  // 스크롤 위치 추적 — 하단 근처일 때만 자동 스크롤
  const handleScroll = useCallback(() => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  useEffect(() => {
    if (bodyRef.current && isAtBottomRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [filtered.length]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-2 gap-2 border-b border-border bg-bg-surface shrink-0">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-text-dim font-mono">
          Activity Log
        </span>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setLogFilter(f)}
              className={cn(
                'px-2 py-0.5 rounded-xl text-[10px] font-mono border transition-colors',
                logFilter === f
                  ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/5'
                  : 'border-border text-text-muted hover:text-text-secondary',
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-text-dim font-mono">{filtered.length} events</span>
      </div>

      {/* 로그 본문 */}
      <div ref={bodyRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-1">
        {filtered.map((log) => (
          <LogEntry key={getLogKey(log)} log={log} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-text-dim text-xs font-mono py-8">
            {logs.length === 0 ? '아직 로그가 없습니다' : '필터에 맞는 로그가 없습니다'}
          </div>
        )}
      </div>
    </div>
  );
}
