import { useCallback, useRef, useState } from 'react';
import type { ProjectState } from '../cad/types';

type Update = ProjectState | ((previous: ProjectState) => ProjectState);
type EditorState = { project: ProjectState; history: string[]; historyIdx: number };

// Native pointer callbacks may dispatch several actions before React renders.
// Publish each action immediately so the next one uses the latest state.
export function useProjectHistory(initialProject: ProjectState) {
  const [state, render] = useState<EditorState>(() => ({
    project: initialProject, history: [JSON.stringify(initialProject)], historyIdx: 0,
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
    if (pushHistory) {
      const snap = JSON.stringify(project);
      if (history[historyIdx] !== snap) {
        history = [...history.slice(0, historyIdx + 1), snap].slice(-50);
        historyIdx = history.length - 1;
      }
    }
    if (project !== previous.project || history !== previous.history) {
      publish({ project, history, historyIdx });
    }
  }, [publish]);
  const setProject = useCallback((update: Update) => commitState(update, false), [commitState]);
  const resetHistory = useCallback((project: ProjectState) => {
    publish({ project, history: [JSON.stringify(project)], historyIdx: 0 });
  }, [publish]);
  const travelHistory = useCallback((direction: -1 | 1, normalize: (p: ProjectState) => ProjectState) => {
    const previous = current.current;
    const index = previous.historyIdx + direction;
    if (index < 0 || index >= previous.history.length) return false;
    const project = normalize(JSON.parse(previous.history[index]) as ProjectState);
    publish({ ...previous, project, historyIdx: index });
    return true;
  }, [publish]);
  const getProject = useCallback(() => current.current.project, []);
  return { ...state, setProject, commitState, resetHistory, travelHistory, getProject };
}
