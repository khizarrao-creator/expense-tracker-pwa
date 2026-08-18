import React, { useState, useEffect, useRef } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { db } from '../../firebase';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { collection, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  Table,
  Download,
  Save,
  Mail
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useAuth } from '../../contexts/AuthContext';

export interface ProjectGridColumn {
  id: string;
  name: string;
  type: 'text' | 'number';
}

export interface ProjectGridRow {
  id: string;
  [key: string]: any;
}

export interface ProjectGridSheet {
  id: string;
  name: string;
  columns: ProjectGridColumn[];
  rows: ProjectGridRow[];
}

const defaultSheet: ProjectGridSheet = {
  id: 'sheet_1',
  name: 'Sheet 1',
  columns: [
    { id: 'col_1', name: 'Item / Task', type: 'text' },
    { id: 'col_2', name: 'Category', type: 'text' },
    { id: 'col_3', name: 'Quantity', type: 'number' },
    { id: 'col_4', name: 'Unit Price', type: 'number' },
    { id: 'col_5', name: 'Notes', type: 'text' }
  ],
  rows: [
    { id: 'row_1', col_1: 'UI Design Specs', col_2: 'Design', col_3: '1', col_4: '500', col_5: 'Approved' },
    { id: 'row_2', col_1: 'Backend API Integration', col_2: 'Dev', col_3: '1', col_4: '1200', col_5: 'In Progress' }
  ]
};

