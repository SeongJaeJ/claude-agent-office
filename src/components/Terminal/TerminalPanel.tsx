import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';

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
  useSessionStore((s) => s._tick);

  const isManual = activeSession?.isManual;

  const createTerminal = useCallback(
    async (session: any) => {
      if (session.term || !containerRef.current) return;
      const { Terminal, FitAddon, WebLinksAddon, SearchAddon } = await loadXtermModules();
      const id = 'term-' + ++termCounter;
      session.termId = id;

      const term = new Terminal({
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        theme: {
          background: '#08090f',
          foreground: '#c8d6e5',
          cursor: '#00d4ff',
          selectionBackground: '#264f78',
          black: '#1a1a2e',
          red: '#ff3d71',
          green: '#00ff88',
          yellow: '#ffb800',
          blue: '#00d4ff',
          magenta: '#a78bfa',
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

  useEffect(() => {
    if (!activeSession || !isManual) return;
    if (!activeSession.term) {
      createTerminal(activeSession);
    }
    if (containerRef.current) {
      Array.from(containerRef.current.children).forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    }
    if (activeSession.termEl) {
      activeSession.termEl.style.display = 'block';
      requestAnimationFrame(() => {
        activeSession.fitAddon?.fit();
        activeSession.term?.focus();
      });
    }
  }, [activeSession?.id, isManual, createTerminal, activeSession]);

  useEffect(() => {
    const handleResize = () => {
      if (activeSession?.fitAddon && isManual) {
        activeSession.fitAddon.fit();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeSession, isManual]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && isManual) {
        e.preventDefault();
        searchBarRef.current?.classList.toggle('search-visible');
        if (searchBarRef.current?.classList.contains('search-visible')) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          activeSession?.searchAddon?.clearDecorations();
          activeSession?.term?.focus();
        }
      }
      if (e.key === 'Escape' && searchBarRef.current?.classList.contains('search-visible')) {
        searchBarRef.current.classList.remove('search-visible');
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
    <div className="flex flex-col h-full bg-bg-deep">
      {/* 헤더 */}
      <div className="flex items-center px-3.5 py-2 gap-1.5 border-b border-border bg-bg-card shrink-0">
        <span className="w-[9px] h-[9px] rounded-full bg-[#ff5f56]" />
        <span className="w-[9px] h-[9px] rounded-full bg-[#ffbd2e]" />
        <span className="w-[9px] h-[9px] rounded-full bg-[#27c93f]" />
        <span className="text-[11px] text-text-muted font-mono ml-1.5">
          {activeSession?.name} — zsh
        </span>
      </div>

      {/* 검색바 */}
      <div
        ref={searchBarRef}
        className="hidden items-center gap-1 px-3 py-1.5 bg-bg-elevated border-b border-border [&.search-visible]:flex"
      >
        <input
          ref={searchInputRef}
          type="text"
          placeholder="검색..."
          className="flex-1 bg-bg-card border border-border rounded px-2 py-1 text-xs text-text-primary font-mono outline-none focus:border-accent-cyan"
          onKeyDown={(e) => {
            if (e.key === 'Enter') doSearch(e.shiftKey ? 'prev' : 'next');
          }}
          onInput={() => doSearch('next')}
        />
        <button onClick={() => doSearch('prev')} className="text-text-muted hover:text-text-primary text-xs px-1">▲</button>
        <button onClick={() => doSearch('next')} className="text-text-muted hover:text-text-primary text-xs px-1">▼</button>
        <button
          onClick={() => {
            searchBarRef.current?.classList.remove('search-visible');
            activeSession?.searchAddon?.clearDecorations();
            activeSession?.term?.focus();
          }}
          className="text-text-muted hover:text-text-primary text-xs px-1"
        >
          ✕
        </button>
      </div>

      {/* 터미널 컨테이너 */}
      <div ref={containerRef} className="flex-1 bg-terminal-bg" />
    </div>
  );
}
