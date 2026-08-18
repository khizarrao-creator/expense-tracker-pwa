import React, { useEffect, useState } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { supabase, isSupabaseConfigured } from '../../supabase';
import { UserCheck, Plus, Search, Mail, Phone, Building2, Tag, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ProjectCustomer {
  id: string;
  projectId: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'vip' | 'churned';
  notes?: string;
  createdAt?: string;
}

export const ProjectCustomers: React.FC = () => {
  const { selectedProject } = useWork();
  const [customers, setCustomers] = useState<ProjectCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'vip' | 'churned'>('active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!selectedProject) return;

    const loadCustomers = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('project_customers')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('created_at', { ascending: false });

        if (data) {
          setCustomers(data.map((c: any) => ({
            id: c.id,
            projectId: c.project_id,
            name: c.name,
            company: c.company || '',
            email: c.email || '',
            phone: c.phone || '',
            status: c.status || 'active',
            notes: c.notes || '',
            createdAt: c.created_at
          })));
        }
      } catch (e) { }
      setLoading(false);
    };

    loadCustomers();
  }, [selectedProject]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !name.trim()) return;

    const newCust: ProjectCustomer = {
      id: `cust_${Date.now()}`,
      projectId: selectedProject.id,
      name: name.trim(),
      company: company.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      status: status,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      try {
        await supabase.from('project_customers').insert({
          project_id: selectedProject.id,
          name: name.trim(),
          company: company.trim() || '',
          email: email.trim() || '',
          phone: phone.trim() || '',
          status: status,
          notes: notes.trim() || ''
        });
      } catch (e) { }
    }

    setCustomers(prev => [newCust, ...prev]);
    toast.success('Customer added to directory');
    setShowAddModal(false);
    resetForm();
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Remove customer from directory?')) return;
    setCustomers(prev => prev.filter(c => c.id !== id));
    if (isSupabaseConfigured) {
      try {
        await supabase.from('project_customers').delete().eq('id', id);
      } catch (e) { }
    }
    toast.success('Customer removed');
  };

  const resetForm = () => {
    setName('');
    setCompany('');
    setEmail('');
    setPhone('');
    setStatus('active');
    setNotes('');
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <UserCheck className="text-primary" size={20} /> Project Customer Directory
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage active client accounts, won deals, and customer lifecycle profiles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-card border border-border rounded-xl py-2 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-3xl bg-card">
          <UserCheck size={32} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-semibold">No customers registered for this project.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCustomers.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                    c.status === 'vip' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                    c.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                    'bg-muted text-muted-foreground border-border'
                  }`}>
                    {c.status}
                  </span>

                  <button onClick={() => handleDeleteCustomer(c.id)} className="text-muted-foreground hover:text-rose-500 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>

                <h3 className="font-bold text-base text-foreground">{c.name}</h3>
                {c.company && (
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mt-1">
                    <Building2 size={12} /> {c.company}
                  </p>
                )}

                <div className="space-y-1.5 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  {c.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail size={12} className="text-primary" /> {c.email}
                    </p>
                  )}
                  {c.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={12} className="text-primary" /> {c.phone}
                    </p>
                  )}
                </div>
              </div>

              {c.notes && (
                <p className="text-[11px] text-muted-foreground italic bg-muted/30 p-2.5 rounded-xl border border-border/40">
                  "{c.notes}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Add Customer Profile</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Customer / Contact Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., John Doe"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Company</label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="email@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+123456789"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="active">Active</option>
                  <option value="vip">VIP</option>
                  <option value="inactive">Inactive</option>
                  <option value="churned">Churned</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
