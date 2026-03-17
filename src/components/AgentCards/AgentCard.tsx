import { cn } from '@/lib/utils';
import type { AgentConfig, AgentState } from '@/types';

interface AgentCardProps {
  agent: AgentConfig;
  state?: AgentState;
  isMain?: boolean;
}

export function AgentCard({ agent, state, isMain }: AgentCardProps) {
  const st = state?.state || 'idle';
  const initial = agent.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden transition-all shrink-0 relative',
        isMain
          ? 'min-w-[200px] max-w-[210px] border-accent-cyan bg-gradient-to-b from-accent-cyan/3 to-bg-card'
          : 'min-w-[140px] max-w-[155px] border-dashed bg-bg-surface/50',
        isMain ? 'p-2.5 px-3' : 'p-2 px-2.5',
        st === 'working' && 'border-accent-green/25',
        st === 'done' && 'border-accent-cyan/15 opacity-65',
        st === 'idle' && !isMain && 'border-border',
      )}
    >
      {/* Working 상단 라인 */}
      {st === 'working' && (
        <div className={cn(
          'absolute top-0 left-0 right-0 h-[2px]',
          isMain
            ? 'bg-gradient-to-r from-accent-cyan to-accent-green'
            : 'bg-gradient-to-r from-accent-green to-accent-cyan',
        )} />
      )}

      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'rounded-md flex items-center justify-center font-bold text-bg-deep font-display shrink-0',
            isMain ? 'w-[30px] h-[30px] text-[13px]' : 'w-[22px] h-[22px] text-[10px] rounded-[5px]',
          )}
          style={{ background: `linear-gradient(135deg, ${agent.color}, ${agent.color}99)` }}
        >
          {initial}
        </div>
        <div>
          <div className={cn('font-semibold', isMain ? 'text-[13px]' : 'text-[11px]')}>
            {agent.name}
          </div>
          <div
            className={cn(
              'font-mono mt-px',
              isMain ? 'text-[9.5px]' : 'text-[9px]',
              st === 'working' && 'text-accent-green',
              st === 'done' && 'text-accent-cyan',
              st === 'idle' && 'text-text-dim',
            )}
          >
            {st === 'working' && `● ${state?.message || '작업 중'}`}
            {st === 'done' && '✓ 완료'}
            {st === 'idle' && '○ 대기'}
          </div>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-[2px] bg-bg-elevated rounded-full overflow-hidden mt-2">
        {st === 'working' ? (
          <div
            className="h-full rounded-full animate-indeterminate"
            style={{
              background: `linear-gradient(90deg, transparent, ${agent.color}, var(--color-accent-cyan), transparent)`,
              width: '40%',
            }}
          />
        ) : (
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: st === 'done' ? '100%' : '0%',
              background: 'var(--color-accent-cyan)',
            }}
          />
        )}
      </div>
    </div>
  );
}
