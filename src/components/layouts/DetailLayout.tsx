import { Sidebar } from '@/components/Sidebar/Sidebar';
import { AgentCardStrip } from '@/components/AgentCards/AgentCardStrip';
import { MonitoringView } from '@/components/ActivityLog/MonitoringView';
import { TerminalPanel } from '@/components/Terminal/TerminalPanel';
import { useSessionStore } from '@/stores/useSessionStore';

interface DetailLayoutProps {
  wsRef: React.RefObject<WebSocket | null>;
  onNewTab: () => void;
}

export function DetailLayout({ wsRef, onNewTab }: DetailLayoutProps) {
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const isManual = activeSession?.isManual;

  return (
    <div className="flex-1 grid grid-cols-[220px_1fr] grid-rows-[auto_1fr] min-h-0 overflow-hidden">
      {/* 사이드바: 2행 전체 */}
      <div className="row-span-2 min-h-0 overflow-hidden">
        <Sidebar onNewTab={onNewTab} />
      </div>

      {/* 에이전트 카드 스트립 */}
      <div className="min-h-0 overflow-hidden">
        <AgentCardStrip />
      </div>

      {/* 메인 콘텐츠: 세션 타입에 따라 자동 분기 */}
      <div className="min-h-0 overflow-hidden">
        {isManual ? <TerminalPanel wsRef={wsRef} /> : <MonitoringView />}
      </div>
    </div>
  );
}
