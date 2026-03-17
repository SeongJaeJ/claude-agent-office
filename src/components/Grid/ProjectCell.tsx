import { cn, getSessionStatus, formatElapsed } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useViewStore } from '@/stores/useViewStore';
import { MiniAgentStrip } from './MiniAgentStrip';
import { CellLog } from './CellLog';
import { CellTerminal } from './CellTerminal';
import { Maximize2 } from 'lucide-react';
import type { Session } from '@/types';

/** 상태별 스타일 맵 — 중복 분기 방지 */
const STATUS_STYLES = {
  working: {
    border: 'border-accent-green/20',
    dot: 'bg-accent-green shadow-[0_0_4px_var(--color-accent-green)]',
    badge: 'text-accent-green bg-accent-green/10',
    label: 'Working',
  },
  interactive: {
    border: 'border-accent-cyan/15',
    dot: 'bg-accent-cyan shadow-[0_0_4px_var(--color-accent-cyan)]',
    badge: 'text-accent-cyan bg-accent-cyan/10',
    label: 'Interactive',
  },
  idle: {
    border: 'border-border',
    dot: 'bg-text-dim',
    badge: 'text-text-dim bg-bg-card',
    label: 'Idle',
  },
} as const;

const SECTION_HEADER = 'text-[8px] font-semibold tracking-wider uppercase text-text-dim font-mono px-2 py-1 border-b border-border bg-bg-card/30 shrink-0';

interface ProjectCellProps {
  session: Session;
}

export function ProjectCell({ session }: ProjectCellProps) {
  const switchSession = useSessionStore((s) => s.switchSession);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const status = getSessionStatus(session);
  const style = STATUS_STYLES[status];

  const handleExpand = () => {
    switchSession(session.id);
    setViewMode('detail');
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-bg-surface overflow-hidden flex flex-col',
        style.border,
        session.alarm && 'ring-1 ring-accent-amber/50 border-accent-amber/30',
      )}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-card/50 shrink-0">
        <span className={cn('w-2 h-2 rounded-full shrink-0', style.dot)} />
        <span className="text-[12px] font-medium text-text-primary truncate flex-1" title={session.name}>
          {session.name}
        </span>
        {session.alarm && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full text-accent-amber bg-accent-amber/10 shrink-0">
            Alarm
          </span>
        )}
        <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0', style.badge)}>
          {style.label}
        </span>
        <span className="text-[9px] font-mono text-text-muted shrink-0">
          {session.stats.startTime ? formatElapsed(session.stats.startTime) : session.logs.length + ' events'}
        </span>
        <button
          onClick={handleExpand}
          aria-label="상세 보기"
          className="w-7 h-7 rounded-md border border-border-active bg-bg-elevated flex items-center justify-center text-text-muted hover:text-accent-cyan hover:border-accent-cyan/30 hover:shadow-[0_0_8px_rgba(0,212,255,0.1)] transition-all shrink-0"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* 에이전트 미니 스트립 */}
      <MiniAgentStrip agentStates={session.agentStates} />

      {/* 로그 + 터미널 1:1 */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        <div className="border-r border-border min-h-0 flex flex-col overflow-hidden">
          <div className={SECTION_HEADER}>Activity</div>
          <CellLog logs={session.logs} />
        </div>
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className={SECTION_HEADER}>Terminal</div>
          <CellTerminal session={session} />
        </div>
      </div>
    </div>
  );
}
