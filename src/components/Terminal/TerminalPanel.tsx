import { useEffect, useRef, useCallback, useState } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import type { Session } from '@/types';

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

// 모듈 스코프 카운터 — HMR 시에도 ID 충돌 방지 (monotonic)
let termCounter = 0;

/** WebSocket 전송 유틸 */
function sendWs(ws: React.RefObject<WebSocket | null>, payload: Record<string, unknown>) {
  if (ws.current?.readyState === WebSocket.OPEN) {
    ws.current.send(JSON.stringify(payload));
  }
}

export function TerminalPanel({ wsRef }: TerminalPanelProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const getActiveSession = useSessionStore((s) => s.getActiveSession);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 현재 세션 ref 동기화
  const activeSession = getActiveSession();
  sessionRef.current = activeSession ?? null;

  const isManual = activeSession?.isManual;

  /** 검색바 닫기 */
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    sessionRef.current?.searchAddon?.clearDecorations();
    sessionRef.current?.term?.focus();
  }, []);

  const createTerminal = useCallback(
    async (session: Session) => {
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
        sendWs(wsRef, { type: 'terminal_input', id, data });
      });
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        sendWs(wsRef, { type: 'terminal_resize', id, cols, rows });
      });

      session.term = term;
      session.fitAddon = fitAddon;
      session.searchAddon = searchAddon;
      session.termEl = el;

      requestAnimationFrame(() => {
        fitAddon.fit();
        const { cols, rows } = term;
        sendWs(wsRef, { type: 'terminal_create', id, cols, rows });
      });
    },
    [wsRef],
  );

  // 터미널 생성 + 활성 세션 전환
  useEffect(() => {
    const session = getActiveSession();
    if (!session || !session.isManual) return;
    if (!session.term) {
      createTerminal(session);
    }
    if (containerRef.current) {
      // 이전 세션의 termEl만 숨기면 되지만, 안전하게 전체 숨김
      Array.from(containerRef.current.children).forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    }
    if (session.termEl && containerRef.current) {
      // 언마운트 후 재마운트 시 termEl이 현재 컨테이너에 없으면 다시 붙이기
      // (appendChild는 기존 부모에서 자동 분리 — DOM spec)
      if (!containerRef.current.contains(session.termEl)) {
        containerRef.current.appendChild(session.termEl);
      }
      session.termEl.style.display = 'block';
      requestAnimationFrame(() => {
        session.fitAddon?.fit();
        session.term?.focus();
      });
    }
    // 세션 전환 시 검색바 닫기
    setSearchOpen(false);
  }, [activeSessionId, createTerminal, getActiveSession]);

  // resize 핸들러 (debounce 적용)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const session = sessionRef.current;
        if (session?.fitAddon && session.isManual) {
          session.fitAddon.fit();
        }
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 키보드 단축키 (Ctrl+F / Escape)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && sessionRef.current?.isManual) {
        e.preventDefault();
        setSearchOpen((prev) => {
          if (prev) {
            // 닫기
            sessionRef.current?.searchAddon?.clearDecorations();
            sessionRef.current?.term?.focus();
            return false;
          }
          // 열기
          requestAnimationFrame(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          });
          return true;
        });
      }
      if (e.key === 'Escape') {
        setSearchOpen((prev) => {
          if (!prev) return false;
          sessionRef.current?.searchAddon?.clearDecorations();
          sessionRef.current?.term?.focus();
          return false;
        });
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  const doSearch = (direction: 'next' | 'prev') => {
    const val = searchInputRef.current?.value;
    if (!val || !sessionRef.current?.searchAddon) return;
    if (direction === 'prev') sessionRef.current.searchAddon.findPrevious(val);
    else sessionRef.current.searchAddon.findNext(val);
  };

  return (
    <div className="flex flex-col h-full bg-bg-deep">
      {/* 검색바 */}
      {searchOpen && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-bg-elevated border-b border-border">
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
            onClick={closeSearch}
            className="text-text-muted hover:text-text-primary text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* 터미널 컨테이너 */}
      <div ref={containerRef} className="flex-1 bg-terminal-bg" />
    </div>
  );
}
