import { useRef, useMemo } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAgentStore } from '../../stores/useAgentStore';
import { AgentCubicle } from './AgentCubicle';
import { ConnectionLines } from './ConnectionLines';
import { DustParticles } from './DustParticles';

export function Office() {
  const gridRef = useRef<HTMLDivElement>(null);
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const agents = useAgentStore((s) => s.agents);
  // 리렌더 트리거
  useSessionStore((s) => s._tick);

  const isVisible = activeSession && (activeSession.claudeDetected || !activeSession.isManual);
  const agentStates = activeSession?.agentStates || {};

  // 그리드 레이아웃 계산
  const layout = useMemo(() => {
    const cols = 3;
    const subs = agents.filter((a) => !a.isMain);
    const main = agents.find((a) => a.isMain);
    const totalCells = Math.max(subs.length + 1, 9);
    const rows = Math.ceil(totalCells / cols);
    const centerIdx = Math.floor(rows / 2) * cols + Math.floor(cols / 2);

    const subSlots: number[] = [];
    for (let i = 0; i < rows * cols; i++) {
      if (i !== centerIdx) subSlots.push(i);
    }

    const cellMap = new Map<number, (typeof agents)[0] | null>();
    if (main) cellMap.set(centerIdx, main);
    for (let si = 0; si < subs.length && si < subSlots.length; si++) {
      cellMap.set(subSlots[si], subs[si]);
    }

    return { rows, cols, cellMap, totalCells: rows * cols };
  }, [agents]);

  return (
    <div className="office" id="office">
      <div className="office-bg" />
      <div className="floor" />
      <div className="ceiling-lights" />
      <div className="god-rays" />
      <DustParticles />

      {/* 빈 사무실 메시지 */}
      <div className={`empty-office-msg ${isVisible ? 'hidden' : ''}`}>
        <div className="msg">
          아직 아무도 출근하지 않았습니다<br /><br />
          터미널에서 claude 를 실행하면<br />
          에이전트들이 출근합니다<br /><br />
          <span style={{ fontSize: '12px', color: '#aaa' }}>Tip: 터미널에 claude 를 입력하세요</span>
        </div>
      </div>

      {/* 연결선 */}
      <ConnectionLines
        gridRef={gridRef}
        agentStates={agentStates}
        visible={!!isVisible}
      />

      {/* 에이전트 그리드 */}
      <div
        ref={gridRef}
        className={`agents-grid ${!isVisible ? 'hidden' : ''}`}
        style={{ gridTemplateRows: `repeat(${layout.rows}, 1fr)` }}
      >
        {Array.from({ length: layout.totalCells }, (_, i) => {
          const agent = layout.cellMap.get(i);
          if (agent) {
            return (
              <AgentCubicle
                key={agent.id}
                agent={agent}
                state={agentStates[agent.id]}
              />
            );
          }
          return (
            <div key={`empty-${i}`} className="cubicle-cell empty-cell">
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.2,
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: '60px',
                      height: '18px',
                      background: 'linear-gradient(180deg,#2a2e3a,#1e222c)',
                      border: '1px solid #333',
                      borderRadius: '2px',
                      margin: '0 auto',
                    }}
                  />
                  <div
                    style={{
                      width: '8px',
                      height: '4px',
                      background: '#2a2e3a',
                      margin: '0 auto',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
