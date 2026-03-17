import { useState, useEffect } from 'react';
import { useViewStore } from '@/stores/useViewStore';
import { cn } from '@/lib/utils';
import { Columns2, LayoutGrid, Plus, Settings } from 'lucide-react';

interface TopBarProps {
  isConnected: boolean;
  onNewTab: () => void;
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-xs text-text-secondary bg-bg-card px-2.5 py-1 rounded-md border border-border">
      {time.toLocaleTimeString('ko-KR', { hour12: false })}
    </span>
  );
}

export function TopBar({ isConnected, onNewTab }: TopBarProps) {
  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);

  return (
    <header className="flex items-center px-4 bg-bg-surface border-b border-border gap-3 h-12 col-span-full">
      {/* 로고 */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-gradient-to-br from-accent-cyan to-accent-green rounded-md flex items-center justify-center text-[10px] font-extrabold text-bg-deep font-display">
          AO
        </div>
        <span className="font-display text-xs font-bold tracking-wider text-text-primary">
          Agent Office
        </span>
      </div>

      {/* 뷰 전환 */}
      <div className="flex gap-0.5 ml-5 bg-bg-card border border-border rounded-lg p-[3px]">
        <button
          onClick={() => setViewMode('detail')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all',
            viewMode === 'detail'
              ? 'bg-bg-elevated text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <Columns2 size={14} />
          Detail
        </button>
        <button
          onClick={() => setViewMode('grid')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all',
            viewMode === 'grid'
              ? 'bg-bg-elevated text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <LayoutGrid size={14} />
          Grid
        </button>
      </div>

      {/* 우측 */}
      <div className="ml-auto flex items-center gap-3.5">
        <Clock />
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <span
            className={cn(
              'w-[5px] h-[5px] rounded-full',
              isConnected
                ? 'bg-accent-green shadow-[0_0_6px_var(--color-accent-green)]'
                : 'bg-accent-pink shadow-[0_0_6px_var(--color-accent-pink)]',
            )}
          />
          <span className={isConnected ? 'text-accent-green' : 'text-accent-pink'}>
            {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
        <button
          onClick={onNewTab}
          className="w-[30px] h-[30px] rounded-md border border-border bg-transparent text-text-muted flex items-center justify-center hover:border-border-active hover:text-text-secondary transition-colors"
        >
          <Plus size={14} />
        </button>
        <button className="w-[30px] h-[30px] rounded-md border border-border bg-transparent text-text-muted flex items-center justify-center hover:border-border-active hover:text-text-secondary transition-colors">
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
}
