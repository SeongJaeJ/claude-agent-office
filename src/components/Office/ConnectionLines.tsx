import { useEffect, useRef, useCallback } from 'react';
import { useAgentStore } from '../../stores/useAgentStore';
import type { AgentState } from '../../types';

interface ConnectionLinesProps {
  gridRef: React.RefObject<HTMLDivElement | null>;
  agentStates: Record<string, AgentState>;
  visible: boolean;
}

export function ConnectionLines({ gridRef, agentStates, visible }: ConnectionLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const agents = useAgentStore((s) => s.agents);

  const drawConnections = useCallback(() => {
    const svg = svgRef.current;
    const grid = gridRef.current;
    if (!svg || !grid) return;

    const gr = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${gr.width} ${gr.height}`);
    svg.innerHTML = '';

    const mainEl = grid.querySelector('#agent-main');
    if (!mainEl) return;
    const mr = mainEl.getBoundingClientRect();
    const mc = { x: mr.left - gr.left + mr.width / 2, y: mr.top - gr.top + mr.height / 2 };

    for (const agent of agents) {
      if (agent.isMain) continue;
      const el = grid.querySelector(`#agent-${agent.id}`);
      if (!el) continue;
      const er = el.getBoundingClientRect();
      const ac = { x: er.left - gr.left + er.width / 2, y: er.top - gr.top + er.height / 2 };

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(mc.x));
      line.setAttribute('y1', String(mc.y));
      line.setAttribute('x2', String(ac.x));
      line.setAttribute('y2', String(ac.y));
      line.classList.add('connection-line');
      if (agentStates[agent.id]?.state === 'working') {
        line.classList.add('active');
      }
      line.setAttribute('stroke', agent.color);
      line.id = `line-${agent.id}`;
      svg.appendChild(line);
    }
  }, [agents, agentStates, gridRef]);

  useEffect(() => {
    drawConnections();
    const handleResize = () => requestAnimationFrame(drawConnections);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawConnections]);

  return (
    <svg
      ref={svgRef}
      className={`connections ${visible ? 'visible' : ''}`}
    />
  );
}
