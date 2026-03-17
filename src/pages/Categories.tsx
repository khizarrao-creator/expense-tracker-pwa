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
  
  const [deleteCategoryInfo, setDeleteCategoryInfo] = useState<{ id: string, name: string } | null>(null);

  useEffect(() => {
    loadCategories();
  }, [activeType]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const cats = await getCategories(activeType);
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load categories', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;

    try {
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
        deviceId
      };

      await syncManager.performOperation('category_add', categoryData, () => 
        addCategory(newCategory.trim(), activeType, '', categoryId)
      );

      setNewCategory('');
      loadCategories();
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

        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder={`New ${activeType} category...`}
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
        </form>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <ul className="space-y-2">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                <span className="font-medium text-foreground">{cat.name}</span>
                <button
                  onClick={() => handleDelete(cat.id, cat.name)}
                  className="text-muted-foreground p-2 rounded-lg hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Categories;
