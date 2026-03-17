import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Session, LogEntry } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 세션 상태 판별 — 모든 뷰에서 동일 로직 사용 */
export function getSessionStatus(session: Session): 'working' | 'interactive' | 'idle' {
  if (session.activeAgents.size > 0) return 'working';
  if (session.isManual) return 'interactive';
  return 'idle';
}

/** 에러 로그 판별 — 모든 곳에서 동일 기준 사용 */
export function isErrorLog(log: LogEntry): boolean {
  return log.detailType === 'error' || log.message.includes('⚠') || log.message.includes('Error');
}

/** WeakMap 기반 안정적 키 생성 팩토리 */
export function createStableKeyFn<T extends object>(prefix: string) {
  let counter = 0;
  const map = new WeakMap<T, string>();
  return (item: T): string => {
    let key = map.get(item);
    if (!key) {
      key = `${prefix}-${++counter}`;
      map.set(item, key);
    }
    return key;
  };
}

/** 경과 시간 포맷 */
export function formatElapsed(startTime: number): string {
  if (!startTime) return '';
  const diff = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