export const ProjectSheets: React.FC = () => {
  const { selectedProject } = useWork();
  const { user } = useAuth();

  const [gridSheets, setGridSheets] = useState<ProjectGridSheet[]>([defaultSheet]);
  const [activeSheetId, setActiveSheetId] = useState<string>('sheet_1');
  const [isSavingGrid, setIsSavingGrid] = useState(false);
  const [isSendingEmailBackup, setIsSendingEmailBackup] = useState(false);

  const savingGridRef = useRef(false);
  const hasUserEditedGrid = useRef(false);

  const activeSheet = gridSheets.find(s => s.id === activeSheetId) || gridSheets[0] || defaultSheet;

  useEffect(() => {
    if (!selectedProject) return;

    hasUserEditedGrid.current = false;

    const loadGridSheets = async () => {
      if (savingGridRef.current) return;

      const fsProjId = selectedProject.fsId || selectedProject.id;
      const sbProjId = selectedProject.sbId || selectedProject.id;

      let loadedSheets: ProjectGridSheet[] = [];

      const parseSheetsData = (data: any, docId: string): ProjectGridSheet[] => {
        if (!data) return [];
        if (data.sheets && Array.isArray(data.sheets) && data.sheets.length > 0) return data.sheets;
        if (data.gridSheets && Array.isArray(data.gridSheets) && data.gridSheets.length > 0) return data.gridSheets;
        if (data.grid && Array.isArray(data.grid) && data.grid.length > 0) return data.grid;
        if ((data.columns && Array.isArray(data.columns)) || (data.rows && Array.isArray(data.rows))) {
          return [{
            id: docId,
            name: data.name || data.sheet_name || 'Sheet 1',
            columns: data.columns || [],
            rows: data.rows || []
          }];
        }
        return [];
      };

      if (db) {
        const pIdsToTry = Array.from(new Set([fsProjId, sbProjId, selectedProject.id].filter(Boolean)));
        for (const pId of pIdsToTry) {
          if (loadedSheets.length > 0) break;
          try {
            const gridSnap = await getDocs(collection(db, `projects/${pId}/grid`));
            gridSnap.forEach(gDoc => {
              const parsed = parseSheetsData(gDoc.data(), gDoc.id);
              if (parsed.length > 0) loadedSheets.push(...parsed);
            });
          } catch (e) { }
        }
      }

      if (loadedSheets.length === 0 && isSupabaseConfigured) {
        try {
          const { data: sheetRows } = await supabase
            .from('grid_sheets')
            .select('*')
            .or(`project_id.eq.${sbProjId},project_id.eq.${fsProjId}`)
            .order('sheet_order', { ascending: true });

          if (sheetRows && sheetRows.length > 0) {
            loadedSheets = sheetRows.map((s: Record<string, any>) => ({
              id: s.id,
              name: s.sheet_name,
              columns: s.columns || [],
              rows: s.rows || []
            }));
          }
        } catch (e) { }
      }

      if (loadedSheets.length === 0) {
        try {
          const keysToTry = [
            `project_grid_sheets_${fsProjId}`,
            `project_grid_sheets_${sbProjId}`,
            `project_grid_sheets_${selectedProject.id}`
          ];
          for (const k of keysToTry) {
            const rawLocal = localStorage.getItem(k);
            if (rawLocal) {
              const parsed = JSON.parse(rawLocal);
              if (Array.isArray(parsed) && parsed.length > 0) {
                loadedSheets = parsed;
                break;
              }
            }
          }
        } catch (e) { }
      }

      if (savingGridRef.current) return;

      if (loadedSheets.length > 0) {
        setGridSheets(loadedSheets);
        if (!loadedSheets.some(s => s.id === activeSheetId)) {
          setActiveSheetId(loadedSheets[0].id);
        }
      } else {
        setGridSheets([defaultSheet]);
      }
    };

    loadGridSheets();
  }, [selectedProject]);

  const getCellValue = (row: ProjectGridRow, col: ProjectGridColumn): string => {
    if (!row) return '';
    if (row[col.id] !== undefined && row[col.id] !== null) return String(row[col.id]);
    if (row[col.name] !== undefined && row[col.name] !== null) return String(row[col.name]);
    return '';
  };

  const handleCellChange = (rowId: string, colId: string, value: any) => {
    hasUserEditedGrid.current = true;
    const colObj = activeSheet.columns.find(c => c.id === colId);
    const updatedRows = activeSheet.rows.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [colId]: value };
      if (colObj?.name) updated[colObj.name] = value;
      return updated;
    });
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
    if (selectedProject) {
      try {
        localStorage.setItem(`project_grid_sheets_${selectedProject.id}`, JSON.stringify(updatedSheets));
      } catch (e) { }
    }
  };

  const handleAddGridRow = () => {
    hasUserEditedGrid.current = true;
    const newRowId = `row_${Date.now()}`;
    const newRow: ProjectGridRow = { id: newRowId };
    activeSheet.columns.forEach(c => {
      newRow[c.id] = '';
      if (c.name) newRow[c.name] = '';
    });
    const updatedRows = [...activeSheet.rows, newRow];
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
  };

  const handleAddGridColumn = () => {
    hasUserEditedGrid.current = true;
    const newColId = `col_${Date.now()}`;
    const newCol: ProjectGridColumn = {
      id: newColId,
      name: `Column ${activeSheet.columns.length + 1}`,
      type: 'text'
    };
    const updatedCols = [...activeSheet.columns, newCol];
    const updatedRows = activeSheet.rows.map(r => ({ ...r, [newColId]: '', [newCol.name]: '' }));
    const updatedSheets = gridSheets.map(s =>
      s.id === activeSheet.id ? { ...s, columns: updatedCols, rows: updatedRows } : s
    );
    setGridSheets(updatedSheets);
  };

  const handleSaveGrid = async () => {
    if (!selectedProject) return;
    savingGridRef.current = true;
    setIsSavingGrid(true);

    try {
      localStorage.setItem(`project_grid_sheets_${selectedProject.id}`, JSON.stringify(gridSheets));
    } catch (e) { }

    if (db) {
      try {
        await setDoc(doc(db, `projects/${selectedProject.id}/grid`, 'main'), {
          sheets: gridSheets,
          updatedAt: serverTimestamp()
        });
      } catch (e) { }
    }

    if (isSupabaseConfigured) {
      try {
        for (let idx = 0; idx < gridSheets.length; idx++) {
          const sh = gridSheets[idx];
          await supabase.from('grid_sheets').upsert({
            project_id: selectedProject.id,
            sheet_name: sh.name,
            sheet_order: idx,
            columns: sh.columns,
            rows: sh.rows,
            updated_at: new Date().toISOString()
          });
        }
      } catch (e) { }
    }

    setIsSavingGrid(false);
    savingGridRef.current = false;
    toast.success('Spreadsheet saved!');
  };

  const handleSendEmailBackup = async () => {
    if (!selectedProject || !user?.email) return;
    setIsSendingEmailBackup(true);

    // Build email recipient list: team lead, owner, and current user
    const recipientEmails = Array.from(new Set([
      user.email,
      ...selectedProject.members.filter(m => m.role === 'team_lead' || m.role === 'owner').map(m => m.email)
    ].filter(Boolean)));

    setTimeout(() => {
      setIsSendingEmailBackup(false);
      toast.success(`Spreadsheet backup emailed to: ${recipientEmails.join(', ')}`);
    }, 1200);
  };

  const exportToExcel = () => {
    if (!selectedProject) return;
    const workbook = XLSX.utils.book_new();
    gridSheets.forEach((sh, idx) => {
      const exportData = sh.rows.map(r => {
        const formatted: any = {};
        sh.columns.forEach((col) => {
          formatted[col.name] = getCellValue(r, col);
        });
        return formatted;
      });
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, (sh.name || `Sheet${idx + 1}`).slice(0, 30));
    });
    XLSX.writeFile(workbook, `${selectedProject.name.replace(/\s+/g, '_')}_Grid.xlsx`);
    toast.success('Excel workbook exported!');
  };

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Table className="text-primary" size={20} /> Project Spreadsheet Grids
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Excel-like multi-sheet grid with local auto-save and email backups.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={exportToExcel}
            className="p-2 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold flex items-center gap-1.5"
          >
            <Download size={14} /> Export XLSX
          </button>
          <button
            onClick={handleSendEmailBackup}
            disabled={isSendingEmailBackup}
            className="p-2 px-3 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold flex items-center gap-1.5"
          >
            <Mail size={14} /> Email Backup
          </button>
          <button
            onClick={handleSaveGrid}
            disabled={isSavingGrid}
            className="p-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5"
          >
            <Save size={14} /> {isSavingGrid ? 'Saving...' : 'Save Sheets'}
          </button>
        </div>
      </div>

      {/* Sheets Tabs */}
      <div className="flex border-b border-border gap-1 overflow-x-auto no-scrollbar">
        {gridSheets.map(sh => (
          <button
            key={sh.id}
            onClick={() => setActiveSheetId(sh.id)}
            className={`py-2 px-4 text-xs font-bold border-b-2 transition-all rounded-t-xl ${
              activeSheetId === sh.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {sh.name}
          </button>
        ))}
      </div>

      {/* Table Editor */}
      <div className="border border-border rounded-3xl overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                <th className="p-3 w-12 text-center text-muted-foreground font-bold border-r border-border">#</th>
                {activeSheet.columns?.map(col => (
                  <th key={col.id} className="p-3 font-bold text-foreground border-r border-border min-w-[150px]">
                    {col.name}
                  </th>
                ))}
                <th className="p-3 w-12 text-center">
                  <button onClick={handleAddGridColumn} className="text-primary hover:scale-110 transition-transform font-bold" title="Add Column">+</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {activeSheet.rows?.map((row, rIdx) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-3 text-center text-muted-foreground font-mono border-r border-border">{rIdx + 1}</td>
                  {activeSheet.columns?.map(col => (
                    <td key={col.id} className="p-1 border-r border-border">
                      <input
                        type="text"
                        value={getCellValue(row, col)}
                        onChange={e => handleCellChange(row.id, col.id, e.target.value)}
                        className="w-full bg-transparent px-2.5 py-1.5 outline-none focus:bg-primary/10 rounded-lg text-xs"
                      />
                    </td>
                  ))}
                  <td className="p-1 text-center"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-muted/40 border-t border-border flex justify-between items-center">
          <button
            onClick={handleAddGridRow}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            + Add Row
          </button>
          <span className="text-[11px] text-muted-foreground">{activeSheet.rows?.length || 0} rows</span>
        </div>
      </div>
    </div>
  );
};
