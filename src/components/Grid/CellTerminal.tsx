import { useRef, useEffect, useMemo, useCallback } from 'react';
import type { Session } from '@/types';

interface CellTerminalProps {
  session: Session;
}

/**
 * 그리드 셀용 터미널 미니뷰
 * 로그 기반 텍스트 미러 — Detail 뷰에서 실제 xterm 인스턴스 사용
 */
export function CellTerminal({ session }: CellTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const termLines = useMemo(() => {
    return session.logs
      .slice(-30)
      .filter((l) => l.toolName || l.detailType === 'assistant-text')
      .map((l) => ({ msg: l.message, key: `${l.time}-${l.message.slice(0, 20)}` }))
      .slice(-15);
  }, [session.logs.length]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  useEffect(() => {
    if (containerRef.current && isAtBottomRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [termLines.length]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 bg-terminal-bg font-mono text-[9px] leading-relaxed p-2 overflow-y-auto min-h-0"
    >
      {termLines.map((line) => (
        <div key={line.key} className="text-text-secondary truncate">
          <span className="text-accent-cyan mr-1">$</span>
          {line.msg}
        </div>
      ))}
      {termLines.length === 0 && (
        <div className="text-text-dim text-center py-4 text-[9px]">
          터미널 출력이 여기에 표시됩니다
        </div>
      )}
    </div>
  );
}
