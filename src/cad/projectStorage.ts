import { logDiagnostic } from '../utils/diagnostics';
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
export const STORAGE_STATUS_EVENT = 'kitchyar-storage-status';
let storageFailure: string | null = null;
let unreadableProjects = false;
const failedWrites = new Set<string>();

export function getStorageFailure() { return storageFailure; }

export function resetStorageFailure(): void {
  unreadableProjects = false;
  failedWrites.clear();
  updateStorageStatus();
}

function updateStorageStatus() {
  const next = unreadableProjects
    ? 'خواندن لیست پروژه‌های ذخیره‌شده با خطا مواجه شد؛ برای جلوگیری از حذف داده‌ها ذخیره خودکار متوقف شده است.'
    : failedWrites.size
      ? 'ذخیره پروژه در حافظه مرورگر ناموفق بود (ممکن است حافظه پر شده باشد).'
      : null;
  if (next === storageFailure) return;
  storageFailure = next;
  window.dispatchEvent(new Event(STORAGE_STATUS_EVENT));
}

function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    failedWrites.delete(key);
    updateStorageStatus();
    return true;
  } catch (error) {
    if (!failedWrites.has(key)) logDiagnostic('project-save-failed', error);
    failedWrites.add(key);
    updateStorageStatus();
    return false;
  }
}

function summarizeState(state: ProjectState) {
  const wallCount = state.walls?.length || 0;
  const boxCount = (state.walls || []).reduce((sum, w) => sum + (w.boxes?.length || 0), 0);
  return { wallCount, boxCount };
}

function safeTimestamp(ts: unknown): number {
  return typeof ts === 'number' && Number.isFinite(ts) ? ts : 0;
}

export function loadProjectsList(): SavedProjectRecord[] {
  try {
    const raw = localStorage.getItem(PROJECTS_LIST_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as SavedProjectRecord[];
      if (!Array.isArray(parsed) || parsed.some(p => !p || !p.id || !p.state || !Array.isArray(p.state.walls))) {
        throw new Error('Invalid saved project list');
      }
      // Respect an explicitly emptied project list instead of resurrecting deleted/sample projects
      return parsed.sort((a, b) => safeTimestamp(b.updatedAt) - safeTimestamp(a.updatedAt));
    }
  } catch (error) {
    unreadableProjects = true;
    logDiagnostic('project-load-failed', error);
    updateStorageStatus();
  }

  // Migrate single project from v2 key or seed one crisp L-shaped sample on first-ever launch
  try {
    const legacyRaw = localStorage.getItem(LEGACY_SINGLE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as ProjectState;
      if (parsed && Array.isArray(parsed.walls)) {
        const sum = summarizeState(parsed);
        const rec: SavedProjectRecord = {
          id: uid('proj'),
          name: 'پروژه بازیابی‌شده',
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
    name: 'L-نمونه آشپزخانه',
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

export function saveProjectsList(list: SavedProjectRecord[]): boolean {
  if (unreadableProjects) return false;
  return writeStorage(PROJECTS_LIST_KEY, JSON.stringify(list));
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string): void {
  if (!unreadableProjects) writeStorage(ACTIVE_PROJECT_ID_KEY, id);
}

export function upsertProjectRecordResult(
  list: SavedProjectRecord[],
  id: string,
  name: string,
  state: ProjectState,
  preferredMode?: '2d' | '3d' | 'ar',
): { list: SavedProjectRecord[]; saved: boolean } {
  const sum = summarizeState(state);
  const existingIdx = list.findIndex((p) => p.id === id);
  const record: SavedProjectRecord = {
    id,
    name: name.trim() || 'پروژه بدون نام',
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
  const sorted = [...next].sort((a, b) => safeTimestamp(b.updatedAt) - safeTimestamp(a.updatedAt));
  const saved = saveProjectsList(sorted);
  return { list: sorted, saved };
}

export function upsertProjectRecord(
  list: SavedProjectRecord[],
  id: string,
  name: string,
  state: ProjectState,
  preferredMode?: '2d' | '3d' | 'ar',
): SavedProjectRecord[] {
  return upsertProjectRecordResult(list, id, name, state, preferredMode).list;
}

export function createProjectRecord(
  name: string,
  mode: '2d' | '3d' | 'ar',
  preset?: PresetMode,
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
