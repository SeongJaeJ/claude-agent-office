import { useRef, useCallback } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { TerminalPanel } from './TerminalPanel';
import { MonitorLogPanel } from './MonitorLogPanel';

interface RightPanelProps {
  wsRef: React.RefObject<WebSocket | null>;
}

function shellQuote(path: string) {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

export function RightPanel({ wsRef }: RightPanelProps) {
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const panelRef = useRef<HTMLDivElement>(null);
  // 리렌더 트리거
  useSessionStore((s) => s._tick);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (activeSession?.term && activeSession.isManual) {
        panelRef.current?.classList.add('drop-highlight');
      }
    },
    [activeSession],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!panelRef.current?.contains(e.relatedTarget as Node)) {
      panelRef.current?.classList.remove('drop-highlight');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      panelRef.current?.classList.remove('drop-highlight');
      if (!activeSession?.term || !activeSession.isManual) return;

      const uri = e.dataTransfer.getData('text/uri-list');
      if (uri) {
        const paths = uri
          .split('\n')
          .filter((l) => l.startsWith('file://'))
          .map((l) => {
            try {
              return decodeURIComponent(new URL(l.trim()).pathname);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];
        if (paths.length > 0) {
          const input = paths.map(shellQuote).join(' ');
          activeSession.term.paste(input);
          return;
        }
      }

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const formData = new FormData();
        for (const f of files) formData.append('files', f, f.name);
        fetch('/api/upload', { method: 'POST', body: formData })
          .then((r) => r.json())
          .then((data) => {
            if (data.paths?.length) {
              const input = data.paths.map(shellQuote).join(' ');
              activeSession.term?.paste(input);
            }
          })
          .catch(() => {
            const names = Array.from(files)
              .map((f) => shellQuote(f.name))
              .join(' ');
            activeSession.term?.paste(names);
          });
      }
    },
    [activeSession],
  );

  const isManual = activeSession?.isManual;

  return (
    <div
      ref={panelRef}
      className="right-panel"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isManual ? (
        <TerminalPanel wsRef={wsRef} />
      ) : (
        <MonitorLogPanel />
      )}
    </div>
  );
}
