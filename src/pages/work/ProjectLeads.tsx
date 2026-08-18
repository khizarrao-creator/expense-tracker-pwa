import React, { useEffect, useState } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import {
  Briefcase,
  Plus,
  DollarSign,
  User,
  Phone,
  Mail,
  Building2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  CheckCircle2,
  UserCheck
} from 'lucide-react';
import { toast } from 'sonner';

export interface ProjectLead {
  id: string;
  projectId: string;
  title: string;
  clientName: string;
  company?: string;
  email?: string;
  phone?: string;
  value: number;
  currency: string;
  stage: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
  assignedTo: string | null;
  assignedToName: string | null;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

const LEAD_STAGES = [
  { id: 'new', name: 'New', color: 'border-blue-500/40 text-blue-500 bg-blue-500/10' },
  { id: 'contacted', name: 'Contacted', color: 'border-cyan-500/40 text-cyan-500 bg-cyan-500/10' },
  { id: 'qualified', name: 'Qualified', color: 'border-amber-500/40 text-amber-500 bg-amber-500/10' },
  { id: 'proposal', name: 'Proposal', color: 'border-indigo-500/40 text-indigo-500 bg-indigo-500/10' },
  { id: 'won', name: 'Won 🎉', color: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10' },
  { id: 'lost', name: 'Lost ❌', color: 'border-rose-500/40 text-rose-500 bg-rose-500/10' }
];

export const ProjectLeads: React.FC = () => {
  const { selectedProject } = useWork();
  const { user } = useAuth();

  const [leads, setLeads] = useState<ProjectLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [editingLead, setEditingLead] = useState<ProjectLead | null>(null);

  // Form State
  const [newLeadTitle, setNewLeadTitle] = useState('');
  const [newLeadClient, setNewLeadClient] = useState('');
  const [newLeadCompany, setNewLeadCompany] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadValue, setNewLeadValue] = useState('');
  const [newLeadCurrency, setNewLeadCurrency] = useState('USD');
  const [newLeadStage, setNewLeadStage] = useState<'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'>('new');
  const [newLeadAssignee, setNewLeadAssignee] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');

  useEffect(() => {
    if (!selectedProject) return;

    const loadLeads = async () => {
      const leadMap = new Map<string, ProjectLead>();
      const fsProjId = selectedProject.fsId || selectedProject.id;
      const sbProjId = selectedProject.sbId || selectedProject.id;

      if (db) {
        try {
          const fsLeadSnaps = await getDocs(collection(db, `projects/${fsProjId}/leads`));
          fsLeadSnaps.forEach(lDoc => {
            const ld = lDoc.data();
            leadMap.set(lDoc.id, {
              id: lDoc.id,
              projectId: selectedProject.id,
              title: ld.title || '',
              clientName: ld.clientName || '',
              company: ld.company || '',
              email: ld.email || '',
              phone: ld.phone || '',
              value: ld.value || 0,
              currency: ld.currency || 'USD',
              stage: ld.stage || 'new',
              assignedTo: ld.assignedTo || null,
              assignedToName: ld.assignedToName || '',
              notes: ld.notes || '',
              createdAt: ld.createdAt?.toDate?.()?.toISOString() || ld.createdAt || new Date().toISOString(),
              updatedAt: ld.updatedAt?.toDate?.()?.toISOString() || ld.updatedAt || new Date().toISOString()
            });
          });
        } catch (e) { }
      }

      if (isSupabaseConfigured) {
        try {
          const { data: leadRows } = await supabase
            .from('project_leads')
            .select('*')
            .or(`project_id.eq.${sbProjId},project_id.eq.${fsProjId}`)
            .order('created_at', { ascending: false });

          (leadRows || []).forEach((l: Record<string, any>) => {
            if (!leadMap.has(l.id)) {
              leadMap.set(l.id, {
                id: l.id,
                projectId: l.project_id,
                title: l.title,
                clientName: l.client_name,
                company: l.company || '',
                email: l.email || '',
                phone: l.phone || '',
                value: l.value || 0,
                currency: l.currency || 'USD',
                stage: l.stage as any,
                assignedTo: l.assigned_to,
                assignedToName: l.assigned_name,
                notes: l.notes || '',
                createdAt: l.created_at,
                updatedAt: l.updated_at
              });
            }
          });
        } catch (e) { }
      }

      setLeads(Array.from(leadMap.values()));
      setLoading(false);
    };

    loadLeads();
  }, [selectedProject]);

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject || !newLeadTitle.trim()) return;

