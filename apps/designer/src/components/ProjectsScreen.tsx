import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Box,
  Camera,
  Check,
  Copy,
  Download,
  Edit3,
  Layers,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { PresetMode } from '../cad/presets';
import { SavedProjectRecord } from '../cad/projectStorage';

interface ProjectsScreenProps {
  projects: SavedProjectRecord[];
  activeProjectId: string | null;
  onBackToWelcome: () => void;
  onOpenProject: (id: string, mode: '2d' | '3d' | 'ar') => void;
  onCreateProject: (mode: '2d' | '3d' | 'ar', preset?: PresetMode) => void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onExportProjectRecord: (record: SavedProjectRecord) => void;
  onImportProjectFile: (jsonText: string) => void;
}

export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({
  projects,
  activeProjectId,
  onBackToWelcome,
  onOpenProject,
  onCreateProject,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  onExportProjectRecord,
  onImportProjectFile,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const importRef = useRef<HTMLInputElement | null>(null);

  const startRename = (rec: SavedProjectRecord) => {
    setEditingId(rec.id);
    setDraftName(rec.name);
  };

  const commitRename = (id: string) => {
    if (draftName.trim()) {
      onRenameProject(id, draftName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="h-14 px-4 sm:px-8 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToWelcome}
            aria-label="بازگشت به صفحه خوش‌آمدگویی"
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5"
          >
            <ArrowRight className="w-4 h-4" />
            <span>صفحه اصلی</span>
          </button>
          <h1 className="text-sm sm:text-base font-black text-slate-900">پروژه‌های من</h1>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (evt) => {
                const txt = evt.target?.result as string;
                if (txt) onImportProjectFile(txt);
              };
              reader.readAsText(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>بارگذاری JSON</span>
          </button>

          <button
            type="button"
            onClick={() => onCreateProject('ar')}
            className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Camera className="w-4 h-4" />
            <span>پروژه جدید AR</span>
          </button>

          <button
            type="button"
            onClick={() => onCreateProject('2d', 'L')}
            className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>پروژه جدید</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((rec) => {
            const isActive = rec.id === activeProjectId;
            const dateStr = new Date(rec.updatedAt).toLocaleDateString('fa-IR', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <article
                key={rec.id}
                className={`rounded-xl border bg-white p-4 flex flex-col justify-between gap-3 transition shadow-xs ${
                  isActive ? 'border-indigo-500 ring-2 ring-indigo-500/15' : 'border-slate-200'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {editingId === rec.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(rec.id);
                          }}
                          className="flex-1 h-8 px-2 text-xs font-bold border border-indigo-400 rounded-md"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => commitRename(rec.id)}
                          aria-label="ثبت نام پروژه"
                          className="h-8 w-8 rounded-md bg-indigo-600 text-white inline-flex items-center justify-center"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h2 className="text-sm font-black text-slate-900 leading-snug">{rec.name}</h2>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startRename(rec)}
                        aria-label={`تغییر نام ${rec.name}`}
                        title="تغییر نام"
                        className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateProject(rec.id)}
                        aria-label={`تکثیر ${rec.name}`}
                        title="کپی پروژه"
                        className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportProjectRecord(rec)}
                        aria-label={`خروجی JSON ${rec.name}`}
                        title="دانلود JSON"
                        className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-100 text-indigo-600 inline-flex items-center justify-center"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteProject(rec.id)}
                          aria-label={`حذف ${rec.name}`}
                          title="حذف پروژه"
                          className="h-7 w-7 rounded-md border border-red-200 hover:bg-red-50 text-red-600 inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span>{rec.wallCount} دیوار</span>
                    <span>•</span>
                    <span>{rec.boxCount} باکس</span>
                    <span>•</span>
                    <span>{dateStr}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenProject(rec.id, '2d')}
                    className="h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>2D</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenProject(rec.id, '3d')}
                    className="h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>3D</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenProject(rec.id, 'ar')}
                    className="h-8 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>AR</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
};
