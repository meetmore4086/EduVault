
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Folder as FolderIcon, 
  FileText, 
  Trash2, 
  Sparkles,
  ChevronRight,
  Loader2,
  X,
  MessageSquare,
  FolderPlus,
  ChevronLeft,
  Home,
  Settings,
  Download,
  RefreshCw,
  MoreVertical,
  Pin,
  PinOff,
  Sun,
  Moon,
  Coffee,
  Lock
} from 'lucide-react';
import { DocumentRecord, Folder } from './types';
import { 
  getAllDocuments, 
  saveDocument, 
  deleteDocument, 
  getFolders, 
  saveFolder, 
  deleteFolder,
  exportVaultData,
  restoreVaultData
} from './services/db';
import { chatWithKnowledge } from './services/gemini';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs';

type Theme = 'light' | 'dark' | 'sepia';

const App: React.FC = () => {
  const [isLocked, setIsLocked] = useState(true);
  const [passcode, setPasscode] = useState<string>(localStorage.getItem('vault-code') || '');
  const [lockMode, setLockMode] = useState<'login' | 'setup' | 'confirm' | 'reset'>(passcode ? 'login' : 'setup');
  const [tempCode, setTempCode] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem('vault-theme') as Theme) || 'light');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  // PDF & Image Viewer State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  // Context Menu State
  const [activeMenuFolderId, setActiveMenuFolderId] = useState<string | null>(null);
  
  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    if (!isLocked) loadInitialData();
  }, [isLocked]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'theme-sepia');
    root.classList.add(`theme-${theme}`);
    localStorage.setItem('vault-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (inputValue.length === 6) {
      handleLockAction();
    }
  }, [inputValue]);

  const handleLockAction = () => {
    setErrorMsg('');
    if (lockMode === 'login') {
      if (inputValue === passcode) {
        setIsLocked(false);
      } else {
        setErrorMsg('Incorrect Passcode');
        setInputValue('');
      }
    } else if (lockMode === 'setup' || lockMode === 'reset') {
      setTempCode(inputValue);
      setInputValue('');
      setLockMode('confirm');
    } else if (lockMode === 'confirm') {
      if (inputValue === tempCode) {
        localStorage.setItem('vault-code', inputValue);
        setPasscode(inputValue);
        setIsLocked(false);
      } else {
        setErrorMsg('Codes do not match. Start over.');
        setInputValue('');
        setLockMode('setup');
      }
    }
  };

  useEffect(() => {
    if (selectedDoc?.type === 'application/pdf') {
      const loadPdf = async () => {
        try {
          const loadingTask = pdfjsLib.getDocument(selectedDoc.data);
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
          setPageNum(1);
          renderPage(1, pdf, 1.0);
        } catch (err) {
          console.error("Error loading PDF:", err);
        }
      };
      loadPdf();
    } else {
      setPdfDoc(null);
    }
  }, [selectedDoc]);

  const renderPage = async (num: number, pdf: any, currentScale: number) => {
    if (!pdfCanvasRef.current) return;
    const page = await pdf.getPage(num);
    const viewport = page.getViewport({ scale: currentScale });
    const canvas = pdfCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;
  };

  const loadInitialData = async () => {
    try {
      const [docs, fetchedFolders] = await Promise.all([
        getAllDocuments(),
        getFolders()
      ]);
      setFolders(fetchedFolders);
      setDocuments(docs.sort((a, b) => b.uploadedAt - a.uploadedAt));
    } catch (err) {
      console.error("Failed to load vault data:", err);
    }
  };

  const processFile = async (file: File) => {
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64Data = event.target?.result as string;
        let folderId = activeFolderId === 'All' ? 'root' : activeFolderId;

        const newDoc: DocumentRecord = {
          id: crypto.randomUUID(),
          name: file.name,
          folderId,
          type: file.type,
          data: base64Data,
          uploadedAt: Date.now(),
          size: file.size,
          tags: [],
        };

        await saveDocument(newDoc);
        setDocuments(prev => [newDoc, ...prev]);
      } catch (err) {
        console.error("Upload failed:", err);
        alert("Could not upload file to vault.");
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    if (e.target) e.target.value = '';
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const folder: Folder = {
      id: `f-${Date.now()}`,
      name: newFolderName.trim(),
      parentId: activeFolderId === 'All' ? null : activeFolderId,
      isPinned: false,
      createdAt: Date.now()
    };

    try {
      await saveFolder(folder);
      setFolders(prev => [...prev, folder]);
      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (err) {
      console.error("Folder creation failed:", err);
    }
  };

  const handleTogglePin = async (folder: Folder) => {
    const updated = { ...folder, isPinned: !folder.isPinned };
    try {
      await saveFolder(updated);
      setFolders(prev => prev.map(f => f.id === folder.id ? updated : f));
      setActiveMenuFolderId(null);
    } catch (err) {
      console.error("Pinning failed:", err);
    }
  };

  const handleDeleteFolder = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const hasDocs = documents.some(d => d.folderId === id);
    const hasSubFolders = folders.some(f => f.parentId === id);
    if (hasDocs || hasSubFolders) {
      alert("This folder contains items. Delete or move them first.");
      return;
    }
    if (confirm("Delete this folder?")) {
      try {
        await deleteFolder(id);
        setFolders(prev => prev.filter(f => f.id !== id));
        if (activeFolderId === id) setActiveFolderId('All');
        setActiveMenuFolderId(null);
      } catch (err) {
        console.error("Folder deletion failed:", err);
      }
    }
  };

  const handleDeleteDoc = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("Delete this document?")) {
      try {
        await deleteDocument(id);
        setDocuments(prev => prev.filter(d => d.id !== id));
        if (selectedDoc?.id === id) setSelectedDoc(null);
      } catch (err) {
        console.error("Document deletion failed:", err);
      }
    }
  };

  const handleExportVault = async () => {
    try {
      const data = await exportVaultData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eduvault-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  const handleImportVault = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.folders && data.documents) {
          if (confirm("Restore from backup?")) {
            await restoreVaultData(data);
            await loadInitialData();
            setShowSettingsModal(false);
          }
        }
      } catch (err) {
        alert("Failed to restore vault.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
      const aiMsg = await chatWithKnowledge(userMsg, documents);
      setChatHistory(prev => [...prev, { role: 'ai', text: aiMsg }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleFolderClick = (id: string) => {
    setActiveFolderId(id);
    setIsMobileSidebarOpen(false);
  };

  const breadcrumbs = useMemo(() => {
    if (activeFolderId === 'All') return [{ id: 'All', name: 'Home' }];
    const path: { id: string, name: string }[] = [];
    let currentId: string | null = activeFolderId;
    while (currentId) {
      const folder = folders.find(f => f.id === currentId);
      if (folder) {
        path.unshift({ id: folder.id, name: folder.name });
        currentId = folder.parentId;
      } else { currentId = null; }
    }
    path.unshift({ id: 'All', name: 'Home' });
    return path;
  }, [activeFolderId, folders]);

  const filteredFolders = useMemo(() => {
    if (searchQuery) return { pinned: [], others: [] };
    const currentViewFolders = activeFolderId === 'All' 
      ? folders.filter(f => f.parentId === null)
      : folders.filter(f => f.parentId === activeFolderId);
    
    return {
      pinned: currentViewFolders.filter(f => f.isPinned),
      others: currentViewFolders.filter(f => !f.isPinned)
    };
  }, [folders, activeFolderId, searchQuery]);

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (searchQuery) return matchesSearch;
      if (activeFolderId === 'All') return doc.folderId === 'All' || doc.folderId === 'root';
      return doc.folderId === activeFolderId;
    });
  }, [documents, searchQuery, activeFolderId]);

  const renderFolderList = (folderList: Folder[]) => {
    return folderList.map(folder => (
      <div 
        key={folder.id}
        onClick={() => handleFolderClick(folder.id)}
        className="group flex items-center gap-4 vault-card border p-4 rounded-2xl cursor-pointer hover:shadow-lg hover:border-indigo-400/50 transition-all relative"
      >
        <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors relative shrink-0">
          <FolderIcon size={20} fill="currentColor" fillOpacity={0.2} />
          {folder.isPinned && (
            <div className="absolute -top-1 -right-1 p-0.5 bg-indigo-500 text-white rounded-full">
              <Pin size={8} fill="currentColor" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold vault-text truncate text-sm">{folder.name}</h4>
          <p className="text-[10px] vault-text-muted">
            {folders.filter(f => f.parentId === folder.id).length + documents.filter(d => d.folderId === folder.id).length} items
          </p>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={(e) => handleDeleteFolder(folder.id, e)}
            className="p-2 vault-text-muted hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-all"
          >
            <Trash2 size={18} />
          </button>
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuFolderId(activeMenuFolderId === folder.id ? null : folder.id);
              }}
              className="p-2 vault-text-muted hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
            >
              <MoreVertical size={18} />
            </button>
            {activeMenuFolderId === folder.id && (
              <div className="absolute right-0 top-full mt-2 w-48 vault-card border rounded-xl shadow-2xl z-[130] py-2 overflow-hidden animate-in fade-in zoom-in duration-150">
                <button onClick={(e) => { e.stopPropagation(); handleTogglePin(folder); }} className="w-full px-4 py-2 text-left text-sm vault-text hover:bg-indigo-500/10 flex items-center gap-3">
                  {folder.isPinned ? <PinOff size={16} /> : <Pin size={16} />} {folder.isPinned ? 'Unpin' : 'Pin to top'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    ));
  };

  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950">
        <div className="relative w-full max-w-sm px-8 py-12 flex flex-col items-center text-center">
          <div className="mb-8 p-4 bg-indigo-600 rounded-3xl shadow-2xl shadow-indigo-500/40">
            <Lock size={48} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">EduVault</h1>
          <p className="text-slate-400 mb-10 text-sm">
            {lockMode === 'login' ? 'Enter 6-digit passcode' : lockMode === 'confirm' ? 'Confirm your passcode' : 'Set up your vault code'}
          </p>
          <div className="w-full space-y-8">
            <div className="flex justify-center gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${inputValue.length > i ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-700'}`}>
                  {inputValue.length > i ? '•' : ''}
                </div>
              ))}
            </div>
            <input autoFocus type="password" maxLength={6} className="absolute opacity-0 pointer-events-none" value={inputValue} onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))} />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                <button key={num} onClick={() => inputValue.length < 6 && setInputValue(prev => prev + num)} className={`p-5 rounded-2xl bg-slate-900/80 text-white font-bold text-xl hover:bg-indigo-600 transition-all ${num === 0 ? 'col-start-2' : ''}`}>{num}</button>
              ))}
              <button onClick={() => setInputValue(prev => prev.slice(0, -1))} className="p-5 rounded-2xl bg-slate-800/40 text-slate-400 hover:text-white flex items-center justify-center"><ChevronLeft size={24} /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden font-sans vault-bg vault-text transition-colors duration-300`} onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) processFile(file); }} onClick={() => setActiveMenuFolderId(null)}>
      <aside className={`fixed inset-y-0 left-0 z-[120] w-64 vault-sidebar border-r flex flex-col transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:flex`}>
        <div className="p-6 border-b border-slate-500/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-indigo-500 font-bold text-xl"><div className="bg-indigo-600 text-white p-1 rounded-lg"><FolderIcon size={20} /></div>EduVault</div>
          <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden p-2 vault-text-muted hover:bg-indigo-500/10 rounded-lg"><X size={20} /></button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button onClick={() => handleFolderClick('All')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeFolderId === 'All' ? 'bg-indigo-500/10 text-indigo-500 font-medium' : 'vault-text-muted hover:bg-indigo-500/10'}`}><Home size={18} /> Home</button>
          <div className="pt-4 pb-2 px-3 flex items-center justify-between shrink-0"><span className="text-xs font-semibold vault-text-muted uppercase tracking-wider">Folders</span></div>
          {folders.filter(f => f.parentId === null).map(folder => (
            <button key={folder.id} onClick={() => handleFolderClick(folder.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeFolderId === folder.id ? 'bg-indigo-500/10 text-indigo-500 font-medium' : 'vault-text-muted hover:bg-indigo-500/10'}`}><FolderIcon size={14} /><span className="flex-1 text-left truncate">{folder.name}</span></button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-500/10 shrink-0">
          <button onClick={() => { setShowSettingsModal(true); setIsMobileSidebarOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 vault-text-muted hover:bg-indigo-500/10 rounded-lg transition-colors"><Settings size={18} /> Vault Settings</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="bg-white/10 backdrop-blur-md sticky top-0 z-[110] p-4 border-b vault-border flex items-center gap-4 shrink-0">
          <button onClick={() => setIsMobileSidebarOpen(true)} className="md:hidden p-2 bg-indigo-500/10 text-indigo-500 rounded-xl"><FolderIcon size={22} /></button>
          <div className="relative flex-1 max-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 vault-text-muted" size={18} />
            <input type="text" placeholder="Search notes..." className="w-full bg-slate-500/10 border-none rounded-xl py-2 pl-10 pr-4 outline-none text-sm vault-text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowNewFolderModal(true)} className="p-2 vault-text-muted hover:bg-slate-500/10 rounded-xl"><FolderPlus size={22} /></button>
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-sm font-medium"><Plus size={18} /><span className="hidden sm:inline text-sm">Upload</span><input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" /></label>
          </div>
        </header>

        <div className="px-6 sm:px-8 pt-6 pb-2 overflow-x-auto shrink-0">
          <nav className="flex items-center gap-2 text-xs sm:text-sm">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && <ChevronRight size={14} className="vault-text-muted" />}
                <button onClick={() => setActiveFolderId(crumb.id)} className={`hover:text-indigo-500 ${idx === breadcrumbs.length - 1 ? 'font-bold vault-text' : 'vault-text-muted'}`}>{crumb.name}</button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 pt-2">
          {filteredFolders.pinned.length > 0 && (
            <div className="mb-10">
              <h3 className="text-[10px] font-bold vault-text-muted uppercase tracking-widest mb-4 ml-1 flex items-center gap-2"><Pin size={12} className="text-indigo-500" /> Pinned</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{renderFolderList(filteredFolders.pinned)}</div>
            </div>
          )}
          {filteredFolders.others.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[10px] font-bold vault-text-muted uppercase tracking-widest mb-4 ml-1">Folders</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{renderFolderList(filteredFolders.others)}</div>
            </div>
          )}
          {filteredDocs.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold vault-text-muted uppercase tracking-widest mb-4 ml-1">Documents</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {filteredDocs.map(doc => (
                  <div key={doc.id} onClick={() => { setSelectedDoc(doc); }} className="group vault-card border rounded-2xl p-3 sm:p-4 cursor-pointer hover:shadow-xl transition-all flex flex-col">
                    <div className="relative w-full aspect-video rounded-xl bg-slate-500/5 overflow-hidden mb-4 flex items-center justify-center border vault-border shrink-0">
                      {doc.type.startsWith('image/') ? <img src={doc.data} className="w-full h-full object-cover" alt={doc.name} /> : <div className="bg-red-500/10 text-red-500 p-4 rounded-full"><FileText size={32} /></div>}
                      <button onClick={(e) => handleDeleteDoc(doc.id, e)} className="absolute top-2 right-2 p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>
                    </div>
                    <h4 className="font-semibold vault-text line-clamp-1 mb-1 text-sm">{doc.name}</h4>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)}></div>
            <div className="relative bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl border border-slate-200 text-slate-900 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold">Vault Settings</h3>
                <button onClick={() => setShowSettingsModal(false)}><X size={24} className="text-slate-400" /></button>
              </div>
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Appearance</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setTheme('light')} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 ${theme === 'light' ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-200'}`}><Sun size={20} /><span className="text-[10px] font-bold">Light</span></button>
                    <button onClick={() => setTheme('dark')} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 ${theme === 'dark' ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-200'}`}><Moon size={20} /><span className="text-[10px] font-bold">Dark</span></button>
                    <button onClick={() => setTheme('sepia')} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 ${theme === 'sepia' ? 'border-[#a6611a] bg-[#a6611a]/10' : 'border-slate-200'}`}><Coffee size={20} /><span className="text-[10px] font-bold">Sepia</span></button>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Backup & Storage</h4>
                  <button onClick={handleExportVault} className="w-full bg-indigo-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3"><Download size={20} /> Export Vault Data</button>
                  <label className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 cursor-pointer"><RefreshCw size={20} /> Import/Restore Vault<input type="file" className="hidden" accept=".json" onChange={handleImportVault} /></label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Folder Modal */}
        {showNewFolderModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNewFolderModal(false)}></div>
            <form onSubmit={handleCreateFolder} className="relative bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 text-slate-900">
              <h3 className="text-xl font-bold mb-6">Create New Folder</h3>
              <input 
                autoFocus 
                type="text" 
                placeholder="Folder Name" 
                className="w-full bg-slate-100 border-none rounded-2xl px-5 py-3 mb-6 outline-none focus:ring-2 focus:ring-indigo-500" 
                value={newFolderName} 
                onChange={(e) => setNewFolderName(e.target.value)} 
              />
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowNewFolderModal(false)} className="flex-1 font-bold py-3 text-slate-400">Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-2xl">Create</button>
              </div>
            </form>
          </div>
        )}

        {/* Doc View Modal */}
        {selectedDoc && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedDoc(null)}></div>
            <div className="relative bg-white w-full max-w-4xl h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
              <header className="p-4 sm:p-6 border-b flex items-center justify-between bg-white shrink-0">
                <h3 className="font-bold text-slate-900 truncate pr-4">{selectedDoc.name}</h3>
                <button onClick={() => setSelectedDoc(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={24} className="text-slate-400" /></button>
              </header>
              <div className="flex-1 overflow-auto bg-slate-50 flex justify-center p-4 sm:p-8">
                {selectedDoc.type.startsWith('image/') ? (
                  <img src={selectedDoc.data} className="max-w-full h-auto object-contain rounded-xl shadow-lg" alt={selectedDoc.name} />
                ) : (
                  <div className="w-full flex justify-center">
                    <canvas ref={pdfCanvasRef} className="max-w-full h-auto shadow-2xl rounded-sm" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Floating Chat */}
        <button onClick={() => setChatOpen(true)} className="fixed bottom-6 right-6 w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all z-20"><MessageSquare size={28} /></button>

        {chatOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex justify-end">
            <div className="w-full max-w-md vault-card h-full flex flex-col shadow-2xl animate-slide-left overflow-hidden border-l">
              <header className="p-6 border-b vault-border flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-indigo-500" size={24} /> AI Assistant</h3>
                <button onClick={() => setChatOpen(false)}><X size={24} /></button>
              </header>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles size={32} />
                    </div>
                    <p className="text-sm vault-text-muted">Ask me anything about your notes and documents.</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-500/10 vault-text'}`}><p className="text-sm whitespace-pre-wrap">{msg.text}</p></div>
                  </div>
                ))}
                {isChatLoading && <div className="flex items-center gap-2 text-indigo-500 animate-pulse"><Loader2 className="animate-spin" size={14} /><span className="text-[10px] font-bold">Thinking...</span></div>}
              </div>
              <form onSubmit={handleChat} className="p-6 border-t vault-border bg-slate-500/5 flex gap-2 shrink-0">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about your notes..." className="flex-1 rounded-2xl px-5 py-3 outline-none text-sm vault-card vault-text" />
                <button type="submit" className="bg-indigo-600 text-white p-3 rounded-2xl"><ChevronRight size={24} /></button>
              </form>
            </div>
          </div>
        )}
      </main>

      {isUploading && (
        <div className="fixed inset-0 bg-indigo-900/40 backdrop-blur-sm z-[250] flex flex-col items-center justify-center gap-4 text-white">
          <Loader2 className="animate-spin" size={64} />
          <p className="text-xl font-bold uppercase text-center px-6">Securing to Vault...</p>
        </div>
      )}
      <style>{`
        @keyframes slide-left { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-left { animation: slide-left 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default App;