    try {
      const assigneeObj = selectedProject.members?.find(m => m.userId === newLeadAssignee);
      const assigneeName = assigneeObj?.displayName || assigneeObj?.email || (newLeadAssignee === user.uid ? (user.displayName || user.email || 'You') : null);

      const leadId = editingLead ? editingLead.id : `lead_${Date.now()}`;
      const leadObj: ProjectLead = {
        id: leadId,
        projectId: selectedProject.id,
        title: newLeadTitle.trim(),
        clientName: newLeadClient.trim(),
        company: newLeadCompany.trim() || undefined,
        email: newLeadEmail.trim() || undefined,
        phone: newLeadPhone.trim() || undefined,
        value: parseFloat(newLeadValue) || 0,
        currency: newLeadCurrency.trim() || 'USD',
        stage: newLeadStage,
        assignedTo: newLeadAssignee || null,
        assignedToName: assigneeName,
        notes: newLeadNotes.trim() || undefined,
        createdAt: editingLead ? editingLead.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (db) {
        try {
          const leadRef = editingLead ? doc(db, `projects/${selectedProject.id}/leads`, editingLead.id) : doc(collection(db, `projects/${selectedProject.id}/leads`));
          await setDoc(leadRef, {
            id: leadRef.id,
            projectId: selectedProject.id,
            title: newLeadTitle.trim(),
            clientName: newLeadClient.trim(),
            company: newLeadCompany.trim() || null,
            email: newLeadEmail.trim() || null,
            phone: newLeadPhone.trim() || null,
            value: parseFloat(newLeadValue) || 0,
            currency: newLeadCurrency.trim() || 'USD',
            stage: newLeadStage,
            assignedTo: newLeadAssignee || null,
            assignedToName: assigneeName,
            notes: newLeadNotes.trim() || null,
            updatedAt: serverTimestamp(),
            ...(editingLead ? {} : { createdAt: serverTimestamp() })
          }, { merge: true });
        } catch (e) { }
      }

      if (isSupabaseConfigured) {
        const leadPayload = {
          project_id: selectedProject.id,
          title: newLeadTitle.trim(),
          client_name: newLeadClient.trim(),
          company: newLeadCompany.trim() || '',
          email: newLeadEmail.trim() || '',
          phone: newLeadPhone.trim() || '',
          value: parseFloat(newLeadValue) || 0,
          currency: newLeadCurrency.trim() || 'USD',
          stage: newLeadStage,
          assigned_to: newLeadAssignee || null,
          assigned_name: assigneeName,
          notes: newLeadNotes.trim() || '',
          updated_at: new Date().toISOString()
        };

        if (editingLead) {
          await supabase.from('project_leads').update(leadPayload).eq('id', editingLead.id);
        } else {
          await supabase.from('project_leads').insert(leadPayload);
        }
      }

      setLeads(prev => {
        if (editingLead) return prev.map(l => l.id === editingLead.id ? leadObj : l);
        return [leadObj, ...prev];
      });

      toast.success(editingLead ? 'Lead updated' : 'Lead added to pipeline');
      setShowAddLeadModal(false);
      setEditingLead(null);
      resetLeadForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save lead');
    }
  };

  const handleUpdateStage = async (leadId: string, newStage: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost') => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));

    if (isSupabaseConfigured) {
      try {
        await supabase.from('project_leads').update({
          stage: newStage,
          updated_at: new Date().toISOString()
        }).eq('id', leadId);
      } catch (e) { }
    }

    // Auto convert won lead to active customer if won
    if (newStage === 'won') {
      const wonLead = leads.find(l => l.id === leadId);
      if (wonLead && isSupabaseConfigured) {
        try {
          await supabase.from('project_customers').insert({
            project_id: selectedProject?.id,
            name: wonLead.clientName,
            company: wonLead.company || '',
            email: wonLead.email || '',
            phone: wonLead.phone || '',
            status: 'active',
            source_lead_id: wonLead.id,
            notes: `Converted from won lead: ${wonLead.title}`
          });
          toast.success(`Lead won & auto-converted to Customer! 🎉`);
          return;
        } catch (e) { }
      }
    }

    toast.success(`Lead moved to ${newStage.toUpperCase()}`);
  };

