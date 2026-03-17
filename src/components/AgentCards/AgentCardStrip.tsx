import { useAgentStore } from '@/stores/useAgentStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { AgentCard } from './AgentCard';

export function AgentCardStrip() {
  const agents = useAgentStore((s) => s.agents);
  const activeSession = useSessionStore((s) => s.getActiveSession());
  useSessionStore((s) => s._tick);

  const mainAgent = agents.find((a) => a.isMain);
  const subAgents = agents.filter((a) => !a.isMain);

  const getState = (agentId: string) => activeSession?.agentStates[agentId];

  return (
    <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-border bg-bg-surface shrink-0 scrollbar-thin">
      {/* 메인 에이전트 */}
      {mainAgent && (
        <AgentCard agent={mainAgent} state={getState(mainAgent.id)} isMain />
      )}

      {/* 커넥터 */}
      {subAgents.length > 0 && (
        <div className="flex items-center shrink-0 mx-[-4px] opacity-60">
          <svg width="24" height="100" viewBox="0 0 24 100" preserveAspectRatio="none" className="h-full">
            <path d="M0,50 L12,50" stroke="#2a3050" strokeWidth="2" strokeDasharray="4 3" />
            <circle cx="12" cy="50" r="3" fill="#2a3050" />
            <path d="M12,15 L12,85" stroke="#2a3050" strokeWidth="1.5" />
            <path d="M12,15 L24,15" stroke="#2a3050" strokeWidth="1.5" />
            <path d="M12,50 L24,50" stroke="#2a3050" strokeWidth="1.5" />
            <path d="M12,85 L24,85" stroke="#2a3050" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* 서브에이전트 그룹 */}
      {subAgents.length > 0 && (
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[8.5px] font-semibold tracking-[1.5px] uppercase text-text-dim font-mono pl-0.5">
            Sub-Agents
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {subAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} state={getState(agent.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
