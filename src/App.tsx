import { useEffect, useCallback, useState } from 'react';
import { TopBar } from './components/TopBar';
import { DetailLayout } from './components/layouts/DetailLayout';
import { GridLayout } from './components/layouts/GridLayout';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessionStore } from './stores/useSessionStore';
import { useAgentStore } from './stores/useAgentStore';
import { useViewStore } from './stores/useViewStore';

let manualTabCounter = 0;

export default function App() {
  const { ws, isConnected } = useWebSocket();
  const sessions = useSessionStore((s) => s.sessions);
  const viewMode = useViewStore((s) => s.viewMode);
  const [initialized, setInitialized] = useState(false);

  // 에이전트 설정 로드
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((config) => useAgentStore.getState().buildAgents(config))
      .catch(() =>
        useAgentStore
          .getState()
          .buildAgents({ main: { role: '시니어 개발자', description: '' }, subagents: [] }),
      );
  }, []);

  // WS 연결 시 첫 탭 생성
  useEffect(() => {
    if (isConnected && sessions.size === 0 && !initialized) {
      setInitialized(true);
      createManualTab();
    }
  }, [isConnected, sessions.size, initialized]);

  const createManualTab = useCallback(() => {
    manualTabCounter++;
    const id = 'manual-' + Date.now();
    const store = useSessionStore.getState();
    const session = store.createSession(id, `Terminal ${manualTabCounter}`, '');
    session.isManual = true;
    store.switchSession(id);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-bg-deep text-text-primary">
      <TopBar isConnected={isConnected} onNewTab={createManualTab} />
      {viewMode === 'detail' ? (
        <DetailLayout wsRef={ws} onNewTab={createManualTab} />
      ) : (
        <GridLayout onNewTab={createManualTab} />
      )}
    </div>
  );
}
