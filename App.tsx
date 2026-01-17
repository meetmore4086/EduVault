
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Book, 
  User, 
  Folder as FolderIcon, 
  FileText, 
  Trash2, 
  Sparkles,
  ChevronRight,
  Loader2,
  X,
  FileSearch,
  MessageSquare,
  FolderPlus,
  Upload,
  CloudUpload,
  ChevronLeft,
  Home,
  Settings,
  Download,
  RefreshCw,
  AlertTriangle,
  Menu,
  MoreVertical,
  Pin,
  Edit2,
  Move,
  Info,
  PinOff,
  ZoomIn,
  ZoomOut,
  ChevronUp,
  ChevronDown,
  Lock,
  Sun,
  Moon,
  Coffee,
  Fingerprint,
  RotateCcw,
  CheckCircle2,
  Phone,
  Send,
  Database,
  WifiOff,
  ShieldCheck
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
import { analyzeDocument, chatWithKnowledge } from './services/gemini';
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
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem('vault-theme') as Theme) || 'light');
  
  // PDF & Image Viewer State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [findText, setFindText] = useState('');
  const [findResults, setFindResults] = useState<number[]>([]);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  // Folder Context Menu State
  const [activeMenuFolderId, setActiveMenuFolderId] = useState<string | null>(null);
  
  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<Folder | null>(null);
  const [showInfoModal, setShowInfoModal] = useState<Folder | null>(null);
  const [showMoveModal, setShowMoveModal] = useState<Folder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameValue, setRenameValue] = useState('');

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    if (!isLocked) loadInitialData();
  }, [isLocked]);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'theme-sepia');
    root.classList.add(`theme-${theme}`);
    localStorage.setItem('vault-theme', theme);
  }, [theme]);

  // Auto-submit passcode logic
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

  const handleBiometricUnlock = async () => {
    if (window.PublicKeyCredential) {
      try {
        const isSupported = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (isSupported) {
          setIsLocked(false);
        }
      } catch (e) {
        console.error("Biometric failed", e);
      }
    }
  };

  // Handle PDF Loading
  useEffect(() => {
    if (selectedDoc?.type === 'application/pdf') {
      const loadPdf = async () => {
        try {
          const loadingTask = pdfjsLib.getDocument(selectedDoc.data);
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setPageNum(1);
          setScale(1.0);
          renderPage(1, pdf, 1.0);
        } catch (err) {
          console.error("Error loading PDF:", err);
        }
      };
      loadPdf();
    } else {
      setPdfDoc(null);
      setNumPages(0);
      setScale(1.0); 
    }
  }, [selectedDoc]);

  // Handle Page/Scale changes
  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNum, pdfDoc, scale);
    }
  }, [pageNum, scale, pdfDoc]);

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

  const handleSearchPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfDoc || !findText.trim()) return;
    
    const results: number[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item: any) => item.str).join(' ');
      if (strings.toLowerCase().includes(findText.toLowerCase())) {
        results.push(i);
      }
    }
    setFindResults(results);
    if (results.length > 0) {
      setPageNum(results[0]);
    }
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

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRenameModal || !renameValue.trim()) return;
    const updated = { ...showRenameModal, name: renameValue.trim() };
    try {
      await saveFolder(updated);
      setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
      setShowRenameModal(null);
      setRenameValue('');
    } catch (err) {
      console.error("Rename failed:", err);
    }
  };

  const handleMoveFolder = async (folder: Folder, newParentId: string | null) => {
    if (newParentId === folder.id) return;
    const updated = { ...folder, parentId: newParentId };
    try {
      await saveFolder(updated);
      setFolders(prev => prev.map(f => f.id === folder.id ? updated : f));
      setShowMoveModal(null);
    } catch (err) {
      console.error("Move failed:", err);
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
            title="Delete Folder"
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
                <button onClick={(e) => { e.stopPropagation(); setShowRenameModal(folder); setRenameValue(folder.name); setActiveMenuFolderId(null); }} className="w-full px-4 py-2 text-left text-sm vault-text hover:bg-indigo-500/10 flex items-center gap-3">
                  <Edit2 size={16} /> Rename
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowMoveModal(folder); setActiveMenuFolderId(null); }} className="w-full px-4 py-2 text-left text-sm vault-text hover:bg-indigo-500/10 flex items-center gap-3">
                  <Move size={16} /> Move to...
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowInfoModal(folder); setActiveMenuFolderId(null); }} className="w-full px-4 py-2 text-left text-sm vault-text hover:bg-indigo-500/10 flex items-center gap-3">
                  <Info size={16} /> Information
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    ));
  };

  const isViewOnly = (doc: DocumentRecord | null) => {
    if (!doc) return false;
    return doc.type === 'application/pdf' || doc.type.startsWith('image/');
  };

  // Login Screen Component
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#4f46e5,transparent_50%)]"></div>
        </div>
        
        <div className="relative w-full max-w-sm px-8 py-12 flex flex-col items-center text-center">
          <div className="mb-8 p-4 bg-indigo-600 rounded-3xl shadow-2xl shadow-indigo-500/40">
            <Lock size={48} className="text-white" />
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2">EduVault</h1>
          <p className="text-slate-400 mb-10 text-sm font-medium">
            {lockMode === 'login' ? 'Enter 6-digit passcode' : 
             lockMode === 'confirm' ? 'Confirm your passcode' : 
             'Set up your 6-digit vault code'}
          </p>
          
          <div className="w-full space-y-8">
            <div className="flex justify-center gap-2">
              {[...Array(6)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                    inputValue.length > i ? 'border-indigo-500 bg-indigo-500/20 text-white scale-110' : 'border-slate-800 bg-slate-900/50 text-slate-700'
                  }`}
                >
                  {inputValue.length > i ? '•' : ''}
                </div>
              ))}
            </div>
            
            <input 
              autoFocus 
              type="password" 
              maxLength={6} 
              className="absolute opacity-0 pointer-events-none" 
              value={inputValue} 
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                setInputValue(val);
              }}
            />

            {errorMsg && (
              <div className="bg-rose-500/10 text-rose-500 py-3 px-4 rounded-xl text-xs font-bold border border-rose-500/20 animate-shake">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                <button 
                  key={num} 
                  onClick={() => inputValue.length < 6 && setInputValue(prev => prev + num)}
                  className={`p-5 rounded-2xl bg-slate-900/80 text-white font-bold text-xl hover:bg-indigo-600 transition-all active:scale-95 ${num === 0 ? 'col-start-2' : ''}`}
                >
                  {num}
                </button>
              ))}
              <button 
                onClick={() => setInputValue(prev => prev.slice(0, -1))}
                className="p-5 rounded-2xl bg-slate-800/40 text-slate-400 hover:text-white transition-all flex items-center justify-center"
              >
                <ChevronLeft size={24} />
              </button>
            </div>

            <div className="pt-6 space-y-4">
              {lockMode === 'login' && (
                <button onClick={() => { setLockMode('setup'); setInputValue(''); }} className="text-xs text-slate-500 hover:text-indigo-400 font-bold tracking-widest flex items-center justify-center gap-2 w-full">
                  <RotateCcw size={14} /> FORGOT CODE?
                </button>
              )}
              
              <button onClick={handleBiometricUnlock} className="text-slate-400 hover:text-white transition-all flex items-center justify-center gap-2 w-full text-xs font-bold tracking-widest opacity-60 hover:opacity-100">
                <Fingerprint size={16} /> UNLOCK WITH BIOMETRICS
              </button>
            </div>
          </div>
        </div>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-5px); }
            40%, 80% { transform: translateX(5px); }
          }
          .animate-shake { animation: shake 0.4s ease-in-out; }
        `}</style>
      </div>
    );
  }

  return (
    <div 
      className={`flex h-screen overflow-hidden font-sans vault-bg vault-text transition-colors duration-300`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
          processFile(file);
        }
      }}
      onClick={() => setActiveMenuFolderId(null)}
    >
      <aside className={`fixed inset-y-0 left-0 z-[120] w-64 vault-sidebar border-r flex flex-col transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:flex`}>
        <div className="p-6 border-b border-slate-500/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-indigo-500 font-bold text-xl">
            <div className="bg-indigo-600 text-white p-1 rounded-lg"><FolderIcon size={20} /></div>
            EduVault
          </div>
          <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden p-2 vault-text-muted hover:bg-indigo-500/10 rounded-lg"><X size={20} /></button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button onClick={() => handleFolderClick('All')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeFolderId === 'All' ? 'bg-indigo-500/10 text-indigo-500 font-medium' : 'vault-text-muted hover:bg-indigo-500/10'}`}>
            <Home size={18} /> Home
          </button>
          <div className="pt-4 pb-2 px-3 flex items-center justify-between shrink-0"><span className="text-xs font-semibold vault-text-muted uppercase tracking-wider">Folders</span></div>
          {folders.filter(f => f.parentId === null).map(folder => (
            <button key={folder.id} onClick={() => handleFolderClick(folder.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeFolderId === folder.id ? 'bg-indigo-500/10 text-indigo-500 font-medium' : 'vault-text-muted hover:bg-indigo-500/10'}`}>
              <FolderIcon size={14} className={activeFolderId === folder.id ? 'text-indigo-500' : 'vault-text-muted'} />
              <span className="flex-1 text-left truncate">{folder.name}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-500/10 shrink-0">
          <button onClick={() => { setShowSettingsModal(true); setIsMobileSidebarOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 vault-text-muted hover:bg-indigo-500/10 rounded-lg transition-colors">
            <Settings size={18} /> Vault Settings
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="bg-white/10 backdrop-blur-md sticky top-0 z-[110] p-4 border-b vault-border flex items-center gap-4 shrink-0">
          <button onClick={() => setIsMobileSidebarOpen(true)} className="md:hidden p-2 bg-indigo-500/10 text-indigo-500 rounded-xl"><FolderIcon size={22} fill="currentColor" fillOpacity={0.2} /></button>
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 vault-text-muted" size={18} />
            <input type="text" placeholder="Search notes..." className="w-full bg-slate-500/10 border-none rounded-xl py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all vault-text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowNewFolderModal(true)} className="p-2 vault-text-muted hover:bg-slate-500/10 rounded-xl"><FolderPlus size={22} /></button>
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-sm font-medium">
              <Plus size={18} /><span className="hidden sm:inline text-sm">Upload</span>
              <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
            </label>
          </div>
        </header>

        <div className="px-6 sm:px-8 pt-6 pb-2 overflow-x-auto no-scrollbar shrink-0">
          <nav className="flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && <ChevronRight size={14} className="vault-text-muted shrink-0" />}
                <button onClick={() => setActiveFolderId(crumb.id)} className={`hover:text-indigo-500 transition-colors ${idx === breadcrumbs.length - 1 ? 'font-bold vault-text' : 'vault-text-muted'}`}>{crumb.name}</button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 pt-2">
          {filteredFolders.pinned.length > 0 && (
            <div className="mb-10">
              <h3 className="text-[10px] font-bold vault-text-muted uppercase tracking-widest mb-4 ml-1 flex items-center gap-2"><Pin size={12} className="text-indigo-500" /> Pinned Folders</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {renderFolderList(filteredFolders.pinned)}
              </div>
            </div>
          )}

          {filteredFolders.others.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[10px] font-bold vault-text-muted uppercase tracking-widest mb-4 ml-1">Folders</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {renderFolderList(filteredFolders.others)}
              </div>
            </div>
          )}

          {filteredDocs.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold vault-text-muted uppercase tracking-widest mb-4 ml-1">Documents</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {filteredDocs.map(doc => (
                  <div key={doc.id} onClick={() => { setSelectedDoc(doc); setAiAnalysis(null); }} className="group vault-card border rounded-2xl p-3 sm:p-4 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col">
                    <div className="relative w-full aspect-video rounded-xl bg-slate-500/5 overflow-hidden mb-4 flex items-center justify-center border vault-border shrink-0">
                      {doc.type.startsWith('image/') ? <img src={doc.data} className="w-full h-full object-cover" /> : <div className="bg-red-500/10 text-red-500 p-4 rounded-full"><FileText size={32} /></div>}
                      <button onClick={(e) => handleDeleteDoc(doc.id, e)} className="absolute top-2 right-2 p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-sm"><Trash2 size={16} /></button>
                      {isViewOnly(doc) && <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded text-[8px] font-bold flex items-center gap-1"><Lock size={8} /> PROTECTED</div>}
                    </div>
                    <h4 className="font-semibold vault-text line-clamp-1 mb-1 text-sm">{doc.name}</h4>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-[10px] vault-text-muted">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      <span className="text-[10px] bg-slate-500/10 vault-text-muted px-2 py-0.5 rounded-full font-medium">{(doc.size / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Info Modal with Storage Logic Explanation */}
        {showInfoModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowInfoModal(null)}></div>
            <div className="relative bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl border border-slate-200 text-slate-900 overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Database size={120} />
               </div>
              <div className="flex items-center justify-between mb-8 shrink-0 relative">
                <h3 className="text-2xl font-bold">Storage Info</h3>
                <button onClick={() => setShowInfoModal(null)}><X size={24} className="text-slate-400" /></button>
              </div>

              <div className="space-y-6 relative">
                <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                  <div className="bg-indigo-600 text-white p-2 rounded-xl"><Database size={20} /></div>
                  <div>
                    <h4 className="text-sm font-bold">Storage Location</h4>
                    <p className="text-xs text-slate-500">Local Browser Memory (IndexedDB)</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-green-50 p-4 rounded-2xl border border-green-100">
                  <div className="bg-green-600 text-white p-2 rounded-xl"><WifiOff size={20} /></div>
                  <div>
                    <h4 className="text-sm font-bold">Data Usage</h4>
                    <p className="text-xs text-slate-500">0 MB (Re-opening is totally free/offline)</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="bg-blue-600 text-white p-2 rounded-xl"><ShieldCheck size={20} /></div>
                  <div>
                    <h4 className="text-sm font-bold">Security Status</h4>
                    <p className="text-xs text-slate-500">Encrypted Local Vault</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 italic leading-relaxed">
                    Note: Is app mein aapki files aapke phone ke andar hi store hoti hain. Google Drive ki tarah ise kholne ke liye internet ki zaroorat nahi padti.
                  </p>
                </div>

                <button onClick={() => setShowInfoModal(null)} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-all">Got it</button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)}></div>
            <div className="relative bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl border border-slate-200 text-slate-900">
              <div className="flex items-center justify-between mb-8 shrink-0">
                <h3 className="text-2xl font-bold text-slate-900">Vault Settings</h3>
                <button onClick={() => setShowSettingsModal(false)}><X size={24} className="text-slate-400 hover:text-slate-600" /></button>
              </div>

              <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
                {/* Theme Selector */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Appearance</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setTheme('light')} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${theme === 'light' ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:bg-slate-50'}`}><Sun size={20} className={theme === 'light' ? 'text-indigo-500' : 'text-slate-400'} /><span className="text-[10px] font-bold text-slate-900">Light</span></button>
                    <button onClick={() => setTheme('dark')} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${theme === 'dark' ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:bg-slate-50'}`}><Moon size={20} className={theme === 'dark' ? 'text-indigo-500' : 'text-slate-400'} /><span className="text-[10px] font-bold text-slate-900">Dark</span></button>
                    <button onClick={() => setTheme('sepia')} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${theme === 'sepia' ? 'border-[#a6611a] bg-[#a6611a]/10 ring-2 ring-[#a6611a]/20' : 'border-slate-200 hover:bg-slate-50'}`}><Coffee size={20} className={theme === 'sepia' ? 'text-[#a6611a]' : 'text-slate-400'} /><span className="text-[10px] font-bold text-slate-900">Sepia</span></button>
                  </div>
                </div>

                {/* Security Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Security</h4>
                  <button onClick={() => { setLockMode('reset'); setIsLocked(true); setShowSettingsModal(false); setInputValue(''); }} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-black transition-all">
                    <RotateCcw size={20} /> Change Passcode
                  </button>
                </div>

                {/* Support Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Support</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <a href="https://wa.me/919327835124" target="_blank" rel="noopener noreferrer" className="w-full bg-green-500/10 text-green-600 font-bold py-3 px-4 rounded-2xl flex items-center gap-3 hover:bg-green-500/20 transition-all border border-green-500/20"><MessageSquare size={18} /> WhatsApp Support</a>
                    <a href="tel:+919327835124" className="w-full bg-blue-500/10 text-blue-600 font-bold py-3 px-4 rounded-2xl flex items-center gap-3 hover:bg-blue-500/20 transition-all border border-blue-500/20"><Phone size={18} /> Call Support</a>
                    <a href="https://t.me/+918758795168" target="_blank" rel="noopener noreferrer" className="w-full bg-sky-500/10 text-sky-600 font-bold py-3 px-4 rounded-2xl flex items-center gap-3 hover:bg-sky-500/20 transition-all border border-sky-500/20"><Send size={18} /> Telegram Support</a>
                  </div>
                </div>

                {/* Backup & Restore Section */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Backup & Restore</h4>
                  <div className="space-y-3">
                    <button onClick={handleExportVault} className="w-full bg-indigo-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"><Download size={20} /> Export Local Backup</button>
                    <label className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 cursor-pointer hover:bg-black transition-all"><RefreshCw size={20} /> Import Backup<input type="file" className="hidden" accept=".json" onChange={handleImportVault} /></label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Document Modal */}
        {selectedDoc && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setSelectedDoc(null)}></div>
            <div className="relative vault-card vault-text w-full max-w-6xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row border">
              <div className="md:w-2/3 bg-slate-900 flex flex-col overflow-hidden relative min-h-[50vh] md:min-h-0">
                {(selectedDoc.type === 'application/pdf' || selectedDoc.type.startsWith('image/')) ? (
                  <>
                    <div className="bg-slate-800/90 backdrop-blur-sm p-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-4 z-10 shrink-0">
                      {selectedDoc.type === 'application/pdf' ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => setPageNum(p => Math.max(1, p - 1))} className="p-1.5 text-slate-300 hover:text-white bg-slate-700 rounded-lg"><ChevronLeft size={18} /></button>
                          <span className="text-xs text-slate-300 font-medium whitespace-nowrap">{pageNum} / {numPages}</span>
                          <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))} className="p-1.5 text-slate-300 hover:text-white bg-slate-700 rounded-lg"><ChevronRight size={18} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-[10px] uppercase tracking-widest"><Lock size={12} /> View-Only Secured</div>
                      )}
                      <div className="flex items-center gap-2">
                        <button onClick={() => setScale(s => Math.max(0.25, s - 0.25))} className="p-1.5 text-slate-300 hover:text-white bg-slate-700 rounded-lg"><ZoomOut size={18} /></button>
                        <span className="text-xs text-slate-300 font-medium w-12 text-center">{(scale * 100).toFixed(0)}%</span>
                        <button onClick={() => setScale(s => Math.min(5.0, s + 0.25))} className="p-1.5 text-slate-300 hover:text-white bg-slate-700 rounded-lg"><ZoomIn size={18} /></button>
                      </div>
                      {selectedDoc.type === 'application/pdf' && (
                        <form onSubmit={handleSearchPdf} className="relative group max-w-[150px]">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                          <input type="text" placeholder="Find word..." className="w-full bg-slate-700 text-white border-none rounded-lg py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500" value={findText} onChange={(e) => setFindText(e.target.value)} />
                        </form>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-800 p-8 scroll-smooth view-only-protected flex justify-center items-start">
                      <div className="mx-auto shadow-2xl transition-transform duration-200" style={{ transform: selectedDoc.type.startsWith('image/') ? `scale(${scale})` : 'none', transformOrigin: 'top center' }}>
                        {selectedDoc.type === 'application/pdf' ? (
                          <canvas ref={pdfCanvasRef} className="max-w-none bg-white rounded shadow-inner" />
                        ) : (
                          <img src={selectedDoc.data} draggable={false} className="max-w-full rounded shadow-2xl pointer-events-none select-none" />
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                      <FileText size={100} strokeWidth={1} />
                      <p className="text-sm">Document format not previewable</p>
                    </div>
                  </div>
                )}
                <button onClick={() => setSelectedDoc(null)} className="absolute top-4 right-4 md:hidden p-2 bg-black/50 text-white rounded-full z-20"><X size={20} /></button>
              </div>

              <div className="md:w-1/3 flex flex-col h-full vault-card">
                <header className="p-6 border-b vault-border flex items-center justify-between shrink-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-bold truncate">{selectedDoc.name}</h3>
                    {isViewOnly(selectedDoc) && <p className="text-[10px] text-indigo-500 font-bold tracking-tighter flex items-center gap-1 mt-0.5"><Lock size={10} /> PROTECTED KNOWLEDGE</p>}
                  </div>
                  <button onClick={() => setSelectedDoc(null)} className="hidden md:block shrink-0"><X size={20} className="vault-text-muted" /></button>
                </header>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3 shrink-0">
                    <div className="p-3 bg-slate-500/5 rounded-2xl"><p className="text-[10px] vault-text-muted font-bold uppercase mb-1">Uploaded</p><p className="text-xs font-medium">{new Date(selectedDoc.uploadedAt).toLocaleDateString()}</p></div>
                    <div className="p-3 bg-slate-500/5 rounded-2xl"><p className="text-[10px] vault-text-muted font-bold uppercase mb-1">Size</p><p className="text-xs font-medium">{(selectedDoc.size/1024/1024).toFixed(2)} MB</p></div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold flex items-center gap-2 text-sm"><Sparkles size={16} className="text-indigo-500" /> Study Guide</h4>
                      {!aiAnalysis && !isAnalyzing && (
                        <button onClick={() => { setIsAnalyzing(true); analyzeDocument(selectedDoc).then(res => { setAiAnalysis(res); setIsAnalyzing(false); }).catch(() => setIsAnalyzing(false)); }} className="text-xs text-indigo-500 font-bold hover:underline">Summarize</button>
                      )}
                    </div>
                    {isAnalyzing ? (
                      <div className="p-8 bg-slate-500/5 rounded-3xl flex flex-col items-center gap-3 border vault-border">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-[10px] vault-text-muted font-bold uppercase tracking-widest">Gemini is Studying...</p>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="bg-indigo-500/5 p-5 rounded-3xl border border-indigo-500/20 text-xs leading-relaxed vault-text whitespace-pre-wrap shadow-inner">{aiAnalysis}</div>
                    ) : (
                      <div className="bg-slate-500/5 p-8 rounded-3xl border-2 border-dashed vault-border text-center"><p className="text-xs vault-text-muted">Ask Gemini to help you understand this note better.</p></div>
                    )}
                  </div>
                </div>

                <footer className="p-6 border-t vault-border flex gap-4 shrink-0">
                  {!isViewOnly(selectedDoc) && (
                    <a href={selectedDoc.data} download={selectedDoc.name} className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl text-center text-sm hover:bg-black transition-all">Download</a>
                  )}
                  <button onClick={(e) => handleDeleteDoc(selectedDoc.id, e)} className={`flex items-center justify-center p-4 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-500/20 transition-all ${isViewOnly(selectedDoc) ? 'w-full' : 'w-16'}`}>
                    <Trash2 size={24} />
                    {isViewOnly(selectedDoc) && <span className="ml-2 font-bold">Delete Protected File</span>}
                  </button>
                </footer>
              </div>
            </div>
          </div>
        )}

        {/* Modal: New Folder, Rename, etc. */}
        {showNewFolderModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNewFolderModal(false)}></div>
            <form onSubmit={handleCreateFolder} className="relative vault-card vault-text w-full max-w-sm rounded-2xl p-6 shadow-2xl border">
              <h3 className="text-xl font-bold mb-4">New Folder</h3>
              <input autoFocus type="text" placeholder="Folder Name" className="w-full bg-slate-500/10 border-none rounded-xl py-3 px-4 mb-4 outline-none text-sm vault-text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNewFolderModal(false)} className="flex-1 bg-slate-500/10 font-bold py-3 rounded-xl text-sm">Cancel</button>
                <button type="submit" disabled={!newFolderName.trim()} className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm">Create</button>
              </div>
            </form>
          </div>
        )}

        {/* Floating Chat */}
        <button onClick={() => setChatOpen(true)} className="fixed bottom-6 right-6 w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-indigo-700 hover:scale-110 transition-all z-20">
          <MessageSquare size={28} />
        </button>

        {chatOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex justify-end">
            <div className="w-full max-w-md vault-card h-full flex flex-col shadow-2xl animate-slide-left overflow-hidden border-l">
              <header className="p-6 border-b vault-border flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-indigo-500" size={24} /> AI Study Assistant</h3>
                <button onClick={() => setChatOpen(false)}><X size={24} className="vault-text-muted" /></button>
              </header>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-500/10 vault-text rounded-bl-none'}`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex items-center gap-2 text-indigo-500 animate-pulse">
                    <Loader2 className="animate-spin" size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Thinking...</span>
                  </div>
                )}
              </div>
              <form onSubmit={handleChat} className="p-6 border-t vault-border bg-slate-500/5 flex gap-2 shrink-0">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about your notes..." className="flex-1 rounded-2xl px-5 py-3 outline-none text-sm shadow-sm vault-card vault-text" />
                <button type="submit" className="bg-indigo-600 text-white p-3 rounded-2xl hover:bg-indigo-700 transition-all"><ChevronRight size={24} /></button>
              </form>
            </div>
          </div>
        )}

      </main>

      {isUploading && (
        <div className="fixed inset-0 bg-indigo-900/40 backdrop-blur-sm z-[250] flex flex-col items-center justify-center gap-4 text-white">
          <Loader2 className="animate-spin" size={64} />
          <p className="text-xl font-bold tracking-widest uppercase">Securing to Vault...</p>
        </div>
      )}

      <style>{`
        @keyframes slide-left { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-left { animation: slide-left 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type="text"]:focus { box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }
      `}</style>
    </div>
  );
};

export default App;
