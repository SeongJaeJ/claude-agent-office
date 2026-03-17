import { useState } from 'react';
import { cn, isErrorLog } from '@/lib/utils';
import type { LogEntry as LogEntryType } from '@/types';

interface LogEntryProps {
  log: LogEntryType;
}

export function LogEntry({ log }: LogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!log.detail;
  const isError = isErrorLog(log);
  const isUserInput = log.detailType === 'user-input';
  const isAssistantText = log.detailType === 'assistant-text';

  return (
    <>
      <div
        className={cn(
          'flex gap-2 px-4 py-1 items-start text-[11.5px] font-mono outline-none',
          hasDetail && 'cursor-pointer focus-visible:ring-1 focus-visible:ring-accent-cyan',
          'hover:bg-bg-surface transition-colors',
        )}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onClick={() => hasDetail && setExpanded(!expanded)}
        onKeyDown={(e) => { if (hasDetail && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded(!expanded); } }}
      >
        <span className="text-text-dim text-[10px] min-w-[52px] shrink-0 pt-px">{log.time}</span>
        <span
          className="text-[9px] font-semibold px-1.5 rounded-sm min-w-[52px] text-center shrink-0"
          style={{ background: log.color + '14', color: log.color }}
        >
          {log.agentName.replace(/[👤🤖]\s?/, '')}
        </span>
        {log.toolName && (
          <span className="text-[9px] px-1 rounded-sm bg-bg-elevated text-accent-amber shrink-0 min-w-[38px] text-center">
            {log.toolName}
          </span>
        )}
        <span className={cn(
          'flex-1 leading-relaxed',
          isUserInput && 'text-accent-amber',
          isAssistantText && 'text-accent-cyan',
          isError && 'text-accent-pink',
          !isUserInput && !isAssistantText && !isError && 'text-text-secondary',
        )}>
          {log.message}
        </span>
      </div>
      {expanded && log.detail && (
        <div className={cn(
          'mx-4 ml-[68px] mb-1 p-2 rounded text-[10.5px] font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto border-l-2',
          isError
            ? 'bg-accent-pink/5 border-accent-pink text-accent-pink/80'
            : 'bg-bg-card border-accent-cyan text-text-muted',
        )}>
          {log.detail}
        </div>
      )}
    </>
  );
}
