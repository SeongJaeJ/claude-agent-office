import { Plus } from 'lucide-react';

interface AddProjectCellProps {
  onAdd: () => void;
}

export function AddProjectCell({ onAdd }: AddProjectCellProps) {
  return (
    <div
      onClick={onAdd}
      className="rounded-xl border-2 border-dashed border-border bg-bg-surface/30 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-accent-cyan/40 hover:bg-bg-card/30 transition-all group min-h-[280px]"
    >
      <div className="w-10 h-10 rounded-lg border border-border bg-bg-card flex items-center justify-center group-hover:border-accent-cyan/30 group-hover:shadow-[0_0_12px_rgba(0,212,255,0.08)] transition-all">
        <Plus size={18} className="text-text-muted group-hover:text-accent-cyan transition-colors" />
      </div>
      <span className="text-[11px] font-medium text-text-muted group-hover:text-text-secondary transition-colors">
        New Session
      </span>
    </div>
  );
}
