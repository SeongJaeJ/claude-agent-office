import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  color: string;
  skin: string;
  hair: string;
  shirt: string;
  isMain: boolean;
  keywords: string[];
}

export interface AgentState {
  state: 'idle' | 'working' | 'done';
  message: string;
}

export interface LogEntry {
  time: string;
  agentName: string;
  color: string;
  message: string;
  toolName: string | null;
  detail?: string;
  detailType?: string;
}

export interface Session {
  id: string;
  name: string;
  path: string;
  logs: LogEntry[];
  stats: { tools: number; agents: number; startTime: number };
  agentStates: Record<string, AgentState>;
  activeAgents: Set<string>;
  termId: string | null;
  term: Terminal | null;
  fitAddon: FitAddon | null;
  searchAddon: SearchAddon | null;
  termEl: HTMLDivElement | null;
  isManual: boolean;
  claudeDetected: boolean;
  linkedHookSessionId: string | null;
  idleTimers: Record<string, ReturnType<typeof setTimeout>>;
  alarm: boolean;
}

export interface ServerSession {
  id: string;
  name: string;
  path: string;
}

export interface HookEvent {
  type: string;
  session_id?: string;
  project_name?: string;
  project_path?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_response?: string;
  tool_output?: string;
  tool_error?: boolean;
  agent_office_term_id?: string;
  notification_message?: string;
  source?: string;
  agent_type?: string;
  timestamp?: number;
}

export interface TranscriptEvent {
  type: 'transcript';
  session_id: string;
  entry_type: 'user' | 'assistant' | 'tool_result';
  text?: string;
  parts?: Array<{ type: string; text?: string; tool?: string; input?: any }>;
}

export interface AgentServerConfig {
  main: { role: string; description: string } | null;
  subagents: Array<{ role: string; description: string }>;
}
