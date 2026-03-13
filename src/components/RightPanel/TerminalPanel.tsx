import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';

interface TerminalPanelProps {
  wsRef: React.RefObject<WebSocket | null>;
}

let xtermModules: any = null;

async function loadXtermModules() {
  if (xtermModules) return xtermModules;
  const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { SearchAddon }] =
    await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
      import('@xterm/addon-search'),
    ]);
  xtermModules = { Terminal, FitAddon, WebLinksAddon, SearchAddon };
  return xtermModules;
}

let termCounter = 0;

export function TerminalPanel({ wsRef }: TerminalPanelProps) {
  const activeSession = useSessionStore((s) => s.getActiveSession());
  const containerRef = useRef<HTMLDivElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 리렌더 트리거
  useSessionStore((s) => s._tick);

  const isManual = activeSession?.isManual;

  // 터미널 생성
  const createTerminal = useCallback(
    async (session: any) => {
      if (session.term || !containerRef.current) return;
      const { Terminal, FitAddon, WebLinksAddon, SearchAddon } =
        await loadXtermModules();
      const id = 'term-' + ++termCounter;
      session.termId = id;

      const term = new Terminal({
        fontFamily: "'Courier New', monospace",
        fontSize: 13,
        theme: {
          background: '#0a0a16',
          foreground: '#c8d6e5',
          cursor: '#e94560',
          selectionBackground: '#264f78',
          black: '#1a1a2e',
          red: '#e94560',
          green: '#6bcb77',
          yellow: '#ffd93d',
          blue: '#4d96ff',
          magenta: '#c084fc',
          cyan: '#20c997',
          white: '#c8d6e5',
          brightBlack: '#555',
          brightRed: '#ff6b6b',
          brightGreen: '#85e89d',
          brightYellow: '#ffe066',
          brightBlue: '#79b8ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#ffffff',
        },
        cursorBlink: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.loadAddon(searchAddon);

      const el = document.createElement('div');
      el.style.cssText = 'width:100%;height:100%;';
      el.id = `term-el-${id}`;
      containerRef.current.appendChild(el);
      term.open(el);

      term.onData((data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'terminal_input', id, data }));
        }
      });
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'terminal_resize', id, cols, rows }));
        }
      });

      session.term = term;
      session.fitAddon = fitAddon;
      session.searchAddon = searchAddon;
      session.termEl = el;

      requestAnimationFrame(() => {
        fitAddon.fit();
        const { cols, rows } = term;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'terminal_create', id, cols, rows }));
        }
      });
    },
    [wsRef],
  );

  // 세션 변경 시 터미널 전환
  useEffect(() => {
    if (!activeSession || !isManual) return;
    if (!activeSession.term) {
      createTerminal(activeSession);
    }

    // 모든 터미널 엘리먼트 숨기기
    if (containerRef.current) {
      Array.from(containerRef.current.children).forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    }

    // 현재 세션 터미널 표시
    if (activeSession.termEl) {
      activeSession.termEl.style.display = 'block';
      requestAnimationFrame(() => {
        activeSession.fitAddon?.fit();
        activeSession.term?.focus();
      });
    }
  }, [activeSession?.id, isManual, createTerminal, activeSession]);

  // 리사이즈
  useEffect(() => {
    const handleResize = () => {
      if (activeSession?.fitAddon && isManual) {
        activeSession.fitAddon.fit();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeSession, isManual]);

  // Ctrl+F 검색
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && isManual) {
        e.preventDefault();
        searchBarRef.current?.classList.toggle('visible');
        if (searchBarRef.current?.classList.contains('visible')) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          activeSession?.searchAddon?.clearDecorations();
          activeSession?.term?.focus();
        }
      }
      if (e.key === 'Escape' && searchBarRef.current?.classList.contains('visible')) {
        searchBarRef.current.classList.remove('visible');
        activeSession?.searchAddon?.clearDecorations();
        activeSession?.term?.focus();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [activeSession, isManual]);

  const doSearch = (direction: 'next' | 'prev') => {
    const val = searchInputRef.current?.value;
    if (!val || !activeSession?.searchAddon) return;
    if (direction === 'prev') activeSession.searchAddon.findPrevious(val);
    else activeSession.searchAddon.findNext(val);
  };

  if (!isManual) return null;

  return (
    <div className="terminal-panel" id="terminalPanel">
      <div className="terminal-header">
        <span className="terminal-title">TERMINAL</span>
        <span style={{ color: '#666', fontSize: '12px', marginLeft: '8px' }}>
          {activeSession?.name}
        </span>
      </div>
      <div ref={searchBarRef} className="terminal-search-bar">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="검색..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') doSearch(e.shiftKey ? 'prev' : 'next');
          }}
          onInput={() => doSearch('next')}
        />
        <button onClick={() => doSearch('prev')}>▲</button>
        <button onClick={() => doSearch('next')}>▼</button>
        <button
          onClick={() => {
            searchBarRef.current?.classList.remove('visible');
            activeSession?.searchAddon?.clearDecorations();
            activeSession?.term?.focus();
          }}
        >
          ✕
        </button>
      </div>
      <div ref={containerRef} className="terminal-container" id="terminalContainer" />
    </div>
  );
}
