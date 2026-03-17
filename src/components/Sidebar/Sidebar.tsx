import { useMemo } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { isErrorLog, formatElapsed } from '@/lib/utils';
import { ProjectItem } from './ProjectItem';
import { Plus } from 'lucide-react';

interface SidebarProps {
  onNewTab: () => void;
}

export function Sidebar({ onNewTab }: SidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = useSessionStore((s) => s.getActiveSession());
  // 리렌더 트리거
  const tick = useSessionStore((s) => s._tick);

  const elapsed = activeSession?.stats.startTime
    ? formatElapsed(activeSession.stats.startTime)
    : '--';

  const errorCount = useMemo(
    () => (activeSession ? activeSession.logs.filter(isErrorLog).length : 0),
    [tick, activeSessionId],
  );

  return (
    <aside className="bg-bg-surface border-r border-border flex flex-col overflow-y-auto h-full">
      <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-text-dim font-mono px-3.5 pt-3.5 pb-2">
        Projects
      </div>

      <div className="flex flex-col gap-px px-1.5">
        {[...sessions.entries()].map(([id, session]) => (
          <ProjectItem key={id} session={session} isActive={id === activeSessionId} />
        ))}
      </div>

      <button
        onClick={onNewTab}
        className="flex items-center justify-center gap-1.5 mx-3.5 my-2 py-2 rounded-md border border-dashed border-border bg-transparent text-text-muted text-[11.5px] cursor-pointer hover:border-accent-cyan hover:text-accent-cyan transition-colors"
      >
        <Plus size={12} />
        New Session
      </button>

      {/* spacer */}
      <div className="flex-1" />

      <div className="h-px bg-border mx-3.5 my-2" />

      <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-text-dim font-mono px-3.5 pt-1 pb-2">
        Session Info
      </div>
      <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-1">
        <div className="bg-bg-card rounded-md p-2 text-center">
          <div className="font-mono text-[15px] font-semibold text-text-primary">
            {activeSession?.stats.tools ?? 0}
          </div>
          <div className="text-[8.5px] text-text-muted uppercase tracking-wider mt-0.5">Tools</div>
        </div>
        <div className="bg-bg-card rounded-md p-2 text-center">
          <div className="font-mono text-[15px] font-semibold text-text-primary">
            {activeSession?.stats.agents ?? 0}
          </div>
          <div className="text-[8.5px] text-text-muted uppercase tracking-wider mt-0.5">Agents</div>
        </div>
        <div className="bg-bg-card rounded-md p-2 text-center">
          <div className="font-mono text-[13px] font-semibold text-text-primary">{elapsed}</div>
          <div className="text-[8.5px] text-text-muted uppercase tracking-wider mt-0.5">Elapsed</div>
        </div>
        <div className="bg-bg-card rounded-md p-2 text-center">
          <div className="font-mono text-[15px] font-semibold text-text-primary">{errorCount}</div>
          <div className="text-[8.5px] text-text-muted uppercase tracking-wider mt-0.5">Errors</div>
        </div>
      </div>
    </aside>
  );
}
