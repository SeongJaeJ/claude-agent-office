import { create } from 'zustand';
import type { AgentConfig, AgentServerConfig } from '../types';
import { releaseAgentSprite } from '../utils/sprites';

const COLOR_PALETTE = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c084fc', '#ff922b',
  '#f06595', '#20c997', '#339af0', '#845ef7', '#e8590c', '#0ca678',
];
const SKIN_TONES = ['#d4a574', '#e8c4a0', '#e0b090', '#c49060', '#f0d0b0'];
const HAIR_COLORS = ['#333', '#8B0000', '#654321', '#2c2c2c', '#1a1a3e', '#4a2a6a', '#8B4513'];

interface AgentStore {
  agents: AgentConfig[];
  dynAgentCounter: number;
  pendingAgentMap: Map<string, string>;

  buildAgents: (config: AgentServerConfig) => void;
  matchSubagent: (desc: string) => string | null;
  ensureDynamicAgent: (type: string, desc: string) => string;
  findDynamicAgent: (desc: string, subagentType: string) => string | null;
  removeDynamicAgent: (agentId: string) => void;
  getAgent: (id: string) => AgentConfig | undefined;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  dynAgentCounter: 0,
  pendingAgentMap: new Map(),

  buildAgents: (config) => {
    const agents: AgentConfig[] = [];
    agents.push({
      id: 'main',
      name: 'Main Agent',
      role: config.main?.role || '시니어 개발자',
      color: '#e94560',
      skin: '#d4a574',
      hair: '#333',
      shirt: '#e94560',
      isMain: true,
      keywords: ['main', '메인', '시니어'],
    });

    const allSubs = [...(config.subagents || [])];
    allSubs.forEach((agent, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      const id =
        agent.role
          .toLowerCase()
          .replace(/\s*\(.+?\)\s*/g, ' ')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || `agent-${i}`;
      const roleWords = agent.role
        .toLowerCase()
        .split(/[\s/()]+/)
        .filter((w) => w.length > 1);
      const descWords = (agent.description || '')
        .toLowerCase()
        .split(/[,·\s/()]+/)
        .filter((w) => w.length > 2)
        .slice(0, 8);
      agents.push({
        id,
        name: agent.role.replace(/\s*\(.+?\)/, '').trim(),
        role: agent.role,
        color,
        skin: SKIN_TONES[i % SKIN_TONES.length],
        hair: HAIR_COLORS[i % HAIR_COLORS.length],
        shirt: color,
        isMain: false,
        keywords: [...new Set([...roleWords, ...descWords])],
      });
    });

    set({ agents });
  },

  matchSubagent: (desc) => {
    const lower = desc.toLowerCase();
    let bestMatch: string | null = null;
    let bestScore = 0;
    for (const agent of get().agents) {
      if (agent.isMain) continue;
      const score = agent.keywords.reduce(
        (s, kw) => s + (lower.includes(kw) ? 1 : 0),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent.id;
      }
    }
    return bestScore > 0 ? bestMatch : null;
  },

  ensureDynamicAgent: (type, desc) => {
    const { pendingAgentMap, agents, dynAgentCounter } = get();
    const key = desc || type;
    if (pendingAgentMap.has(key)) return pendingAgentMap.get(key)!;

    const newCounter = dynAgentCounter + 1;
    const id = 'dyn-' + newCounter;
    const idx = agents.filter((a) => !a.isMain).length;
    const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
    const nameMap: Record<string, string> = {
      'general-purpose': 'General Agent',
      Explore: 'Explorer',
      Plan: 'Planner',
      'claude-code-guide': 'Guide Agent',
    };

    const newAgent: AgentConfig = {
      id,
      name: nameMap[type] || type,
      role: desc,
      color,
      skin: SKIN_TONES[idx % SKIN_TONES.length],
      hair: HAIR_COLORS[idx % HAIR_COLORS.length],
      shirt: color,
      isMain: false,
      keywords: [
        type.toLowerCase(),
        ...desc
          .toLowerCase()
          .split(/[\s/()]+/)
          .filter((w) => w.length > 1),
      ],
    };

    const newMap = new Map(pendingAgentMap);
    newMap.set(key, id);

    set({
      agents: [...agents, newAgent],
      dynAgentCounter: newCounter,
      pendingAgentMap: newMap,
    });

    return id;
  },

  findDynamicAgent: (desc, subagentType) => {
    const { pendingAgentMap, agents } = get();
    const key = desc || subagentType || '';
    if (pendingAgentMap.has(key)) return pendingAgentMap.get(key)!;
    const type = (subagentType || 'general-purpose').toLowerCase();
    const found = agents.find(
      (a) => a.id.startsWith('dyn-') && a.keywords?.includes(type),
    );
    return found?.id || null;
  },

  removeDynamicAgent: (agentId) => {
    const { agents, pendingAgentMap } = get();
    const idx = agents.findIndex((a) => a.id === agentId);
    if (idx === -1) return;

    releaseAgentSprite(agentId);
    const newAgents = agents.filter((a) => a.id !== agentId);
    const newMap = new Map(pendingAgentMap);
    newMap.forEach((v, k) => {
      if (v === agentId) newMap.delete(k);
    });

    set({ agents: newAgents, pendingAgentMap: newMap });
  },

  getAgent: (id) => get().agents.find((a) => a.id === id),
}));
