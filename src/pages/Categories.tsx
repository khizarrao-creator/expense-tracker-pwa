import React, { useEffect, useState } from 'react';
import { getCategories, addCategory, deleteCategory, updateCategory } from '../db/queries';
import type { Category } from '../db/queries';
import { LayoutList, Plus, Trash2, GripVertical, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';
import { v4 as uuidv4 } from 'uuid';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';

// --- Sub-components for DND ---

const DraggableCategoryItem: React.FC<{
  cat: Category;
  onDelete: (id: string, name: string) => void;
  onAddSub: (id: string) => void;
  onToggleExpand: (id: string) => void;
  isExpanded: boolean;
  subCount: number;
}> = ({ cat, onDelete, onAddSub, onToggleExpand, isExpanded, subCount }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-${cat.id}`,
    data: { id: cat.id, type: 'category' }
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${cat.id}`,
    data: { id: cat.id }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setDropRef}
      className={`rounded-xl transition-all ${isOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between p-4 bg-background border border-border rounded-xl hover:shadow-sm transition-shadow group ${isDragging ? 'opacity-50' : ''}`}
      >
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
            <GripVertical size={18} />
          </div>
          <button
            onClick={() => onToggleExpand(cat.id)}
            className={`p-1 hover:bg-muted rounded transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            <ChevronRight size={16} className={subCount === 0 ? 'opacity-20' : ''} />
          </button>
          <span className="font-semibold text-foreground">{cat.name}</span>
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">{subCount} sub</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAddSub(cat.id)}
            className="text-primary p-2 rounded-lg hover:bg-primary/10 transition-colors"
            title="Add subcategory"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={() => onDelete(cat.id, cat.name)}
            className="text-muted-foreground p-2 rounded-lg hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

const DraggableSubcategoryItem: React.FC<{
  sub: Category;
  onDelete: (id: string, name: string) => void;
}> = ({ sub, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-${sub.id}`,
    data: { id: sub.id, type: 'subcategory' }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-card border border-border rounded-lg group/sub ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
          <GripVertical size={14} />
        </div>
        <span className="text-sm text-foreground">{sub.name}</span>
      </div>
      <button
        onClick={() => onDelete(sub.id, sub.name)}
        className="text-muted-foreground p-1.5 rounded-lg hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/sub:opacity-100"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
};

const Categories: React.FC = () => {
  const [newCategory, setNewCategory] = useState('');
  const [activeType, setActiveType] = useState<'income' | 'expense'>('expense');
  const [loading, setLoading] = useState(true);
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);

  const [deleteCategoryInfo, setDeleteCategoryInfo] = useState<{ id: string, name: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryTree, setCategoryTree] = useState<(Category & { subcategories: Category[] })[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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
      const isDuplicate = parentCategoryId
        ? categoryTree.find(c => c.id === parentCategoryId)?.subcategories.some(s => s.name.toLowerCase() === newCategory.trim().toLowerCase())
        : categoryTree.some(c => c.name.toLowerCase() === newCategory.trim().toLowerCase());

      if (isDuplicate) {
        toast.error('A category with this name already exists here');
        return;
      }

      await addCategory(newCategory.trim(), activeType, '', parentCategoryId);

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      // If dropped outside, and it's a subcategory, make it a parent
      if (active.data.current?.type === 'subcategory') {
        const catId = active.data.current.id;
        try {
          await updateCategory(catId, { parent_id: null });
          loadCategories();
          toast.success('Moved to parent category');
        } catch (err) {
          toast.error('Failed to move category');
        }
      }
      return;
    }

    const activeId = active.data.current?.id;
    const overId = over.data.current?.id;

    if (activeId === overId) return;

    // Prevent circular or invalid moves (e.g., parent to its own sub)
    if (activeId && overId) {
      try {
        await updateCategory(activeId, { parent_id: overId });
        loadCategories();
        const next = new Set(expandedCategories);
        next.add(overId);
        setExpandedCategories(next);
        toast.success('Category mapped successfully');
      } catch (err) {
        toast.error('Failed to map category');
      }
    }
  };

  // Droppable root area for making categories parent categories again
  const { setNodeRef: setRootRef, isOver: isOverRoot } = useDroppable({
    id: 'root-droppable',
    data: { id: null }
  });

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

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            ref={setRootRef}
            className={`space-y-4 min-h-[200px] rounded-xl transition-colors p-2 ${isOverRoot ? 'bg-primary/5 border-2 border-dashed border-primary/20' : ''}`}
          >
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              categoryTree.map((cat) => (
                <div key={cat.id} className="space-y-2">
                  <DraggableCategoryItem
                    cat={cat}
                    onDelete={handleDelete}
                    onAddSub={setParentCategoryId}
                    onToggleExpand={toggleExpand}
                    isExpanded={expandedCategories.has(cat.id)}
                    subCount={cat.subcategories.length}
                  />

                  {expandedCategories.has(cat.id) && (
                    <ul className="pl-10 space-y-2 border-l-2 border-muted ml-6">
                      {cat.subcategories.map(sub => (
                        <DraggableSubcategoryItem
                          key={sub.id}
                          sub={sub}
                          onDelete={handleDelete}
                        />
                      ))}
                      {cat.subcategories.length === 0 && (
                        <li className="text-xs text-muted-foreground italic py-1">No subcategories yet.</li>
                      )}
                    </ul>
                  )}
                </div>
              ))
            )}
            {!loading && categoryTree.length === 0 && (
              <div className="text-center py-10 text-muted-foreground italic">
                No categories found. Add one above.
              </div>
            )}
          </div>

          <DragOverlay>
            {activeId ? (
              <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg border border-primary opacity-90 cursor-grabbing flex items-center gap-2">
                <GripVertical size={16} />
                <span className="font-medium">
                  {categoryTree.flatMap(c => [c, ...c.subcategories]).find(x => `drag-${x.id}` === activeId)?.name || 'Moving...'}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      <p className="text-xs text-center text-muted-foreground px-4">
        Tip: Drag and drop a category onto another to make it a subcategory. Drag a subcategory to the bottom area to make it a parent category.
      </p>
    </div>
  );
};

export default Categories;
