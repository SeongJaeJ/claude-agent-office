import { useRef, useEffect, useMemo, useCallback } from 'react';
import { cn, isErrorLog, createStableKeyFn } from '@/lib/utils';
import type { LogEntry } from '@/types';

interface CellLogProps {
  logs: LogEntry[];
}

const getCellLogKey = createStableKeyFn<LogEntry>('cl');

export function CellLog({ logs }: CellLogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const recentLogs = useMemo(() => logs.slice(-50), [logs.length]);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  useEffect(() => {
    if (ref.current && isAtBottomRef.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [recentLogs.length]);

  return (
    <div ref={ref} onScroll={handleScroll} className="flex-1 overflow-y-auto py-0.5 min-h-0">
      {recentLogs.map((log) => (
        <div key={getCellLogKey(log)} className="flex gap-1 px-2 py-0.5 items-start text-[9px] font-mono leading-relaxed">
          <span className="text-text-dim text-[8px] shrink-0 min-w-[36px]">{log.time}</span>
          <span
            className="text-[7px] px-1 rounded-sm shrink-0"
            style={{ background: log.color + '14', color: log.color }}
          >
            {log.agentName.replace(/[👤🤖]\s?/, '').split(' ')[0]}
          </span>
          <span className={cn(
            'flex-1 truncate',
            isErrorLog(log) ? 'text-accent-pink' : 'text-text-secondary',
          )}>
            {log.message}
          </span>
        </div>
      ))}
      {logs.length === 0 && (
        <div className="text-center text-text-dim text-[9px] font-mono py-4">아직 로그가 없습니다</div>
      )}
    </div>
  );
}
