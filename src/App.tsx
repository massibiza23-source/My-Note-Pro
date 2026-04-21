import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Copy, 
  Tag as TagIcon, 
  Edit3, 
  Trash2, 
  ChevronRight, 
  Layout, 
  Lightbulb, 
  Code, 
  MessageSquare, 
  Compass,
  FileText,
  X,
  Check,
  Variable,
  Settings,
  PlusCircle,
  Pencil,
  Lock,
  Unlock,
  Upload,
  File
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Category, Prompt } from './types';
import * as XLSX from 'xlsx';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';

// Initial categories if DB is empty
const INITIAL_CATEGORIES: Category[] = [
  { id: 'all', name: 'Todos', icon: 'Layout', color: 'text-zinc-600' },
  { id: 'coding', name: 'Programación', icon: 'Code', color: 'text-blue-500' },
  { id: 'writing', name: 'Escritura', icon: 'Edit3', color: 'text-amber-500' },
  { id: 'chat', name: 'Conversación', icon: 'MessageSquare', color: 'text-emerald-500' },
  { id: 'creative', name: 'Creativo', icon: 'Lightbulb', color: 'text-purple-500' },
  { id: 'misc', name: 'Varios', icon: 'Compass', color: 'text-zinc-400' },
];

export default function App() {
  // Dexie Live Queries
  const prompts = useLiveQuery(() => db.prompts.toArray(), []) || [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];

  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState<Partial<Prompt> | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [categoryDeleteConfirmation, setCategoryDeleteConfirmation] = useState<string | null>(null);

  // Auth / PIN State
  const [isLocked, setIsLocked] = useState(() => {
    const hasPin = localStorage.getItem('prompt_vault_pin');
    return !!hasPin;
  });
  const [pinInput, setPinInput] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  // Migration and Initialization
  useEffect(() => {
    const initDB = async () => {
      const count = await db.categories.count();
      if (count === 0) {
        // Try to migrate from localStorage first
        const savedCategories = localStorage.getItem('prompt_vault_categories');
        const savedPrompts = localStorage.getItem('prompt_vault_data');
        
        if (savedCategories) {
          await db.categories.bulkAdd(JSON.parse(savedCategories));
        } else {
          await db.categories.bulkAdd(INITIAL_CATEGORIES);
        }

        if (savedPrompts) {
          await db.prompts.bulkAdd(JSON.parse(savedPrompts));
        }
        
        // Clear localStorage after migration to free up space
        localStorage.removeItem('prompt_vault_data');
        localStorage.removeItem('prompt_vault_categories');
      }
    };
    initDB();
  }, []);

  const filteredPrompts = useMemo(() => {
    return prompts.filter(p => {
      const matchesCategory = selectedCategoryId === 'all' || p.categoryId === selectedCategoryId;
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [prompts, selectedCategoryId, searchQuery]);

  const extractVariables = (content: string) => {
    const matches = content.match(/\{\{([^}]+)\}\}/g);
    return matches ? Array.from(new Set(matches.map(m => m.slice(2, -2).trim()))) : [];
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPrompt?.title || !currentPrompt?.content) return;

    const newPrompt: Prompt = {
      id: currentPrompt.id || crypto.randomUUID(),
      title: currentPrompt.title,
      content: currentPrompt.content,
      categoryId: currentPrompt.categoryId || 'misc',
      tags: currentPrompt.tags || [],
      createdAt: currentPrompt.createdAt || Date.now(),
      updatedAt: Date.now(),
      variables: extractVariables(currentPrompt.content),
    };

    if (currentPrompt.id) {
      await db.prompts.put(newPrompt);
    } else {
      await db.prompts.add(newPrompt);
    }

    setIsEditing(false);
    setCurrentPrompt(null);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteConfirmation(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;
    await db.prompts.delete(deleteConfirmation);
    if (currentPrompt?.id === deleteConfirmation) {
      setIsEditing(false);
      setCurrentPrompt(null);
    }
    setDeleteConfirmation(null);
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopyStatus(id);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      // Handle Excel files
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            resolve(JSON.stringify(json, null, 2));
          } catch (err) {
            resolve(`[Error leyendo archivo Excel: ${file.name}]`);
          }
        };
        reader.readAsArrayBuffer(file);
        return;
      }

      // Handle Image files
      if (file.type.startsWith('image/')) {
        reader.onload = (e) => {
          resolve(e.target?.result?.toString() || '');
        };
        reader.readAsDataURL(file);
        return;
      }

      // Default behavior for text-based files (HTML, Text, etc.)
      reader.onload = (e) => {
        resolve(e.target?.result as string || '');
      };
      reader.readAsText(file);
    });
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    const firstFilePath = files[0].webkitRelativePath;
    const folderName = firstFilePath ? firstFilePath.split('/')[0] : 'Importación';
    
    const newCategoryId = crypto.randomUUID();
    const newCategory: Category = {
      id: newCategoryId,
      name: folderName,
      icon: 'Compass',
      color: 'text-zinc-600'
    };

    const newNotes: Prompt[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.startsWith('.')) continue;

      const content = await readFileContent(file);
      const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm');
      const thumbnail = await generateThumbnail(file, content);
      
      newNotes.push({
        id: crypto.randomUUID(),
        title: file.name,
        content: content,
        categoryId: newCategoryId,
        tags: ['Importado', file.name.split('.').pop()?.toUpperCase() || 'FILE', isHtml ? 'WEB' : ''].filter(Boolean),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: [],
        thumbnail
      });
    }

    if (newNotes.length > 0) {
      await db.categories.add(newCategory);
      await db.prompts.bulkAdd(newNotes);
      setSelectedCategoryId(newCategoryId);
      alert(`${newNotes.length} archivos de "${folderName}" importados correctamente.`);
    }
    
    setIsImporting(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    const newNotes: Prompt[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await readFileContent(file);
      const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm');
      const thumbnail = await generateThumbnail(file, content);
      
      newNotes.push({
        id: crypto.randomUUID(),
        title: file.name,
        content: content,
        categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : 'misc',
        tags: ['Importado', file.name.split('.').pop()?.toUpperCase() || 'FILE', isHtml ? 'WEB' : ''].filter(Boolean),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: [],
        thumbnail
      });
    }

    if (newNotes.length > 0) {
      await db.prompts.bulkAdd(newNotes);
      alert(`${newNotes.length} archivo(s) importado(s) correctamente.`);
    }
    
    setIsImporting(false);
  };

  const handlePreviewHtml = (content: string) => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleCreateCategory = async () => {
    const newCategory: Category = {
      id: crypto.randomUUID(),
      name: 'Nueva Categoría',
      icon: 'Compass',
      color: 'text-zinc-600'
    };
    await db.categories.add(newCategory);
    setEditingCategoryId(newCategory.id);
    setEditingCategoryName(newCategory.name);
  };

  const handleStartEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
  };

  const handleSaveCategoryName = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    await db.categories.update(id, { name: editingCategoryName.trim() });
    setEditingCategoryId(null);
  };

  const handleUnlock = () => {
    const savedPin = localStorage.getItem('prompt_vault_pin');
    if (pinInput === savedPin) {
      setIsLocked(false);
      setPinInput('');
      setError('');
    } else {
      setError('PIN Incorrecto');
      setPinInput('');
    }
  };

  const handleSetPin = () => {
    if (newPin.length < 4) {
      setError('El PIN debe tener al menos 4 caracteres');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Los PINs no coinciden');
      return;
    }
    localStorage.setItem('prompt_vault_pin', newPin);
    setIsLocked(false);
    setIsSettingPin(false);
    setNewPin('');
    setConfirmPin('');
    setError('');
  };

  const handleLock = () => {
    setIsLocked(true);
  };

  const generateThumbnail = (file: File, content: string): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 160;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(undefined);
        img.src = content;
        return;
      }
      resolve(undefined);
    });
  };

  const handleDeleteCategory = (id: string) => {
    if (id === 'all' || id === 'misc') {
      alert('Esta categoría no se puede eliminar.');
      return;
    }
    setCategoryDeleteConfirmation(id);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryDeleteConfirmation) return;
    const id = categoryDeleteConfirmation;
    
    await db.transaction('rw', db.categories, db.prompts, async () => {
      await db.categories.delete(id);
      await db.prompts.where('categoryId').equals(id).modify({ categoryId: 'misc' });
    });

    if (selectedCategoryId === id) setSelectedCategoryId('all');
    setCategoryDeleteConfirmation(null);
  };

  const getIcon = (iconName: string) => {
    const icons: Record<string, any> = { Layout, Code, Edit3, MessageSquare, Lightbulb, Compass };
    const IconComponent = icons[iconName] || Layout;
    return <IconComponent size={18} />;
  };

  return (
    <div className="min-h-screen w-full flex flex-col p-4 md:p-8 bg-paper text-ink font-sans">
      <AnimatePresence>
        {isLocked && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-paper"
          >
            <div className="w-full max-w-xs p-8 flex flex-col items-center text-center">
              <div className="mb-8 p-6 border border-ink rounded-full">
                <Lock size={48} className="text-ink" />
              </div>
              
              <h1 className="font-serif text-3xl italic mb-2 tracking-tight">Acceso Restringido</h1>
              <p className="text-[10px] font-bold uppercase letter-spacing-wide opacity-40 mb-8">
                {localStorage.getItem('prompt_vault_pin') ? 'Introduce tu PIN para desbloquear' : 'Establece un PIN de seguridad'}
              </p>

              {localStorage.getItem('prompt_vault_pin') ? (
                <div className="w-full space-y-4">
                  <input 
                    type="password"
                    placeholder="PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    className="w-full text-center py-4 bg-transparent border-b border-ink focus:outline-none text-2xl tracking-[1em]"
                    autoFocus
                  />
                  {error && <p className="text-[10px] text-red-500 font-bold uppercase">{error}</p>}
                  <button 
                    onClick={handleUnlock}
                    className="w-full py-4 bg-ink text-paper text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all"
                  >
                    Desbloquear
                  </button>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <input 
                    type="password"
                    placeholder="NUEVO PIN"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full text-center py-3 bg-transparent border-b border-ink focus:outline-none text-lg tracking-[0.5em]"
                  />
                  <input 
                    type="password"
                    placeholder="CONFIRMAR PIN"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full text-center py-3 bg-transparent border-b border-ink focus:outline-none text-lg tracking-[0.5em]"
                  />
                  {error && <p className="text-[10px] text-red-500 font-bold uppercase">{error}</p>}
                  <button 
                    onClick={handleSetPin}
                    className="w-full py-4 bg-ink text-paper text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all"
                  >
                    Guardar PIN
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
        {/* Custom Deletion Modals */}
        <AnimatePresence>
          {deleteConfirmation && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDeleteConfirmation(null)}
                className="absolute inset-0 bg-ink/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-sm bg-white border border-ink overflow-hidden"
              >
                <div className="p-8 text-center text-ink">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
                    <Trash2 size={32} />
                  </div>
                  <h3 className="font-serif text-2xl italic mb-3">¿Eliminar esta nota?</h3>
                  <p className="text-[10px] font-bold uppercase letter-spacing-wide opacity-40 mb-8">Esta acción no se puede deshacer.</p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      type="button"
                      onClick={confirmDelete}
                      className="w-full py-4 bg-red-600 text-white text-[10px] font-bold uppercase letter-spacing-wide hover:bg-red-700 transition-all shadow-lg active:scale-95"
                    >
                      Sí, Eliminar Ahora
                    </button>
                    <button 
                      type="button"
                      onClick={() => setDeleteConfirmation(null)}
                      className="w-full py-4 bg-white border border-ink text-ink text-[10px] font-bold uppercase letter-spacing-wide hover:bg-gray-100 transition-all active:scale-95"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {categoryDeleteConfirmation && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCategoryDeleteConfirmation(null)}
                className="absolute inset-0 bg-ink/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-sm bg-white border border-ink overflow-hidden"
              >
                <div className="p-8 text-center text-ink">
                  <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100">
                    <TagIcon size={32} />
                  </div>
                  <h3 className="font-serif text-2xl italic mb-3">¿Eliminar categoría?</h3>
                  <p className="text-[10px] font-bold uppercase letter-spacing-wide opacity-40 mb-8">Las notas de esta categoría se moverán a "Varios".</p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      type="button"
                      onClick={confirmDeleteCategory}
                      className="w-full py-4 bg-ink text-paper text-[10px] font-bold uppercase letter-spacing-wide hover:opacity-90 transition-all shadow-lg active:scale-95"
                    >
                      Eliminar Categoría
                    </button>
                    <button 
                      type="button"
                      onClick={() => setCategoryDeleteConfirmation(null)}
                      className="w-full py-4 bg-white border border-ink text-ink text-[10px] font-bold uppercase letter-spacing-wide hover:bg-gray-100 transition-all active:scale-95"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-ink pb-4 mb-6 md:mb-8 gap-4">
        <div className="flex flex-col relative group">
          <span className="text-[9px] md:text-[10px] font-bold uppercase letter-spacing-wide mb-1 md:mb-2 opacity-60">The Registry</span>
          <div className="flex items-center gap-4">
            <h1 className="font-serif text-4xl md:text-6xl italic letter-spacing-tight leading-none tracking-tighter">My Note Pro</h1>
            <button 
              onClick={handleLock}
              className="p-2 border border-ink/20 hover:border-ink rounded-full transition-all md:opacity-0 md:group-hover:opacity-100"
              title="Bloquear Bóveda"
            >
              <Unlock size={20} className="md:size-24 scale-50" />
            </button>
          </div>
        </div>
        <div className="text-left md:text-right w-full md:w-auto flex md:flex-col justify-between items-end border-t md:border-t-0 border-ink/10 pt-2 md:pt-0">
          <span className="block text-[8px] md:text-[10px] font-mono uppercase opacity-40 md:opacity-100 italic md:not-italic">v.4.02 — Stable</span>
          <span className="block text-[9px] md:text-xs opacity-50 font-mono">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} GMT</span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 flex flex-col md:grid md:grid-cols-12 gap-6 md:gap-8 overflow-hidden md:h-[calc(100vh-180px)]">
        {/* Navigation Sidebar */}
        <aside className="md:col-span-3 flex flex-col justify-between md:border-r border-ink md:pr-6 overflow-y-auto md:overflow-visible custom-scrollbar">
          <nav className="flex flex-col gap-6 md:gap-8">
            <section className="order-2 md:order-1">
              <div className="relative">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-ink/30" size={14} />
                <input 
                  type="text"
                  placeholder="SEARCH ARCHIVE..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-6 py-2 bg-transparent border-b border-ink/10 focus:border-ink focus:outline-none text-[10px] uppercase font-bold letter-spacing-wide transition-all"
                />
              </div>
            </section>

            <section className="order-1 md:order-2 pb-2 md:pb-0">
              <div className="flex justify-between items-baseline mb-3 md:mb-4">
                <span className="text-[9px] md:text-[10px] font-bold uppercase letter-spacing-wide opacity-40 block">Categorías</span>
                <button 
                  onClick={() => setIsManagingCategories(true)}
                  className="flex items-center gap-1.5 px-2 py-1 md:p-1 hover:bg-ink hover:text-paper border border-ink/20 md:border-transparent hover:border-ink transition-all rounded text-[9px] font-bold uppercase"
                  title="Gestionar Categorías"
                >
                  <Settings size={14} />
                  <span className="md:hidden">Editar</span>
                </button>
              </div>
              <ul className="grid grid-cols-2 md:flex md:flex-col gap-2 md:gap-1 text-[10px] md:text-xs font-bold md:font-normal">
                {categories.map((cat, idx) => (
                  <li key={cat.id}>
                    <button
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`w-full flex justify-between items-center py-1.5 md:py-2 px-3 md:px-0 border md:border-0 rounded-full md:rounded-none md:border-b transition-all ${
                        selectedCategoryId === cat.id 
                        ? 'bg-ink text-paper border-ink md:bg-transparent md:text-ink md:border-ink md:font-bold' 
                        : 'border-ink/10 md:border-transparent hover:border-ink/30 text-ink/60 hover:text-ink'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate uppercase md:capitalize">
                        <span className="hidden md:inline opacity-30 font-mono text-[9px]">{String(idx).padStart(2, '0')}.</span> {cat.name}
                      </span>
                      <span className="hidden md:inline opacity-40 font-normal ml-2">
                        {cat.id === 'all' ? prompts.length : prompts.filter(p => p.categoryId === cat.id).length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="hidden md:block">
              <span className="text-[10px] font-bold uppercase letter-spacing-wide opacity-40 block mb-4">Active Tags</span>
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(prompts.flatMap(p => p.tags))).slice(0, 8).map(tag => (
                  <span key={tag} className="px-2 py-1 border border-ink text-[9px] uppercase font-bold letter-spacing-wide opacity-40 hover:opacity-100 transition-opacity cursor-default">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          </nav>

              <div className="md:mt-auto pt-6 md:pt-8 order-3 space-y-3">
                <button 
                  type="button"
                  onClick={() => {
                    setCurrentPrompt({ categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : 'misc' });
                    setIsEditing(true);
                  }}
                  className="w-full bg-ink text-paper py-3.5 md:py-4 px-6 text-[10px] md:text-xs font-bold flex justify-between items-center group active:scale-[0.98] transition-all hover:bg-ink/90 shadow-lg md:shadow-none pointer-events-auto"
                >
                  <span className="letter-spacing-wide uppercase">
                    Nueva Nota {selectedCategoryId !== 'all' ? `en ${categories.find(c => c.id === selectedCategoryId)?.name}` : ''}
                  </span>
                  <Plus size={16} />
                </button>

                <label className="w-full bg-paper border border-ink text-ink py-3.5 md:py-4 px-6 text-[10px] md:text-xs font-bold flex justify-between items-center group active:scale-[0.98] transition-all hover:bg-ink hover:text-paper cursor-pointer shadow-lg md:shadow-none pointer-events-auto">
                  <span className="letter-spacing-wide uppercase">
                    {isImporting ? 'PROCESANDO...' : 'Subir Archivos'}
                  </span>
                  <File size={16} />
                  <input 
                    type="file" 
                    multiple
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={isImporting}
                  />
                </label>

                <label className="w-full bg-paper border border-ink text-ink py-3.5 md:py-4 px-6 text-[10px] md:text-xs font-bold flex justify-between items-center group active:scale-[0.98] transition-all hover:bg-ink hover:text-paper cursor-pointer shadow-lg md:shadow-none pointer-events-auto">
                  <span className="letter-spacing-wide uppercase">
                    {isImporting ? 'PROCESANDO...' : 'Subir Carpeta'}
                  </span>
                  <Upload size={16} />
                  <input 
                    type="file" 
                    webkitdirectory="" 
                    directory="" 
                    className="hidden" 
                    onChange={handleFolderUpload}
                    disabled={isImporting}
                  />
                </label>
              </div>
        </aside>

        {/* Prompt List */}
        <section className="md:col-span-5 md:border-r border-ink md:pr-6 overflow-y-auto custom-scrollbar md:h-full">
          <div className="mb-4 md:mb-6 flex justify-between items-baseline sticky top-0 bg-paper/95 backdrop-blur-sm z-10 py-2 md:py-0">
            <h2 className="font-serif text-2xl md:text-3xl italic tracking-tight">
              {categories.find(c => c.id === selectedCategoryId)?.name || 'Archive'}
            </h2>
            <span className="text-[9px] md:text-[10px] font-mono opacity-50 uppercase tracking-tighter">Entry count: {filteredPrompts.length}</span>
          </div>
          
          <div className="space-y-4 md:space-y-6 pb-20 md:pb-8">
            {filteredPrompts.map((prompt) => (
              <motion.div
                key={prompt.id}
                layout
                onClick={() => {
                  setCurrentPrompt(prompt);
                  setIsEditing(true);
                }}
                className="p-4 border border-ink/10 hover:border-ink bg-white transition-all cursor-pointer group relative active:bg-paper/50"
              >
                <div className="flex justify-between text-[8px] md:text-[9px] uppercase font-bold mb-2 md:mb-3 letter-spacing-wide">
                  <span className="opacity-30 tracking-widest">ID:{prompt.id.slice(0, 8).toUpperCase()}</span>
                  <div className="flex items-center gap-1">
                    <span className="opacity-30">Ver. 1.0</span>
                    <button 
                      type="button"
                      onClick={(e) => handleDelete(prompt.id, e)}
                      className="ml-2 p-2 -m-2 text-ink hover:text-red-600 transition-colors flex items-center justify-center relative z-20 pointer-events-auto active:scale-90"
                      title="Eliminar Nota"
                    >
                      <Trash2 size={16} className="pointer-events-none" />
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  {(prompt.thumbnail || prompt.tags.includes('HTML')) && (
                    <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 border border-ink/10 overflow-hidden bg-gray-50 flex items-center justify-center relative group-hover:border-ink/30 transition-all">
                      {prompt.thumbnail ? (
                        <img 
                          src={prompt.thumbnail} 
                          className="object-cover w-full h-full" 
                          referrerPolicy="no-referrer" 
                          alt="preview"
                        />
                      ) : prompt.tags.includes('HTML') ? (
                        <div className="absolute inset-0 scale-[0.25] origin-top-left w-[400%] h-[400%] pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity translate-x-1 translate-y-1">
                          <iframe 
                            srcDoc={prompt.content} 
                            className="w-full h-full border-0 pointer-events-none"
                            title="peek"
                          />
                        </div>
                      ) : null}
                      {!prompt.thumbnail && prompt.tags.includes('HTML') && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <Compass size={14} className="opacity-20" />
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg md:text-xl font-bold leading-tight md:leading-none mb-1 md:mb-2 tracking-tight md:group-hover:underline decoration-1 underline-offset-4 truncate">{prompt.title}</h3>
                    <div className="flex gap-2 mb-2">
                      <span className="text-[7px] md:text-[8px] font-bold uppercase opacity-40 px-1 border border-ink/10 rounded-sm">
                        {categories.find(c => c.id === prompt.categoryId)?.name || 'Varios'}
                      </span>
                    </div>
                    <p className="text-[11px] md:text-xs leading-relaxed opacity-70 line-clamp-2 italic font-serif">
                      "{prompt.content}"
                    </p>
                  </div>
                </div>
                
                <div className="mt-3 md:mt-4 flex items-center justify-between">
                  <div className="flex gap-1">
                    {prompt.variables.length > 0 && (
                      <span className="text-[8px] font-bold uppercase bg-ink text-paper px-1 md:px-1.5 py-0.5">
                        {prompt.variables.length} VARS
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(prompt.content, prompt.id);
                      }}
                      className={`p-1 px-3 border border-ink text-[8px] md:text-[9px] font-bold uppercase transition-all ${
                        copyStatus === prompt.id ? 'bg-ink text-paper' : 'hover:bg-ink hover:text-paper'
                      }`}
                    >
                      {copyStatus === prompt.id ? 'COPIADO' : 'COPIAR'}
                    </button>
                    {prompt.tags.includes('HTML') && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewHtml(prompt.content);
                        }}
                        className="p-1 px-2 border border-ink text-[8px] md:text-[9px] font-bold uppercase hover:bg-ink hover:text-paper transition-all flex items-center gap-1"
                      >
                        <Compass size={10} />
                        VER
                      </button>
                    )}
                    <button className="md:hidden p-1 px-2 border border-ink text-[10px]">
                      <Edit3 size={10} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {filteredPrompts.length === 0 && (
              <div className="py-16 md:py-20 text-center border border-dashed border-ink/20 opacity-40">
                <span className="text-xs font-bold uppercase letter-spacing-wide italic font-serif">End of Archive</span>
              </div>
            )}
          </div>
        </section>

        {/* Global Details / Extra Space - Hidden on Mobile unless selected or at bottom */}
        <section className="hidden md:flex md:col-span-4 flex-col pt-2 md:h-full">
          {filteredPrompts.length > 0 ? (
            <div className="flex-1 border border-ink p-6 relative bg-white shadow-[12px_12px_0px_0px_rgba(26,26,26,0.03)] flex flex-col">
              <div className="absolute top-0 right-0 p-4">
                <span className="text-[9px] font-bold uppercase letter-spacing-wide px-2 py-1 bg-ink text-paper">Preview</span>
              </div>
              
              <span className="text-[10px] font-bold uppercase letter-spacing-wide opacity-20 block mb-8">Selected Resource</span>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <h4 className="font-serif text-2xl italic mb-4 leading-tight border-b border-ink/10 pb-4">{filteredPrompts[0].title}</h4>
                <div className="font-serif text-sm leading-relaxed mb-8 opacity-80 overflow-hidden">
                  {filteredPrompts[0].tags.includes('HTML') ? (
                    <div className="w-full border border-ink/10 h-[600px] bg-white rounded-sm overflow-hidden flex flex-col shadow-inner">
                      <div className="bg-zinc-100 px-3 py-2 text-[8px] font-mono border-b border-ink/10 flex justify-between items-center capitalize">
                        <div className="flex items-center gap-2">
                          <Compass size={10} className="text-ink/40" />
                          <span>Página Renderizada</span>
                        </div>
                        <div className="flex gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                        </div>
                      </div>
                      <iframe 
                        title="HTML Preview"
                        srcDoc={filteredPrompts[0].content} 
                        className="w-full flex-1 border-none bg-white"
                        sandbox="allow-scripts"
                      />
                    </div>
                  ) : (filteredPrompts[0].tags.includes('JPG') || filteredPrompts[0].tags.includes('PNG') || filteredPrompts[0].tags.includes('JPEG')) && filteredPrompts[0].content.startsWith('data:image/') ? (
                    <div className="w-full border border-ink/10 p-2 bg-paper flex items-center justify-center min-h-[300px]">
                      <img 
                        src={filteredPrompts[0].content} 
                        alt={filteredPrompts[0].title}
                        className="max-w-full max-h-[500px] object-contain shadow-md"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {filteredPrompts[0].content}
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <span className="text-[9px] font-bold uppercase letter-spacing-wide opacity-40 block">Metadata</span>
                  <div className="grid grid-cols-2 gap-2 text-[9px] uppercase font-bold tracking-wider">
                    <div className="p-3 bg-paper border border-ink/5 flex justify-between">
                      <span className="opacity-40 text-[8px]">Modified</span>
                      <span>{new Date(filteredPrompts[0].updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="p-3 bg-paper border border-ink/5 flex justify-between">
                      <span className="opacity-40 text-[8px]">Length</span>
                      <span>{filteredPrompts[0].content.length} CHR</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-ink flex flex-wrap gap-2">
                <button 
                  onClick={() => handleCopy(filteredPrompts[0].content, filteredPrompts[0].id)}
                  className="flex-1 py-3 border border-ink text-[10px] font-bold uppercase tracking-widest hover:bg-ink hover:text-paper transition-all"
                >
                  Quick Copy
                </button>
                {filteredPrompts[0].tags.includes('HTML') && (
                  <button 
                    onClick={() => handlePreviewHtml(filteredPrompts[0].content)}
                    className="flex-1 py-3 border border-ink text-[10px] font-bold uppercase tracking-widest bg-emerald-50 hover:bg-emerald-500 hover:text-white transition-all"
                  >
                    Abrir en Navegador
                  </button>
                )}
                <button 
                  onClick={() => {
                    setCurrentPrompt(filteredPrompts[0]);
                    setIsEditing(true);
                  }}
                  className="flex-1 py-3 bg-ink text-paper text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all font-mono"
                >
                  Full Edit
                </button>
                <button 
                  type="button"
                  onClick={(e) => handleDelete(filteredPrompts[0].id, e)}
                  className="w-full md:w-auto px-4 py-3 border border-red-200 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center font-mono"
                  title="Eliminar Nota"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 border border-ink/10 flex items-center justify-center italic opacity-20 font-serif">
              Select an entry to view details
            </div>
          )}
          
          <div className="mt-6 h-12 flex items-center justify-between text-[9px] uppercase letter-spacing-wide font-bold opacity-30">
            <span className="hover:opacity-100 cursor-pointer transition-opacity">Export .MD</span>
            <span className="opacity-20">/</span>
            <span className="hover:opacity-100 cursor-pointer transition-opacity">Log v8.2</span>
            <span className="opacity-20">/</span>
            <span className="hover:opacity-100 cursor-pointer transition-opacity">Manifest</span>
          </div>
        </section>
      </main>

      {/* Editorial Editor Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="relative w-full max-w-2xl bg-paper border border-ink shadow-none md:shadow-[16px_16px_0px_0px_rgba(26,26,26,0.1)] overflow-hidden h-full md:h-auto"
            >
              <form onSubmit={handleSave} className="flex flex-col h-full md:max-h-[85vh]">
                <div className="px-6 md:px-8 py-4 md:py-6 border-b border-ink flex items-center justify-between bg-white">
                  <div className="flex flex-col">
                    <span className="text-[8px] md:text-[9px] font-bold uppercase letter-spacing-wide opacity-40">Editor Instance</span>
                    <h2 className="font-serif text-xl md:text-2xl italic tracking-tight">
                      {currentPrompt?.id ? 'Revision Entry' : 'New Entry Creation'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="p-1.5 md:p-2 border border-ink hover:bg-ink hover:text-paper transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 md:space-y-8 custom-scrollbar bg-paper">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
                    <div className="md:col-span-8">
                      <label className="block text-[8px] md:text-[9px] font-bold uppercase tracking-widest opacity-40 mb-2 md:mb-3">Label / Title</label>
                      <input 
                        autoFocus
                        required
                        type="text"
                        placeholder="ENTRY TITLE"
                        value={currentPrompt?.title || ''}
                        onChange={(e) => setCurrentPrompt(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full px-0 py-2 bg-transparent border-b border-ink focus:outline-none font-bold text-lg md:text-xl tracking-tight uppercase"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-[8px] md:text-[9px] font-bold uppercase tracking-widest opacity-40 mb-2 md:mb-3">Classification</label>
                      <div className="relative">
                        <select 
                          value={currentPrompt?.categoryId || 'misc'}
                          onChange={(e) => setCurrentPrompt(prev => ({ ...prev, categoryId: e.target.value }))}
                          className="w-full bg-transparent border border-ink p-2 text-[9px] md:text-[10px] font-bold uppercase appearance-none cursor-pointer pr-8"
                        >
                          {categories.filter(c => c.id !== 'all').map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <label className="block text-[8px] md:text-[9px] font-bold uppercase tracking-widest opacity-40">Cuerpo de la Nota</label>
                      <span className="text-[7px] md:text-[8px] font-bold opacity-30 italic font-serif">Variable syntax: {"{{key}}"}</span>
                    </div>
                    <textarea 
                      required
                      placeholder="ESCRIBE EL CONTENIDO DE LA NOTA..."
                      value={currentPrompt?.content || ''}
                      onChange={(e) => setCurrentPrompt(prev => ({ ...prev, content: e.target.value }))}
                      className="w-full h-48 md:h-64 p-4 bg-white border border-ink/20 focus:border-ink transition-colors outline-none font-serif text-sm leading-relaxed resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] md:text-[9px] font-bold uppercase tracking-widest opacity-40 mb-2 md:mb-3">Tags Index (comma separated)</label>
                    <input 
                      type="text"
                      placeholder="TAG1, TAG2, TAG3"
                      value={currentPrompt?.tags?.join(', ') || ''}
                      onChange={(e) => setCurrentPrompt(prev => ({ ...prev, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                      className="w-full px-0 py-2 bg-transparent border-b border-ink focus:outline-none font-mono text-[9px] md:text-[10px] uppercase opacity-80"
                    />
                  </div>
                </div>

                <div className="px-6 md:px-8 py-4 md:py-6 border-t border-ink bg-white flex flex-col md:flex-row gap-3 md:gap-4 sticky bottom-0">
                  <button 
                    type="submit"
                    className="order-1 md:order-2 flex-[2] py-3.5 md:py-4 bg-ink text-paper text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.99]"
                  >
                    {currentPrompt?.id ? 'COMMIT UPDATE' : 'CREATE ENTRY'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="order-2 md:order-1 flex-1 py-3.5 md:py-4 border border-ink text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
                  >
                    Discard Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Category Management Modal */}
      <AnimatePresence>
        {isManagingCategories && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingCategories(false)}
              className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-paper border border-ink shadow-[20px_20px_0px_0px_rgba(26,26,26,0.1)] overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-ink flex items-center justify-between bg-white">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase letter-spacing-wide opacity-40">System Config</span>
                  <h2 className="font-serif text-2xl italic tracking-tight">Categorías</h2>
                </div>
                <button 
                  onClick={() => setIsManagingCategories(false)}
                  className="p-2 border border-ink hover:bg-ink hover:text-paper transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-3 border border-ink/10 bg-white group min-h-[56px]">
                    {editingCategoryId === cat.id ? (
                      <div className="flex-1 flex gap-2 mr-2">
                        <input
                          autoFocus
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCategoryName(cat.id)}
                          className="flex-1 px-2 py-1 bg-paper border border-ink text-[10px] font-bold uppercase focus:outline-none"
                        />
                        <button 
                          onClick={() => handleSaveCategoryName(cat.id)}
                          className="p-1 px-2 bg-ink text-paper text-[8px] font-bold uppercase"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <span className="font-bold text-xs uppercase letter-spacing-wide truncate mr-2">{cat.name}</span>
                    )}
                    
                    <div className="flex gap-2 shrink-0">
                      {cat.id !== 'all' && cat.id !== 'misc' && (
                        <>
                          {editingCategoryId !== cat.id && (
                            <button 
                              onClick={() => handleStartEditCategory(cat)}
                              className="p-1.5 border border-ink/20 hover:border-ink hover:bg-paper transition-all"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          <button 
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1.5 border border-ink/20 hover:border-red-500 hover:text-red-500 transition-all"
                            title="Eliminar Categoría"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={handleCreateCategory}
                  className="w-full py-4 border border-dashed border-ink/30 text-[10px] font-bold uppercase letter-spacing-wide hover:border-ink hover:bg-white transition-all flex items-center justify-center gap-2"
                >
                  <PlusCircle size={14} />
                  Añadir Categoría
                </button>

                <div className="pt-4 border-t border-ink/10">
                  <span className="text-[9px] font-bold uppercase letter-spacing-wide opacity-40 block mb-3">Seguridad</span>
                  <button 
                    onClick={() => {
                      if (window.confirm('¿Deseas restablecer el PIN? Tendrás que configurar uno nuevo al cerrar.')) {
                        localStorage.removeItem('prompt_vault_pin');
                        window.location.reload();
                      }
                    }}
                    className="w-full py-3 border border-ink text-[10px] font-bold uppercase letter-spacing-wide hover:bg-ink hover:text-paper transition-all flex items-center justify-center gap-2"
                  >
                    <Lock size={14} />
                    Restablecer PIN
                  </button>
                </div>
              </div>

              <div className="px-8 py-4 border-t border-ink bg-gray-50 flex justify-end">
                <button 
                  onClick={() => setIsManagingCategories(false)}
                  className="px-6 py-2 bg-ink text-paper text-[10px] font-bold uppercase tracking-widest hover:opacity-90"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1A1A1A20;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #1A1A1A40;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%231A1A1A'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          background-size: 0.8em;
        }
      `}</style>
    </div>
  );
}
