import { create } from 'zustand';

type ViewMode = 'detail' | 'grid';
type LogFilter = 'all' | 'tools' | 'agents' | 'errors';

interface ViewStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  logFilter: LogFilter;
  setLogFilter: (filter: LogFilter) => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  viewMode: 'detail',
  setViewMode: (viewMode) => set({ viewMode }),
  logFilter: 'all',
  setLogFilter: (logFilter) => set({ logFilter }),
}));
