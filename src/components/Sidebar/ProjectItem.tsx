import { cn, getSessionStatus, formatElapsed } from '@/lib/utils';
import type { Session } from '@/types';
import { useSessionStore } from '@/stores/useSessionStore';
import { Folder } from 'lucide-react';

interface ProjectItemProps {
  session: Session;
  isActive: boolean;
}

const statusConfig = {
  working: {
    dot: 'bg-accent-green shadow-[0_0_4px_var(--color-accent-green)]',
    iconBg: 'bg-gradient-to-br from-accent-green/8 to-accent-green/4 border-accent-green/15',
    meta: 'text-accent-green',
    label: '● Working',
  },
  interactive: {
    dot: 'bg-accent-cyan shadow-[0_0_4px_var(--color-accent-cyan)]',
    iconBg: 'bg-gradient-to-br from-accent-cyan/8 to-accent-cyan/4 border-accent-cyan/20',
    meta: 'text-accent-cyan',
    label: '● Interactive',
  },
  idle: {
    dot: 'bg-text-dim',
    iconBg: 'bg-bg-card border-border',
    meta: 'text-text-muted',
    label: '○ Idle',
  },
};

export function ProjectItem({ session, isActive }: ProjectItemProps) {
  const switchSession = useSessionStore((s) => s.switchSession);
  const status = getSessionStatus(session);
  const cfg = statusConfig[status];
  const elapsed = formatElapsed(session.stats.startTime);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => switchSession(session.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchSession(session.id); } }}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2.5 rounded-md cursor-pointer transition-colors relative outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan',
        isActive ? 'bg-bg-elevated' : 'hover:bg-bg-card',
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm bg-accent-cyan" />
      )}
      <div className={cn('w-8 h-8 rounded-[7px] flex items-center justify-center text-sm shrink-0 relative border', cfg.iconBg)}>
        <Folder size={14} className="text-text-secondary" />
        <span className={cn('w-2 h-2 rounded-full absolute -bottom-px -right-px border-2 border-bg-surface', cfg.dot)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium truncate text-text-primary">{session.name}</div>
        <div className={cn('text-[10px] font-mono mt-px truncate', cfg.meta)}>
          {cfg.label}{elapsed ? ` · ${elapsed}` : ''}
        </div>
      </div>
      {session.alarm && (
        <span className="w-2 h-2 rounded-full bg-accent-amber animate-pulse shrink-0" aria-label="새 알림" />
      )}
    </div>
  );
}
