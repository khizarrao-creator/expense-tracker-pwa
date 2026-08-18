import React, { useState, useEffect, useRef } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { db } from '../../firebase';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Palette, Bold, Italic, Underline, List, ListOrdered, Save, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

let TldrawComponent: any = null;
try {
  const tldrawModule = await import('tldraw');
  TldrawComponent = tldrawModule.Tldraw;
  import('tldraw/tldraw.css');
} catch (e) { }

export const ProjectWhiteboard: React.FC = () => {
  const { selectedProject } = useWork();
  const [mode, setMode] = useState<'notes' | 'canvas'>('notes');
  const [htmlContent, setHtmlContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedProject?.whiteboardText) {
      setHtmlContent(selectedProject.whiteboardText);
      if (editorRef.current) {
        editorRef.current.innerHTML = selectedProject.whiteboardText;
      }
    }
  }, [selectedProject]);

  const handleInput = () => {
    if (editorRef.current) {
      setHtmlContent(editorRef.current.innerHTML);
    }
  };

  const execCmd = (command: string, arg: string = '') => {
    document.execCommand(command, false, arg);
    handleInput();
  };

  const handleSave = async () => {
    if (!selectedProject) return;
    setIsSaving(true);

    if (db) {
      try {
        await updateDoc(doc(db, 'projects', selectedProject.id), {
          whiteboardText: htmlContent,
          updatedAt: serverTimestamp()
        });
      } catch (e) { }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('projects').update({
          description: htmlContent,
          updated_at: new Date().toISOString()
        }).eq('id', selectedProject.id);
      } catch (e) { }
    }

    setIsSaving(false);
    toast.success('Whiteboard saved!');
  };

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Palette className="text-primary" size={20} /> Team Whiteboard
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rich-text scratchpad and interactive drawing canvas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-card border border-border p-1 rounded-2xl flex">
            <button
              onClick={() => setMode('notes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                mode === 'notes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Rich Text Notes
            </button>
            <button
              onClick={() => setMode('canvas')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                mode === 'canvas' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Interactive Canvas
            </button>
          </div>

          {mode === 'notes' && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Save size={14} /> {isSaving ? 'Saving...' : 'Save Notes'}
            </button>
          )}
        </div>
      </div>

      {mode === 'notes' ? (
        <div className="border border-border rounded-3xl overflow-hidden flex flex-col bg-card shadow-xs h-[500px]">
          <div className="flex flex-wrap items-center gap-1.5 p-3 bg-muted/60 border-b border-border">
            <button type="button" onClick={() => execCmd('bold')} className="p-2 rounded-xl hover:bg-muted font-bold text-xs">B</button>
            <button type="button" onClick={() => execCmd('italic')} className="p-2 rounded-xl hover:bg-muted italic text-xs">I</button>
            <button type="button" onClick={() => execCmd('underline')} className="p-2 rounded-xl hover:bg-muted underline text-xs">U</button>
            <div className="w-px h-4 bg-border mx-1" />
            <button type="button" onClick={() => execCmd('formatBlock', '<h2>')} className="px-2 py-1 rounded-xl hover:bg-muted font-extrabold text-xs">H2</button>
            <button type="button" onClick={() => execCmd('formatBlock', '<h3>')} className="px-2 py-1 rounded-xl hover:bg-muted font-bold text-xs">H3</button>
            <button type="button" onClick={() => execCmd('insertUnorderedList')} className="p-2 rounded-xl hover:bg-muted text-xs">• List</button>
          </div>

          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className="w-full flex-1 p-6 text-foreground outline-none text-sm font-medium leading-relaxed overflow-y-auto"
          />
        </div>
      ) : (
        <div className="border border-border rounded-3xl overflow-hidden bg-card h-[600px] relative">
          {TldrawComponent ? (
            <TldrawComponent />
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-2">
              <Palette size={32} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-semibold">Tldraw canvas module fallback.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
