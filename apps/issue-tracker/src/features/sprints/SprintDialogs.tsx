import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CompleteSprintDialog, type CompletableSprint } from './CompleteSprintDialog';
import { SprintDialog, type EditableSprint } from './SprintDialog';

type SprintDialogsApi = {
  /** Create (no sprint) or edit a sprint of a team. */
  openEditor: (teamId: string, sprint?: EditableSprint | null) => void;
  openComplete: (sprint: CompletableSprint) => void;
};

const Ctx = createContext<SprintDialogsApi | null>(null);

/**
 * One editor and one completion dialog for a whole page, so any card, row or
 * menu can open them. Targets outlive the open flags so a dialog's title
 * doesn't flip during its close animation.
 */
export function SprintDialogsProvider({ children }: { children: ReactNode }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<{ teamId: string; sprint: EditableSprint | null } | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState<CompletableSprint | null>(null);

  const openEditor = useCallback((teamId: string, sprint?: EditableSprint | null) => {
    setEditor({ teamId, sprint: sprint ?? null });
    setEditorOpen(true);
  }, []);
  const openComplete = useCallback((sprint: CompletableSprint) => {
    setCompleting(sprint);
    setCompleteOpen(true);
  }, []);
  const api = useMemo(() => ({ openEditor, openComplete }), [openEditor, openComplete]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {editor && <SprintDialog open={editorOpen} onOpenChange={setEditorOpen} teamId={editor.teamId} sprint={editor.sprint} />}
      {completing && <CompleteSprintDialog open={completeOpen} onOpenChange={setCompleteOpen} sprint={completing} />}
    </Ctx.Provider>
  );
}

export function useSprintDialogs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSprintDialogs must be used inside SprintDialogsProvider');
  return ctx;
}
