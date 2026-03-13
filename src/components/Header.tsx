interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
  return (
    <div className="header">
      <div className="header-left">
        <h1>AGENT OFFICE</h1>
        <span className="subtitle">Live Dashboard</span>
      </div>
      <span className={`ws-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
      </span>
    </div>
  );
}
