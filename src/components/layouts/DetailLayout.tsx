import { Sidebar } from '@/components/Sidebar/Sidebar';
import { AgentCardStrip } from '@/components/AgentCards/AgentCardStrip';
import { ActivityLog } from '@/components/ActivityLog/ActivityLog';
import { TerminalPanel } from '@/components/Terminal/TerminalPanel';

interface DetailLayoutProps {
  wsRef: React.RefObject<WebSocket | null>;
  onNewTab: () => void;
}

export function DetailLayout({ wsRef, onNewTab }: DetailLayoutProps) {
  return (
    <div className="flex-1 grid grid-cols-[220px_1fr_1fr] grid-rows-[auto_1fr] min-h-0 overflow-hidden">
      {/* 사이드바: 2행 전체 */}
      <div className="row-span-2 min-h-0 overflow-hidden">
        <Sidebar onNewTab={onNewTab} />
      </div>

      {/* 에이전트 카드 스트립: 중앙+우측 전체 너비 */}
      <div className="col-span-2 min-h-0 overflow-hidden">
        <AgentCardStrip />
      </div>

      {/* 로그 + 터미널 1:1 */}
      <div className="min-h-0 overflow-hidden border-r border-border">
        <ActivityLog />
      </div>
      <div className="min-h-0 overflow-hidden">
        <TerminalPanel wsRef={wsRef} />
      </div>
    </div>
  );
}
