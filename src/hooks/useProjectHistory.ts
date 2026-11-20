import { useCallback, useRef, useState } from 'react';
import type { ProjectState } from '../cad/types';

type Update = ProjectState | ((previous: ProjectState) => ProjectState);
type EditorState = { project: ProjectState; history: string[]; historyIdx: number };

function safeStringify(project: ProjectState): string | null {
  try {
    return JSON.stringify(project);
  } catch {
    return null;
  }
}

function safeParse(snap: string): ProjectState | null {
  try {
    return JSON.parse(snap) as ProjectState;
  } catch {
    return null;
  }
}

// Native pointer callbacks may dispatch several actions before React renders.
// Publish each action immediately so the next one uses the latest state.
export function useProjectHistory(initialProject: ProjectState) {
  const [state, render] = useState<EditorState>(() => ({
    project: initialProject,
    history: [safeStringify(initialProject) ?? '{}'],
    historyIdx: 0,
  }));
  const current = useRef(state);

  const publish = useCallback((next: EditorState) => {
    current.current = next;
    render(next);
  }, []);

  const commitState = useCallback((update: Update, pushHistory = true) => {
    const previous = current.current;
    const project = typeof update === 'function' ? update(previous.project) : update;
    let { history, historyIdx } = previous;
    const snap = safeStringify(project);
    if (pushHistory && snap !== null) {
      if (history[historyIdx] !== snap) {
        history = [...history.slice(0, historyIdx + 1), snap].slice(-50);
        historyIdx = history.length - 1;
      }
    }
    const mutatedInPlace = snap !== null && snap !== history[historyIdx];
    if (project !== previous.project || history !== previous.history || mutatedInPlace) {
      publish({ project, history, historyIdx });
    }
  }, [publish]);

  const setProject = useCallback((update: Update) => commitState(update, false), [commitState]);

  const resetHistory = useCallback((project: ProjectState) => {
    publish({ project, history: [safeStringify(project) ?? '{}'], historyIdx: 0 });
  }, [publish]);

  const travelHistory = useCallback((direction: -1 | 1, normalize: (p: ProjectState) => ProjectState) => {
    const previous = current.current;
    // If live project has uncommitted edits from setProject() and user hits Undo,
    // first revert to the current snapshot instead of skipping two steps back.
    if (direction === -1) {
      const liveSnap = safeStringify(previous.project);
      const currentSnap = previous.history[previous.historyIdx];
      if (liveSnap && currentSnap && liveSnap !== currentSnap) {
        const parsed = safeParse(currentSnap);
        if (parsed) {
          const nextHistory = [...previous.history.slice(0, previous.historyIdx + 1), liveSnap].slice(-50);
          const restoredIdx = Math.min(previous.historyIdx, nextHistory.length - 2);
          publish({ project: normalize(parsed), history: nextHistory, historyIdx: Math.max(0, restoredIdx) });
          return true;
        }
      }
    }
    const index = previous.historyIdx + direction;
    if (index < 0 || index >= previous.history.length) return false;
    const parsed = safeParse(previous.history[index]);
    if (!parsed) return false;
    const project = normalize(parsed);
    publish({ ...previous, project, historyIdx: index });
    return true;
  }, [publish]);

  const getProject = useCallback(() => current.current.project, []);
  return { ...state, setProject, commitState, resetHistory, travelHistory, getProject };
}
