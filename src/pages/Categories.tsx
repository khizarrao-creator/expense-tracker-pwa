import React, { useEffect, useState } from 'react';
import { getCategories, addCategory } from '../db/queries';
import type { Category } from '../db/queries';
import { LayoutList, Plus, Trash2 } from 'lucide-react';

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load categories', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;

    try {
      await addCategory(newCategory.trim());
      setNewCategory('');
      loadCategories();
    } catch (error) {
      console.error('Failed to add category', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}? Transactions using this category will still show the category name, but it won't be available for new transactions.`)) {
      // Basic delete. Real world would want to re-assign or soft delete.
      console.log('Would delete category', id);
      alert('Delete category not fully implemented in this demo. Needs safe deletion logic.');
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <LayoutList className="text-primary" size={28} />
        <h1 className="text-2xl font-bold">Manage Categories</h1>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="New Category Name..."
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
