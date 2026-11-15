import { uid } from './doorRules';
import { buildPresetProject, PresetMode } from './presets';
import { ProjectState } from './types';

export interface SavedProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  preferredMode?: '2d' | '3d' | 'ar';
  wallCount: number;
  boxCount: number;
  state: ProjectState;
}

const PROJECTS_LIST_KEY = 'kichiyar_projects_v2';
const ACTIVE_PROJECT_ID_KEY = 'kichiyar_active_project_id_v2';
const LEGACY_SINGLE_KEY = 'cabinet_cad_project_v2';

function summarizeState(state: ProjectState) {
  const wallCount = state.walls?.length || 0;
  const boxCount = (state.walls || []).reduce((sum, w) => sum + (w.boxes?.length || 0), 0);
  return { wallCount, boxCount };
}

export function loadProjectsList(): SavedProjectRecord[] {
  try {
    const raw = localStorage.getItem(PROJECTS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedProjectRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    }
  } catch {
    // ignore storage errors
  }

  // Migrate single project from v2 key or seed one crisp L-shaped sample
  try {
    const legacyRaw = localStorage.getItem(LEGACY_SINGLE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as ProjectState;
      if (parsed && Array.isArray(parsed.walls)) {
        const sum = summarizeState(parsed);
        const rec: SavedProjectRecord = {
          id: uid('proj'),
          name: 'آشپزخانه من',
          updatedAt: Date.now(),
          preferredMode: '2d',
          wallCount: sum.wallCount,
          boxCount: sum.boxCount,
          state: parsed,
        };
        saveProjectsList([rec]);
        setActiveProjectId(rec.id);
        return [rec];
      }
    }
  } catch {
    // ignore
  }

  const starter = buildPresetProject('L');
  const sum = summarizeState(starter);
  const initialRec: SavedProjectRecord = {
    id: uid('proj'),
    name: 'نمونه آشپزخانه L-شکل',
    updatedAt: Date.now(),
    preferredMode: '2d',
    wallCount: sum.wallCount,
    boxCount: sum.boxCount,
    state: starter,
  };
  saveProjectsList([initialRec]);
  setActiveProjectId(initialRec.id);
  return [initialRec];
}

export function saveProjectsList(list: SavedProjectRecord[]): void {
  try {
    localStorage.setItem(PROJECTS_LIST_KEY, JSON.stringify(list));
  } catch {
    // ignore storage quota
  }
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id);
  } catch {
    // ignore
  }
}

export function upsertProjectRecord(
  list: SavedProjectRecord[],
  id: string,
  name: string,
  state: ProjectState,
  preferredMode?: '2d' | '3d' | 'ar'
): SavedProjectRecord[] {
  const sum = summarizeState(state);
  const existingIdx = list.findIndex((p) => p.id === id);
  const record: SavedProjectRecord = {
    id,
    name: name.trim() || 'پروژه بدون عنوان',
    updatedAt: Date.now(),
    preferredMode: preferredMode || (existingIdx >= 0 ? list[existingIdx].preferredMode : '2d'),
    wallCount: sum.wallCount,
    boxCount: sum.boxCount,
    state,
  };
  const next =
    existingIdx >= 0
      ? list.map((p, idx) => (idx === existingIdx ? record : p))
      : [record, ...list];
  const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
  saveProjectsList(sorted);
  try {
    localStorage.setItem(LEGACY_SINGLE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  return sorted;
}

export function createProjectRecord(
  name: string,
  mode: '2d' | '3d' | 'ar',
  preset?: PresetMode
): SavedProjectRecord {
  const state: ProjectState = preset
    ? buildPresetProject(preset)
    : {
        walls: [],
        cornerOwners: {},
        activeWallId: null,
        activeBoxId: null,
        selectedDoorId: null,
        selectedOpeningId: null,
        selectedApplianceId: null,
        selectedShelfId: null,
        selectedHandleId: null,
        selectedFrameId: null,
        selectedUnitDivider: null,
        selectedUnit: null,
        doorsLocked: false,
        doorsHidden: false,
        designStyle: 'modern',
        cabinetFinish: 'warm-white',
        backsplashFinish: 'calacatta-marble',
        countertopFinish: 'dark-quartz',
        skipStylePrompt: false,
      };
  const sum = summarizeState(state);
  return {
    id: uid('proj'),
    name,
    updatedAt: Date.now(),
    preferredMode: mode,
    wallCount: sum.wallCount,
    boxCount: sum.boxCount,
    state,
  };
}
