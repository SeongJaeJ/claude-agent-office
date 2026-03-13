import { memo } from 'react';
import type { AgentConfig, AgentState } from '../../types';
import { getAgentSprite } from '../../utils/sprites';

interface AgentCubicleProps {
  agent: AgentConfig;
  state?: AgentState;
}

export const AgentCubicle = memo(function AgentCubicle({ agent, state }: AgentCubicleProps) {
  const agentState = state?.state || 'idle';
  const isWorking = agentState === 'working';
  const isDone = agentState === 'done';

  const cellClass = [
    'cubicle-cell',
    'has-agent',
    agent.isMain && 'is-main',
    isWorking && 'working',
  ].filter(Boolean).join(' ');

  const spriteSrc = getAgentSprite(agent.id, agent.isMain);
  const spriteSize = agent.isMain ? 96 : 72;
  const code = 'const r=await fetch()\nif(ok){return data}\nvalidate()\ncheck(token)\nrender(<App/>)\noptimize()';

  const dotColor = isWorking ? agent.color : isDone ? '#6bcb77' : '#484f58';
  const statusText = isWorking ? 'WORKING' : isDone ? 'DONE' : 'IDLE';
  const statusColor = isWorking ? agent.color : isDone ? '#6bcb77' : '#6e7681';
  const glowColor = agent.isMain
    ? 'rgba(255,77,109,0.25)'
    : `color-mix(in srgb, ${agent.color} 25%, transparent)`;

  return (
    <div className={cellClass} style={{ '--agent-color': agent.color } as React.CSSProperties}>
      <div className="cubicle-accent" style={{ background: agent.color }} />
      <div className="cubicle-ambient" style={{ background: agent.color }} />
      <div
        className={`agent ${agent.isMain ? 'main' : ''} ${isWorking ? 'speaking' : ''}`}
        id={`agent-${agent.id}`}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="speech-bubble"
          style={{
            borderColor: agent.color,
            '--bubble-color': agent.color,
            opacity: isWorking || isDone ? 1 : undefined,
            transform: isWorking || isDone ? 'translateY(0)' : undefined,
          } as React.CSSProperties}
        >
          {state?.message || '대기 중'}
        </div>

        <div className="character">
          <img
            className={`pixel-char ${isWorking ? 'working' : 'idle'}`}
            id={`char-${agent.id}`}
            src={spriteSrc}
            alt={agent.name}
            width={spriteSize}
            height={spriteSize}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
        </div>

        <div className="desk-area">
          <div className="desk">
            <div className="monitor" style={{ '--glow-color': glowColor } as React.CSSProperties}>
              <div
                className={`monitor-screen ${isWorking ? 'active' : ''}`}
                id={`screen-${agent.id}`}
              >
                {code}
              </div>
              <div className="monitor-glow" />
            </div>
            <div className={`keyboard ${isWorking ? 'typing' : ''}`} id={`kbd-${agent.id}`} />
            <div className="coffee-cup">
              <div className={`steam ${isWorking ? 'visible' : ''}`} id={`steam-${agent.id}`} />
            </div>
          </div>
          <div className="chair" />
          <div
            className="role-label"
            style={{
              color: agent.color,
              borderColor: `color-mix(in srgb, ${agent.color} 25%, transparent)`,
            }}
          >
            {agent.name}
          </div>
          <div className="status-indicator">
            <div
              className="status-dot"
              id={`dot-${agent.id}`}
              style={{ background: dotColor }}
            />
            <span
              className="status-text"
              id={`status-${agent.id}`}
              style={{ color: statusColor }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
