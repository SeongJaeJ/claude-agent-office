import { create } from 'zustand';
import type { Session, LogEntry, AgentState } from '../types';

interface SessionStore {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  hookSessionLinks: Map<string, string>;

  createSession: (id: string, name?: string, path?: string) => Session;
  getOrCreateSession: (id: string, name?: string, path?: string) => Session;
  removeSession: (id: string) => void;
  switchSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => Session | undefined;
  getSession: (id: string) => Session | undefined;

  updateSessionName: (id: string, name: string, path?: string) => void;
  setClaudeDetected: (id: string) => void;

  // 에이전트 상태
  updateAgentState: (sessionId: string, agentId: string, state: AgentState['state'], message?: string) => void;

  // 로그
  addLog: (sessionId: string, log: LogEntry) => void;

  // 탭 알람
  flashTabDone: (sessionId: string) => void;
  clearTabAlarm: (sessionId: string) => void;

  // 훅 세션 링크
  findLinkedManualSession: (hookSessionId: string, agentOfficeTermId?: string) => Session | null;
  linkSession: (hookSessionId: string, manualSessionId: string) => void;
  unlinkSession: (hookSessionId: string) => void;

  // 강제 리렌더링 트리거
  _tick: number;
  forceUpdate: () => void;
}

function createEmptySession(id: string, name?: string, path?: string): Session {
  return {
    id,
    name: name || id,
    path: path || '',
    logs: [],
    stats: { tools: 0, agents: 0, startTime: Date.now() },
    agentStates: {},
    activeAgents: new Set(),
    termId: null,
    term: null,
    fitAddon: null,
    searchAddon: null,
    termEl: null,
    isManual: false,
    claudeDetected: false,
    linkedHookSessionId: null,
    idleTimers: {},
    alarm: false,
  };
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  hookSessionLinks: new Map(),
  _tick: 0,

  forceUpdate: () => set((s) => ({ _tick: s._tick + 1 })),

  createSession: (id, name, path) => {
    const session = createEmptySession(id, name, path);
    const sessions = new Map(get().sessions);
    sessions.set(id, session);
    set({ sessions });
    return session;
  },

  getOrCreateSession: (id, name, path) => {
    const { sessions } = get();
    if (!sessions.has(id)) {
      const session = createEmptySession(id, name, path);
      const newSessions = new Map(sessions);
      newSessions.set(id, session);
      const update: Partial<SessionStore> = { sessions: newSessions };
      if (!get().activeSessionId) update.activeSessionId = id;
      set(update);
      return session;
    }
    const s = sessions.get(id)!;
    let changed = false;
    if (name && name !== s.name) { s.name = name; changed = true; }
    if (path) { s.path = path; changed = true; }
    if (changed) get().forceUpdate();
    return s;
  },

  removeSession: (id) => {
    const { sessions, activeSessionId, hookSessionLinks } = get();
    const session = sessions.get(id);
    if (session) {
      Object.values(session.idleTimers).forEach(clearTimeout);
      // xterm 인스턴스 및 DOM 정리
      if (session.term) {
        session.term.dispose();
        session.term = null;
      }
      if (session.termEl) {
        session.termEl.remove();
        session.termEl = null;
      }
      session.fitAddon = null;
      session.searchAddon = null;
      if (session.linkedHookSessionId) {
        hookSessionLinks.delete(session.linkedHookSessionId);
      }
    }
    const newSessions = new Map(sessions);
    newSessions.delete(id);

    let newActive = activeSessionId;
    if (activeSessionId === id) {
      newActive = newSessions.keys().next().value ?? null;
    }
    set({ sessions: newSessions, activeSessionId: newActive });
  },

  switchSession: (id) => {
    get().clearTabAlarm(id);
    set({ activeSessionId: id });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return activeSessionId ? sessions.get(activeSessionId) : undefined;
  },

  getSession: (id) => get().sessions.get(id),

  updateSessionName: (id, name, path) => {
    const session = get().sessions.get(id);
    if (session) {
      session.name = name;
      if (path) session.path = path;
      get().forceUpdate();
    }
  },

  setClaudeDetected: (id) => {
    const session = get().sessions.get(id);
    if (!session || session.claudeDetected) return;
    session.claudeDetected = true;
    // 병합은 agent_office_term_id 기반 findLinkedManualSession에서만 처리
    // 맹목적 병합 제거 — 프로젝트가 다른 세션을 잘못 합치는 버그 방지
    get().forceUpdate();
  },

  updateAgentState: (sessionId, agentId, state, message) => {
    const session = get().sessions.get(sessionId);
    if (!session) return;
    session.agentStates[agentId] = { state, message: message || '' };
    if (state === 'working') session.activeAgents.add(agentId);
    else session.activeAgents.delete(agentId);

    // done→idle 타이머
    if (session.idleTimers[agentId]) {
      clearTimeout(session.idleTimers[agentId]);
      delete session.idleTimers[agentId];
    }

    if (state === 'done') {
      const delay = session.activeAgents.size > 0 ? 18000 : 8000;
      session.idleTimers[agentId] = setTimeout(() => {
        delete session.idleTimers[agentId];
        const s = get().sessions.get(sessionId);
        if (s && !s.activeAgents.has(agentId)) {
          if (agentId.startsWith('dyn-')) {
            // 동적 에이전트는 agentStore에서 제거 (lazy import 회피 — 외부에서 처리)
            delete s.agentStates[agentId];
            s.activeAgents.delete(agentId);
            get().forceUpdate();
          } else {
            get().updateAgentState(sessionId, agentId, 'idle');
          }
        }
      }, delay);
    }

    get().forceUpdate();
  },

  addLog: (sessionId, log) => {
    const session = get().sessions.get(sessionId);
    if (!session) return;
    session.logs.push(log);
    if (session.logs.length > 1000) session.logs.splice(0, session.logs.length - 1000);
    get().forceUpdate();
  },

  flashTabDone: (sessionId) => {
    const { activeSessionId } = get();
    if (sessionId === activeSessionId) return;
    const session = get().sessions.get(sessionId);
    if (session) {
      session.alarm = true;
      session.activeAgents.clear();
    }
    get().forceUpdate();
  },

  clearTabAlarm: (sessionId) => {
    const session = get().sessions.get(sessionId);
    if (session) {
      session.alarm = false;
      session.activeAgents.clear();
    }
  },

  findLinkedManualSession: (hookSessionId, agentOfficeTermId) => {
    const { sessions, hookSessionLinks } = get();

    // 이미 링크된 경우
    if (hookSessionLinks.has(hookSessionId)) {
      const manualId = hookSessionLinks.get(hookSessionId)!;
      if (sessions.has(manualId)) return sessions.get(manualId)!;
      hookSessionLinks.delete(hookSessionId);
    }

    // Agent Office 터미널 ID로 정확히 매칭
    if (agentOfficeTermId) {
      for (const [, s] of sessions) {
        if (s.isManual && s.termId === agentOfficeTermId && !s.linkedHookSessionId) {
          hookSessionLinks.set(hookSessionId, s.id);
          s.linkedHookSessionId = hookSessionId;
          return s;
        }
      }
    }

    // agent_office_term_id 없는 외부 세션은 모니터링 탭으로만 표시
    // 맹목적 매칭 제거 — 프로젝트가 다른 세션 잘못 링크 방지
    return null;
  },

  linkSession: (hookSessionId, manualSessionId) => {
    get().hookSessionLinks.set(hookSessionId, manualSessionId);
  },

  unlinkSession: (hookSessionId) => {
    get().hookSessionLinks.delete(hookSessionId);
  },
}));
