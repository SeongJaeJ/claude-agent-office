import { cn, getSessionStatus } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useViewStore } from '@/stores/useViewStore';
import { MiniAgentStrip } from './MiniAgentStrip';
import { CellLog } from './CellLog';
import { CellTerminal } from './CellTerminal';
import { Maximize2 } from 'lucide-react';
import type { Session } from '@/types';

interface ProjectCellProps {
  session: Session;
}

export function ProjectCell({ session }: ProjectCellProps) {
  const switchSession = useSessionStore((s) => s.switchSession);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const status = getSessionStatus(session);

  const handleExpand = () => {
    switchSession(session.id);
    setViewMode('detail');
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-bg-surface overflow-hidden flex flex-col min-h-[280px]',
        status === 'working' && 'border-accent-green/20',
        status === 'interactive' && 'border-accent-cyan/15',
        status === 'idle' && 'border-border',
      )}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-card/50 shrink-0">
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            status === 'working' && 'bg-accent-green shadow-[0_0_4px_var(--color-accent-green)]',
            status === 'interactive' && 'bg-accent-cyan shadow-[0_0_4px_var(--color-accent-cyan)]',
            status === 'idle' && 'bg-text-dim',
          )}
        />
        <span className="text-[12px] font-medium text-text-primary truncate flex-1">
          {session.name}
        </span>
        <span className="text-[9px] font-mono text-text-muted shrink-0">
          {session.logs.length} events
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
          <div className="text-[8px] font-semibold tracking-wider uppercase text-text-dim font-mono px-2 py-1 border-b border-border bg-bg-card/30 shrink-0">
            Activity
          </div>
          <CellLog logs={session.logs} />
        </div>
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className="text-[8px] font-semibold tracking-wider uppercase text-text-dim font-mono px-2 py-1 border-b border-border bg-bg-card/30 shrink-0">
            Terminal
          </div>
          <CellTerminal session={session} />
        </div>
      </div>
    </div>
  );
}
