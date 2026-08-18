import React, { useState, useEffect } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { Settings, Save, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export const ProjectSettings: React.FC = () => {
  const { selectedProject, refreshProjects } = useWork();

  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedProject) {
      setProjectName(selectedProject.name);
      setProjectDesc(selectedProject.description || '');
      const kb = localStorage.getItem(`project_kb_${selectedProject.id}`) || '';
      setKnowledgeBaseText(kb);
    }
  }, [selectedProject]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !projectName.trim()) return;
    setIsSaving(true);

    try {
      localStorage.setItem(`project_kb_${selectedProject.id}`, knowledgeBaseText.trim());

      if (isSupabaseConfigured) {
        await supabase.from('projects').update({
          name: projectName.trim(),
          description: projectDesc.trim(),
          updated_at: new Date().toISOString()
        }).eq('id', selectedProject.id);
      }

      toast.success('Project settings & Knowledge Base saved!');
      await refreshProjects();
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Settings className="text-primary" size={20} /> Project Settings & Knowledge Base
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure project info, inject AI team guidelines (JSON/TXT), and manage backups.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* General Settings */}
        <div className="bg-card border border-border p-6 rounded-3xl space-y-4">
          <h3 className="font-bold text-base">General Information</h3>

          <div>
            <label className="block text-xs font-bold mb-1">Project Name</label>
            <input
              type="text"
              required
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">Project Description</label>
            <textarea
              value={projectDesc}
              onChange={e => setProjectDesc(e.target.value)}
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary resize-none h-20"
            />
          </div>
        </div>

        {/* Knowledge Base Section */}
        <div className="bg-card border border-border p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <BookOpen size={18} className="text-primary" /> AI Knowledge Base Context
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste JSON specs, TXT documentation, or team rules to train the Project AI Copilot.
              </p>
            </div>
          </div>

          <textarea
            placeholder={`Paste JSON or TXT rules here, e.g.:
{
  "projectCode": "PROJ-2026",
  "clientSLA": "24 hours",
  "techStack": ["React", "Node", "Supabase"]
}`}
            value={knowledgeBaseText}
            onChange={e => setKnowledgeBaseText(e.target.value)}
            className="w-full bg-muted border border-border rounded-2xl p-4 text-xs font-mono outline-none focus:ring-2 focus:ring-primary resize-none h-44"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg"
          >
            <Save size={16} /> {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
