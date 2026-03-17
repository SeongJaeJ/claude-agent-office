import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { createStableKeyFn } from '@/lib/utils';
import { LogEntry } from './LogEntry';
import type { LogEntry as LogEntryType } from '@/types';

const MAIN_AGENTS = new Set(['Main Agent', '👤 User', '🤖 Claude', 'System']);
const getMainKey = createStableKeyFn<LogEntryType>('ml');
const getSubKey = createStableKeyFn<LogEntryType>('sl');

/** 자동 스크롤 훅 */
function useAutoScroll(deps: number) {
  const ref = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  useEffect(() => {
    if (ref.current && isAtBottomRef.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [deps]);

  return { ref, handleScroll };
}

export function MonitoringView() {
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const tick = useSessionStore((s) => s._tick);

  const logs = activeSession?.logs || [];

  const { mainLogs, subLogs } = useMemo(() => {
    const main: LogEntryType[] = [];
    const sub: LogEntryType[] = [];
    for (const log of logs) {
      if (MAIN_AGENTS.has(log.agentName)) {
        main.push(log);
      } else {
        sub.push(log);
      }
    }
    return { mainLogs: main, subLogs: sub };
  }, [tick]);

  const mainScroll = useAutoScroll(mainLogs.length);
  const subScroll = useAutoScroll(subLogs.length);

  return (
    <div className="flex-1 grid grid-cols-2 min-h-0 overflow-hidden">
      {/* 왼쪽: 메인 로그 */}
      <div className="flex flex-col min-h-0 overflow-hidden border-r border-border">
        <div className="flex items-center px-4 py-2 gap-2 border-b border-border bg-bg-surface shrink-0">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-text-dim font-mono">
            Main
          </span>
          <span className="ml-auto text-[10px] text-text-dim font-mono">{mainLogs.length}</span>
        </div>
        <div ref={mainScroll.ref} onScroll={mainScroll.handleScroll} className="flex-1 overflow-y-auto py-1">
          {mainLogs.map((log) => (
            <LogEntry key={getMainKey(log)} log={log} />
          ))}
          {mainLogs.length === 0 && (
            <div className="text-center text-text-dim text-xs font-mono py-8">
              아직 로그가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 서브에이전트 로그 */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center px-4 py-2 gap-2 border-b border-border bg-bg-surface shrink-0">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-text-dim font-mono">
            Sub-Agents
          </span>
          <span className="ml-auto text-[10px] text-text-dim font-mono">{subLogs.length}</span>
        </div>
        <div ref={subScroll.ref} onScroll={subScroll.handleScroll} className="flex-1 overflow-y-auto py-1">
          {subLogs.map((log) => (
            <LogEntry key={getSubKey(log)} log={log} />
          ))}
          {subLogs.length === 0 && (
            <div className="text-center text-text-dim text-xs font-mono py-8">
              서브에이전트 로그가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
