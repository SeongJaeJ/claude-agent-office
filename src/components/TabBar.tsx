import { useSessionStore } from '../stores/useSessionStore';

interface TabBarProps {
  onNewTab: () => void;
}

export function TabBar({ onNewTab }: TabBarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  // 리렌더 트리거
  useSessionStore((s) => s._tick);

  const sessionList = [...sessions.values()];

  if (sessionList.length === 0) {
    return (
      <div className="tab-bar">
        <button className="tab-new" onClick={onNewTab}>+ New</button>
        <div className="tab-empty">세션 대기 중...</div>
      </div>
    );
  }

  return (
    <div className="tab-bar">
      {sessionList.map((session) => {
        const isActive = session.id === activeSessionId;
        const hasActivity = session.activeAgents.size > 0;
        const className = [
          'tab',
          isActive && 'active',
          session.alarm && !isActive && 'alarm',
          hasActivity && !isActive && !session.alarm && 'has-activity',
        ].filter(Boolean).join(' ');

        const typeClass = session.isManual ? 'interactive' : 'monitoring';
        const typeIcon = session.isManual ? '▶' : '◉';
        const typeLabel = session.isManual ? 'Interactive' : 'Monitoring';

        return (
          <div
            key={session.id}
            className={className}
            onClick={() => switchSession(session.id)}
          >
            <span className={`tab-type ${typeClass}`}>{typeIcon} {typeLabel}</span>
            <span className="tab-name">{session.name}</span>
            {session.isManual && (
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(session.id);
                }}
              >
                ×
              </span>
            )}
          </div>
        );
      })}
      <button className="tab-new" onClick={onNewTab}>+ New</button>
    </div>
  );
}
