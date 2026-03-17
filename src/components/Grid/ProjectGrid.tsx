import { useSessionStore } from '@/stores/useSessionStore';
import { ProjectCell } from './ProjectCell';
import { AddProjectCell } from './AddProjectCell';

interface ProjectGridProps {
  onNewTab: () => void;
}

export function ProjectGrid({ onNewTab }: ProjectGridProps) {
  const sessions = useSessionStore((s) => s.sessions);
  useSessionStore((s) => s._tick);

  const sessionList = [...sessions.values()];

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-3 auto-rows-min">
        {sessionList.map((session) => (
          <ProjectCell key={session.id} session={session} />
        ))}
        <AddProjectCell onAdd={onNewTab} />
      </div>
    </div>
  );
}