  const handleDeleteLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedProject || !confirm('Delete this lead from pipeline?')) return;
    setLeads(prev => prev.filter(l => l.id !== leadId));
    try {
      if (db) {
        try {
          await deleteDoc(doc(db, `projects/${selectedProject.id}/leads`, leadId));
        } catch (e) { }
      }
      if (isSupabaseConfigured) {
        await supabase.from('project_leads').delete().eq('id', leadId);
      }
      toast.success('Lead deleted');
    } catch (err) {
      toast.error('Failed to delete lead');
    }
  };

  const resetLeadForm = () => {
    setNewLeadTitle('');
    setNewLeadClient('');
    setNewLeadCompany('');
    setNewLeadEmail('');
    setNewLeadPhone('');
    setNewLeadValue('');
    setNewLeadCurrency('USD');
    setNewLeadStage('new');
    setNewLeadAssignee('');
    setNewLeadNotes('');
  };

  const handleEditClick = (lead: ProjectLead) => {
    setEditingLead(lead);
    setNewLeadTitle(lead.title);
    setNewLeadClient(lead.clientName);
    setNewLeadCompany(lead.company || '');
    setNewLeadEmail(lead.email || '');
    setNewLeadPhone(lead.phone || '');
    setNewLeadValue(lead.value ? String(lead.value) : '0');
    setNewLeadCurrency(lead.currency || 'USD');
    setNewLeadStage(lead.stage || 'new');
    setNewLeadAssignee(lead.assignedTo || '');
    setNewLeadNotes(lead.notes || '');
    setShowAddLeadModal(true);
  };

  const pipelineTotal = leads.reduce((acc, l) => acc + (l.value || 0), 0);

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Briefcase className="text-primary" size={20} /> Sales & Leads Pipeline CRM
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total Pipeline Value: <span className="font-extrabold text-emerald-500">${pipelineTotal.toLocaleString()}</span>
          </p>
        </div>

        <button
          onClick={() => {
            setEditingLead(null);
            resetLeadForm();
            setShowAddLeadModal(true);
          }}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={16} /> New Deal / Lead
        </button>
      </div>

      {/* Kanban Pipeline Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto">
        {LEAD_STAGES.map(stg => {
          const stageLeads = leads.filter(l => l.stage === stg.id);
          const stageTotal = stageLeads.reduce((acc, l) => acc + (l.value || 0), 0);

          return (
            <div key={stg.id} className="bg-card/70 border border-border rounded-2xl p-3 flex flex-col min-h-[400px]">
              <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${stg.color}`}>
                  {stg.name}
                </span>
                <span className="text-[11px] font-bold text-muted-foreground font-mono">
                  ${stageTotal.toLocaleString()}
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="bg-card border border-border p-3.5 rounded-xl shadow-xs space-y-2 hover:border-primary/50 transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-xs text-foreground leading-tight">{lead.title}</h4>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditClick(lead)} className="text-muted-foreground hover:text-foreground">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={e => handleDeleteLead(lead.id, e)} className="text-muted-foreground hover:text-rose-500">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground font-medium">{lead.clientName}</p>

                    {lead.value > 0 && (
                      <p className="text-xs font-extrabold text-emerald-500">${lead.value.toLocaleString()}</p>
                    )}

                    <div className="pt-2 border-t border-border/40 flex justify-between items-center text-[10px] text-muted-foreground">
                      <span>{lead.assignedToName || 'Unassigned'}</span>
                      <div className="flex gap-1">
                        {stg.id !== 'new' && (
                          <button
                            onClick={() => {
                              const idx = LEAD_STAGES.findIndex(s => s.id === stg.id);
                              if (idx > 0) handleUpdateStage(lead.id, LEAD_STAGES[idx - 1].id as any);
                            }}
                            className="p-1 hover:bg-muted rounded"
                          >
                            ←
                          </button>
                        )}
                        {stg.id !== 'lost' && (
                          <button
                            onClick={() => {
                              const idx = LEAD_STAGES.findIndex(s => s.id === stg.id);
                              if (idx < LEAD_STAGES.length - 1) handleUpdateStage(lead.id, LEAD_STAGES[idx + 1].id as any);
                            }}
                            className="p-1 hover:bg-muted rounded text-primary font-bold"
                          >
                            →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showAddLeadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">{editingLead ? 'Edit Deal' : 'Add New Lead / Deal'}</h3>
              <button onClick={() => setShowAddLeadModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleSaveLead} className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Deal Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Enterprise Retainer"
                  value={newLeadTitle}
                  onChange={e => setNewLeadTitle(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Client Name</label>
                <input
                  type="text"
                  required
                  placeholder="Contact person name..."
                  value={newLeadClient}
                  onChange={e => setNewLeadClient(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="Company name..."
                    value={newLeadCompany}
                    onChange={e => setNewLeadCompany(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Deal Value ($)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newLeadValue}
                    onChange={e => setNewLeadValue(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="client@company.com"
                    value={newLeadEmail}
                    onChange={e => setNewLeadEmail(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+123456789"
                    value={newLeadPhone}
                    onChange={e => setNewLeadPhone(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Pipeline Stage</label>
                <select
                  value={newLeadStage}
                  onChange={e => setNewLeadStage(e.target.value as any)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                >
                  {LEAD_STAGES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
