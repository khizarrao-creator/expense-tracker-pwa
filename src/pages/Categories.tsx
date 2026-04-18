import React, { useEffect, useState } from 'react';
import { getCategories, addCategory, deleteCategory } from '../db/queries';
import type { Category } from '../db/queries';
import { LayoutList, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';
import { syncManager } from '../db/SyncManager';
import { v4 as uuidv4 } from 'uuid';

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [activeType, setActiveType] = useState<'income' | 'expense'>('expense');
  const [loading, setLoading] = useState(true);
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);
  
  const [deleteCategoryInfo, setDeleteCategoryInfo] = useState<{ id: string, name: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryTree, setCategoryTree] = useState<(Category & { subcategories: Category[] })[]>([]);

  useEffect(() => {
    loadCategories();
  }, [activeType]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const parents = await getCategories(activeType);
      const tree = await Promise.all(parents.map(async (p) => {
        const subs = await getCategories(activeType, p.id);
        return { ...p, subcategories: subs };
      }));
      setCategoryTree(tree);
    } catch (error) {
      console.error('Failed to load categories', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedCategories(next);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;

    try {
      // Check for duplicates locally first
      const isDuplicate = parentCategoryId 
        ? categoryTree.find(c => c.id === parentCategoryId)?.subcategories.some(s => s.name.toLowerCase() === newCategory.trim().toLowerCase())
        : categoryTree.some(c => c.name.toLowerCase() === newCategory.trim().toLowerCase());

      if (isDuplicate) {
        toast.error('A category with this name already exists here');
        return;
      }

      const categoryId = uuidv4();
      const now = new Date().toISOString();
      const deviceId = localStorage.getItem('deviceId') || 'unknown';
      
      const categoryData = {
        id: categoryId,
        name: newCategory.trim(),
        type: activeType,
        icon: '',
        created_at: now,
        updated_at: now,
        deviceId,
        parent_id: parentCategoryId
      };

      await syncManager.performOperation('category_add', categoryData, () => 
        addCategory(newCategory.trim(), activeType, '', parentCategoryId, categoryId)
      );

      setNewCategory('');
      setParentCategoryId(null);
      loadCategories();
      if (parentCategoryId) {
        const next = new Set(expandedCategories);
        next.add(parentCategoryId);
        setExpandedCategories(next);
      }
      toast.success('Category added successfully');
    } catch (error) {
      console.error('Failed to add category', error);
      toast.error('Failed to add category');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteCategoryInfo({ id, name });
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryInfo) return;
    try {
      await deleteCategory(deleteCategoryInfo.id);
      loadCategories();
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Failed to delete category', error);
      toast.error('Failed to delete category');
    } finally {
      setDeleteCategoryInfo(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <ConfirmModal
        isOpen={deleteCategoryInfo !== null}
        title="Delete Category"
        message={`Are you sure you want to delete ${deleteCategoryInfo?.name}? This will not affect existing transactions.`}
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteCategoryInfo(null)}
        variant="danger"
        confirmText="Delete Category"
      />
      <div className="flex items-center gap-3 mb-6">
        <LayoutList className="text-primary" size={28} />
        <h1 className="text-2xl font-bold">Manage Categories</h1>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex bg-muted p-1 rounded-xl mb-6">
          <button
            onClick={() => setActiveType('expense')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeType === 'expense' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Expense Categories
          </button>
          <button
            onClick={() => setActiveType('income')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeType === 'income' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Income Categories
          </button>
        </div>

        <form onSubmit={handleAdd} className="flex flex-col gap-3 mb-6">
          {parentCategoryId && (
            <div className="flex items-center justify-between bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-medium border border-primary/20">
              <span>Adding subcategory to: <b>{categoryTree.find(c => c.id === parentCategoryId)?.name}</b></span>
              <button type="button" onClick={() => setParentCategoryId(null)} className="text-xs underline">Cancel</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={parentCategoryId ? "Subcategory name..." : `New ${activeType} category...`}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="flex-1 bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-3 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center shadow-sm"
            >
              <Plus size={24} />
            </button>
          </div>
        </form>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {categoryTree.map((cat) => (
              <div key={cat.id} className="space-y-2">
                <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl hover:shadow-sm transition-shadow group">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => toggleExpand(cat.id)}
                      className={`p-1 hover:bg-muted rounded transition-transform ${expandedCategories.has(cat.id) ? 'rotate-90' : ''}`}
                    >
                      <Plus size={16} className={cat.subcategories.length === 0 ? 'opacity-20' : ''} />
                    </button>
                    <span className="font-semibold text-foreground">{cat.name}</span>
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">{cat.subcategories.length} sub</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setParentCategoryId(cat.id)}
                      className="text-primary p-2 rounded-lg hover:bg-primary/10 transition-colors"
                      title="Add subcategory"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id, cat.name)}
                      className="text-muted-foreground p-2 rounded-lg hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                {expandedCategories.has(cat.id) && (
                  <ul className="pl-10 space-y-2 border-l-2 border-muted ml-6">
                    {cat.subcategories.map(sub => (
                      <li key={sub.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg group/sub">
                        <span className="text-sm text-foreground">{sub.name}</span>
                        <button
                          onClick={() => handleDelete(sub.id, sub.name)}
                          className="text-muted-foreground p-1.5 rounded-lg hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/sub:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                    {cat.subcategories.length === 0 && (
                      <li className="text-xs text-muted-foreground italic py-1">No subcategories yet.</li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Categories;
