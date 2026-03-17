import { ProjectGrid } from '@/components/Grid/ProjectGrid';

interface GridLayoutProps {
  onNewTab: () => void;
}

export function GridLayout({ onNewTab }: GridLayoutProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg-deep">
      <ProjectGrid onNewTab={onNewTab} />
    </div>
  );
}
