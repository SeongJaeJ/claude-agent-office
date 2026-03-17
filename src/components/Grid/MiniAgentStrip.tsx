import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/useAgentStore';
import type { AgentState } from '@/types';

interface MiniAgentStripProps {
  agentStates: Record<string, AgentState>;
}

export function MiniAgentStrip({ agentStates }: MiniAgentStripProps) {
  const agents = useAgentStore((s) => s.agents);

  // 모든 에이전트 표시 (상태 없으면 idle 취급)
  if (agents.length === 0) return null;

  return (
    <div className="flex gap-1 px-2 py-1 overflow-x-auto scrollbar-thin">
      {agents.map((agent) => {
        const st = agentStates[agent.id]?.state || 'idle';
        return (
          <span
            key={agent.id}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono shrink-0 border',
              st === 'working' && 'border-accent-green/20 text-accent-green bg-accent-green/5',
              st === 'done' && 'border-accent-cyan/15 text-accent-cyan bg-accent-cyan/5',
              st === 'idle' && 'border-border text-text-dim bg-bg-card',
            )}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: st === 'idle' ? 'var(--color-text-dim)' : agent.color }}
            />
            {agent.name.split(' ')[0]}
          </span>
        );
      })}
    </div>
  );
}
