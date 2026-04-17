"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, User, Mail, ShieldCheck, Phone, Edit3, Trash2, Search, Upload, RefreshCw, Loader2, Quote, Sparkles, Star, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useBackgroundJobs } from "@/components/BackgroundJobProvider";
import { fetchContacts, saveContact, deleteContact, fetchUserSources, Contact, NotebookSource, updateContactAccessTier } from "@/lib/firebase/db";
import { parseCSV, parseVCF, correlateContacts } from "@/lib/contacts";
import { fetchHighFidelityStories, saveHighFidelityStories } from "@/lib/firebase/db";
import { recompileStoriesWithContactsAction } from "@/app/actions";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split('');

const getContextSnippet = (sources: NotebookSource[] | undefined, name: string): string => {
  if (!sources || sources.length === 0) return "No context found.";
  for (const src of sources) {
    if (!src.textContent) continue;
    const idx = src.textContent.indexOf(name);
    if (idx !== -1) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(src.textContent.length, idx + name.length + 80);
      return `"...${src.textContent.substring(start, end).replace(/\n/g, ' ')}..."`;
    }
  }
  return "No context available in local cache.";
};

export default function ContactsPage() {
  const { user, loading } = useAuth();
  const { startJob } = useBackgroundJobs();
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'nexus'>('profile');
  
  const [isImporting, setIsImporting] = useState(false);
  const [isCommitingBulk, setIsCommitingBulk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  const [editingData, setEditingData] = useState<(Partial<Contact> & { rawAliasesText?: string }) | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createData, setCreateData] = useState<{firstName: string, lastName: string, relationship: string, email: string}>({firstName: '', lastName: '', relationship: '', email: ''});


  useEffect(() => {
    if (user) {
      fetchContacts(user.uid).then(setContacts);
      fetchUserSources(user.uid).then(setSources);
    }
  }, [user]);

  const activeContact = useMemo(() => contacts.find(c => c.id === activeContactId) || null, [contacts, activeContactId]);

  const potentialDuplicates = useMemo(() => {
      if (!activeContact) return [];
      const activeNameRaw = (activeContact.completeName || activeContact.originalName || "").trim().toLowerCase();
      const activeFirst = (activeContact.firstName || "").trim().toLowerCase();
      const activeLast = (activeContact.lastName || "").trim().toLowerCase();
      
      if (!activeNameRaw && !activeFirst) return [];
      
      return contacts.filter(c => {
         if (c.id === activeContact.id) return false;
         const cNameRaw = (c.completeName || c.originalName || "").trim().toLowerCase();
         const cFirst = (c.firstName || "").trim().toLowerCase();
         const cLast = (c.lastName || "").trim().toLowerCase();
         
         if (activeNameRaw && cNameRaw && activeNameRaw === cNameRaw) return true;
         if (activeFirst && cFirst && activeFirst === cFirst && activeLast === cLast) return true;
         return false;
      });
  }, [contacts, activeContact]);

  const sortedContacts = useMemo(() => {
    let filtered = contacts;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = contacts.filter(c => 
            c.completeName?.toLowerCase().includes(q) || 
            c.originalName?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q)
        );
    }
    
    return filtered.sort((a, b) => {
        // Sort by Last Name if possible, fallback to complete name
        const aName = a.lastName || a.completeName || a.originalName;
        const bName = b.lastName || b.completeName || b.originalName;
        return aName.localeCompare(bName);
    });
  }, [contacts, searchQuery]);

  const groupedContacts = useMemo(() => {
     const groups: Record<string, Contact[]> = {};
     ALPHABET.forEach(l => groups[l] = []);
     
     sortedContacts.forEach(c => {
         const name = c.lastName || c.completeName || c.originalName || "Unknown";
         let firstChar = name.trim().charAt(0).toUpperCase();
         if (!ALPHABET.includes(firstChar)) firstChar = '#';
         groups[firstChar].push(c);
     });
     return groups;
  }, [sortedContacts]);

  const scrollToLetter = (letter: string) => {
      const el = document.getElementById(`letter-${letter}`);
      if (el && listRef.current) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const pContacts = file.name.endsWith('.csv') ? parseCSV(text) : parseVCF(text);
      if (pContacts.length === 0) return alert("Failed to extract contacts. Ensure file format is valid.");
      
      const correlated = correlateContacts(user.uid, pContacts, contacts);
      await Promise.all(correlated.map(c => saveContact(user.uid, c)));
      
      setContacts(correlated);
      alert(`Imported and Correlated ${pContacts.length} contacts automatically.`);
    } catch (err) {
      console.error(err);
      alert("Failed to parse file.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [syncStatus, setSyncStatus] = useState<string>("Aligning...");

  const handleBulkCommit = () => {
    if (!user) return;
    
    // Fire and forget the background job. UI immediately frees up.
    startJob("Aligning Timeline", async (updateProgress) => {
        updateProgress("Fetching existing timeline...", 0, 100);
        const currentStories = await fetchHighFidelityStories(user.uid);
        if (!currentStories) throw new Error("Firebase returned undefined for currentStories");
        
        const relationalContext = "Identity Map & Relationships: " + contacts.map(c => 
            `'${c.originalName}', '${c.aliases.join("', '")}' -> ${c.completeName}` + 
            (c.preferredName ? ` [CRITICAL INSTRUCTION: When rewriting stories, ALWAYS use the preferred name: '${c.preferredName}' for this entity]` : '') +
            (c.relationship ? ` (Relationship to narrator: ${c.relationship})` : '')
        ).join(" | ");
        
        const batchSize = 1;
        let updatedStories: any[] = [];
        const totalBlocks = Math.ceil(currentStories.length / batchSize);
        
        for (let i = 0; i < currentStories.length; i += batchSize) {
           const currentBlock = Math.floor(i / batchSize) + 1;
           const percentRaw = Math.round((currentBlock / totalBlocks) * 100);
           updateProgress(`Re-writing Chapter (${currentBlock}/${totalBlocks})...`, percentRaw, 100);
           
           const batch = currentStories.slice(i, i + batchSize);
           try {
              const resBatch = await recompileStoriesWithContactsAction(batch, relationalContext);
              updatedStories = [...updatedStories, ...(resBatch || batch)];
           } catch (batchErr: any) {
              throw new Error(`Server Action failed on block ${currentBlock}: ${batchErr.message || String(batchErr)}`);
           }
           
           if (i + batchSize < currentStories.length) {
              await new Promise(res => setTimeout(res, 2000));
           }
        }
        
        updateProgress("Saving updated timeline to Firebase...", 99, 100);
        const saved = await saveHighFidelityStories(user.uid, updatedStories);
        if (!saved) throw new Error("Firebase save transaction rejected the write.");
        
        updateProgress("Timeline safely realigned using network data!", 100, 100);
    });
  };

  const saveEdit = async () => {
      if (!user || !activeContact || !editingData) return;
      
      const updatedAliases = editingData.rawAliasesText !== undefined 
           ? editingData.rawAliasesText.split(',').map(s=>s.trim()).filter(Boolean) 
           : (editingData.aliases ?? activeContact.aliases);
           
      const merged = { ...activeContact, ...editingData, aliases: updatedAliases };
      delete merged.rawAliasesText;
      
      await saveContact(user.uid, merged);

      if (editingData.archiveAccessTier !== undefined && editingData.archiveAccessTier !== activeContact.archiveAccessTier) {
          if (merged.email) {
             await updateContactAccessTier(user.uid, activeContact.id, merged.email, merged.archiveAccessTier || 'none');
          }
      }

      setContacts(prev => prev.map(c => c.id === merged.id ? merged : c));
      setEditingData(null);
  };

  const handleSetPreferredName = async (nameToPrefer: string) => {
      if (!user || !activeContact) return;
      const finalVal = activeContact.preferredName === nameToPrefer ? "" : nameToPrefer;
      const updated = { ...activeContact, preferredName: finalVal };
      await saveContact(user.uid, updated);
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const mergeDuplicates = async () => {
      if (!user || !activeContact || potentialDuplicates.length === 0) return;
      setIsCommitingBulk(true);
      const master = { ...activeContact };
      
      try {
          const idsToDelete: string[] = [];
          
          potentialDuplicates.forEach(dup => {
             master.email = master.email || dup.email;
             master.phone = master.phone || dup.phone;
             master.firstName = master.firstName || dup.firstName;
             master.lastName = master.lastName || dup.lastName;
             master.relationship = master.relationship || dup.relationship;
             
             const rawAliases = [...(master.aliases || []), ...(dup.aliases || []), dup.originalName, dup.completeName];
             master.aliases = Array.from(new Set(rawAliases)).filter(a => a && a !== master.originalName && a !== master.completeName) as string[];
             
             if (!master.source || master.source === 'story') {
                master.source = dup.source === 'import' ? 'merged' : master.source;
             }
             
             idsToDelete.push(dup.id);
          });
          
          // Sanitize undefined fields to prevent Firebase setDoc errors
          Object.keys(master).forEach(key => {
              if ((master as any)[key] === undefined) {
                  delete (master as any)[key];
              }
          });
          
          await saveContact(user.uid, master);
          for(const id of idsToDelete) {
             await deleteContact(id);
          }
          
          setContacts(prev => {
             const filtered = prev.filter(c => !idsToDelete.includes(c.id));
             return filtered.map(c => c.id === master.id ? master : c);
          });
          
          alert(`Successfully merged ${idsToDelete.length} duplicate(s)!`);
          
      } catch(e) {
          console.error(e);
          alert("Failed to merge duplicates.");
      } finally {
          setIsCommitingBulk(false);
      }
  };

  const handleCreateContact = async () => {
     if (!user) return;
     if (!createData.firstName && !createData.lastName) return alert("Please provide at least a name.");
     
     const compName = [createData.firstName, createData.lastName].filter(Boolean).join(" ");
     const newContact: Partial<Contact> = {
         userId: user.uid,
         originalName: compName,
         completeName: compName,
         firstName: createData.firstName,
         lastName: createData.lastName,
         preferredName: compName,
         relationship: createData.relationship,
         email: createData.email,
         aliases: [],
         source: 'import',
         linkedAccountId: ""
     };
     
     const newId = await saveContact(user.uid, newContact);
     if (newId) {
         const fullContact = { ...newContact, id: newId } as Contact;
         setContacts(prev => [fullContact, ...prev]);
         setActiveContactId(newId);
         setIsCreateModalOpen(false);
         setCreateData({firstName: '', lastName: '', relationship: '', email: ''});
     } else {
         alert("Failed to create entity. Please try again.");
     }
  };


  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-zinc-400" /></div>;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans">
      
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
         <div className="flex items-center gap-4">
             <div>
                <h1 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                   Address Book
                </h1>
                <p className="text-xs text-zinc-500 font-medium">{contacts.length} saved entities</p>
             </div>
         </div>
         <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Search network..." 
                  className="pl-9 pr-4 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 border-none rounded-full w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
             <div className="flex gap-2">
                 <button onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition shadow-sm">
                   <Plus size={14}/> New Entity
                 </button>
                 <input type="file" accept=".vcf,.csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                 <button disabled={isImporting || isCommitingBulk} onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50">
                   {isImporting ? <Loader2 className="animate-spin" size={14}/> : <Upload size={14}/>}
                   {isImporting ? "Processing..." : "Import CSV/VCF"}
                 </button>
             </div>
             <button disabled={contacts.length === 0} onClick={handleBulkCommit} title="Runs safely in the background" className="bg-zinc-900 dark:bg-white text-white dark:text-black px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 hover:opacity-90">
               <RefreshCw size={14}/>
               Commit Ties to Timeline
             </button>
         </div>
      </header>

      {/* Workspace */}
      <main className="flex-1 flex overflow-hidden">
         
         {/* Left View: Master List with A-Z */}
         <div className="w-1/3 max-w-md bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col relative h-full">
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 pr-8 pb-32">
                {ALPHABET.map(letter => {
                    const group = groupedContacts[letter];
                    if (group.length === 0) return null;
                    return (
                        <div key={letter} id={`letter-${letter}`} className="mb-6">
                           <div className="text-xl font-bold font-serif text-indigo-600 dark:text-indigo-400 mb-2 border-b border-zinc-100 dark:border-zinc-800 pb-1">{letter}</div>
                           <div className="flex flex-col gap-1">
                               {group.map(c => (
                                   <div 
                                      key={c.id} 
                                      onClick={() => { setActiveContactId(c.id); setEditingData(null); setActiveTab('profile'); }}
                                      className={`px-3 py-2 cursor-pointer flex items-center justify-between rounded-lg transition ${activeContactId === c.id ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'}`}
                                   >
                                      <div className="flex flex-col flex-1 truncate">
                                         <div className="flex items-center gap-1.5">
                                             <span className="font-semibold text-sm truncate">
                                                {c.lastName ? `${c.lastName}, ${c.firstName || ''}` : (c.completeName || c.originalName)}
                                             </span>
                                             {Boolean(c.firstName && c.lastName && (c.preferredName || c.aliases?.length > 0)) && (
                                                <ShieldCheck size={14} className={activeContactId === c.id ? "text-indigo-200 fill-indigo-400" : "text-emerald-500 fill-emerald-100 dark:fill-emerald-900"} />
                                             )}
                                         </div>
                                         {c.relationship && (
                                            <span className={`text-[10px] lowercase font-medium ${activeContactId === c.id ? 'text-indigo-200' : 'text-zinc-400'}`}>
                                                {c.relationship}
                                            </span>
                                         )}
                                      </div>
                                   </div>
                               ))}
                           </div>
                        </div>
                    );
                })}
                {sortedContacts.length === 0 && (
                   <div className="text-center py-20 text-zinc-400 text-sm">
                      No contacts found matching criteria.
                   </div>
                )}
            </div>

            {/* Strict iOS A-Z Scroller Tool */}
            <div className="absolute right-0 top-0 bottom-0 w-12 flex flex-col items-center justify-center gap-[1px] py-4 z-10 select-none">
                {ALPHABET.map(letter => {
                    const count = groupedContacts[letter]?.length || 0;
                    return (
                        <div 
                           key={letter} 
                           onClick={() => count > 0 && scrollToLetter(letter)}
                           className={`flex items-center gap-0.5 text-[9px] cursor-pointer w-full justify-center px-1 py-[2px] rounded-sm transition-transform ${
                               count > 0 
                               ? "font-bold text-indigo-600 dark:text-indigo-400 hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800" 
                               : "font-medium text-zinc-300 dark:text-zinc-700"
                           }`}
                           title={count > 0 ? `${count} contacts` : 'No contacts'}
                        >
                            <span>{letter}</span>
                            {count > 0 && <span className="opacity-60 text-[7px] tracking-tighter">[{count}]</span>}
                        </div>
                    );
                })}
            </div>
         </div>

         {/* Right View: Detailed Identity Card */}
         <div className="flex-1 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
            {activeContact ? (
                <div className="max-w-3xl mx-auto py-12 px-8">
                   <div className="flex items-start gap-6 mb-8">
                      <div className="w-24 h-24 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 flex items-center justify-center text-3xl font-serif font-black shadow-inner flex-shrink-0">
                         {((activeContact.firstName || activeContact.completeName || activeContact.originalName)[0] || 'U').toUpperCase()}
                      </div>
                      <div className="flex flex-col pt-2 w-full">
                         <div className="flex justify-between w-full">
                             <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
                               {activeContact.completeName || activeContact.originalName}
                             </h2>
                             <div className="flex items-center gap-2">
                                {activeContact.source === 'merged' && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider flex items-center gap-1 h-max"><ShieldCheck size={12}/> Verified</span>}
                                {activeContact.source === 'import' && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider h-max">Imported</span>}
                                {(!activeContact.source || activeContact.source === 'story') && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider h-max">AI Extracted</span>}
                                <button onClick={async () => {
                                    if(confirm('Are you sure you want to delete this entity?')) {
                                        await deleteContact(activeContact.id);
                                        setContacts(prev => prev.filter(c => c.id !== activeContact.id));
                                        setActiveContactId(null);
                                    }
                                }} className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider flex items-center gap-1 h-max transition ml-2">
                                    <Trash2 size={12}/> Delete
                                </button>
                             </div>
                         </div>
                         <div className="flex items-center gap-4 text-sm text-zinc-500 font-medium">
                            {activeContact.phone && <span className="flex items-center gap-1.5"><Phone size={14}/> {activeContact.phone}</span>}
                            {activeContact.email && <span className="flex items-center gap-1.5"><Mail size={14}/> {activeContact.email}</span>}
                            {!activeContact.phone && !activeContact.email && <span>No contact methods saved.</span>}
                         </div>
                      </div>
                   </div>

                    {/* Tabs */}
                    {potentialDuplicates.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 p-4 rounded-xl mb-6 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-blue-800 dark:text-blue-300 font-bold text-sm">Potential Duplicates Found ({potentialDuplicates.length})</span>
                                <span className="text-blue-600 dark:text-blue-400 text-xs mt-0.5">We found other entries with the same name.</span>
                            </div>
                            <button disabled={isCommitingBulk} onClick={mergeDuplicates} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-sm">
                                {isCommitingBulk ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14}/>}
                                Merge Entities
                            </button>
                        </div>
                    )}
                    <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6">
                      <button 
                        onClick={() => setActiveTab('profile')} 
                        className={`px-6 py-3 font-semibold text-sm transition border-b-2 ${activeTab === 'profile' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                      >
                         Profile Details
                      </button>
                      <button 
                        onClick={() => setActiveTab('nexus')} 
                        className={`px-6 py-3 font-semibold text-sm transition border-b-2 ${activeTab === 'nexus' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                      >
                         Story Association (NexusLink)
                      </button>
                   </div>

                   {/* Tab Content: PROFILE */}
                   {activeTab === 'profile' && (
                      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                             <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200">Contact Card</h3>
                             {!editingData ? (
                                <button onClick={() => setEditingData({})} className="text-sm font-semibold flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 transition">
                                   <Edit3 size={14}/> Edit
                                </button>
                             ) : (
                                <button title="Fast autofill First & Last Name from Canonical Name" onClick={() => {
                                    const defaultParts = (activeContact.completeName || activeContact.originalName || "").trim().split(' ');
                                    if (defaultParts.length > 1) {
                                        setEditingData(prev => ({
                                            ...prev,
                                            firstName: defaultParts[0],
                                            lastName: defaultParts.slice(1).join(' ')
                                        }));
                                    } else {
                                        setEditingData(prev => ({ ...prev, firstName: defaultParts[0] }));
                                    }
                                }} className="text-xs font-semibold flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition px-2 py-1 rounded">
                                    <Sparkles size={12}/> Auto-Split Name
                                </button>
                             )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                             <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">First Name</span>
                                {editingData ? (
                                   <input value={editingData.firstName ?? activeContact.firstName ?? ''} onChange={e => setEditingData({...editingData, firstName: e.target.value})} className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-medium text-sm"/>
                                ) : <span className="font-medium text-zinc-800 dark:text-zinc-200">{activeContact.firstName || '—'}</span>}
                             </div>
                             <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Last Name</span>
                                {editingData ? (
                                   <input value={editingData.lastName ?? activeContact.lastName ?? ''} onChange={e => setEditingData({...editingData, lastName: e.target.value})} className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-medium text-sm"/>
                                ) : <span className="font-medium text-zinc-800 dark:text-zinc-200">{activeContact.lastName || '—'}</span>}
                             </div>
                             <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Phone Mobile</span>
                                {editingData ? (
                                   <input value={editingData.phone ?? activeContact.phone ?? ''} onChange={e => setEditingData({...editingData, phone: e.target.value})} className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-medium text-sm"/>
                                ) : <span className="font-medium text-zinc-800 dark:text-zinc-200">{activeContact.phone || '—'}</span>}
                             </div>
                             <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Backup Email</span>
                                {editingData ? (
                                   <input value={editingData.email ?? activeContact.email ?? ''} onChange={e => setEditingData({...editingData, email: e.target.value})} className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-medium text-sm"/>
                                ) : <span className="font-medium text-zinc-800 dark:text-zinc-200">{activeContact.email || '—'}</span>}
                             </div>
                             <div className="flex flex-col gap-1.5 col-span-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Relationship (To Narrator)</span>
                                {editingData ? (
                                   <select value={editingData.relationship ?? activeContact.relationship ?? ''} onChange={e => setEditingData({...editingData, relationship: e.target.value})} className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-medium text-sm">
                                      <option value="">Unknown</option>
                                      <option value="Self">Self / Account Owner</option>
                                      <optgroup label="Immediate Family">
                                        <option value="Mother">Mother</option>
                                        <option value="Father">Father</option>
                                        <option value="Spouse">Spouse</option>
                                        <option value="Daughter">Daughter</option>
                                        <option value="Son">Son</option>
                                        <option value="Sister">Sister</option>
                                        <option value="Brother">Brother</option>
                                      </optgroup>
                                      <optgroup label="Extended Family (Step/In-Law)">
                                        <option value="Step-Daughter">Step-Daughter</option>
                                        <option value="Step-Son">Step-Son</option>
                                        <option value="Step-Mother">Step-Mother</option>
                                        <option value="Step-Father">Step-Father</option>
                                        <option value="Granddaughter">Granddaughter</option>
                                        <option value="Grandson">Grandson</option>
                                        <option value="Grandmother">Grandmother</option>
                                        <option value="Grandfather">Grandfather</option>
                                        <option value="Aunt">Aunt</option>
                                        <option value="Uncle">Uncle</option>
                                        <option value="Niece">Niece</option>
                                        <option value="Nephew">Nephew</option>
                                        <option value="Cousin">Cousin</option>
                                        <option value="Mother-in-Law">Mother-in-Law</option>
                                        <option value="Father-in-Law">Father-in-Law</option>
                                        <option value="Sister-in-Law">Sister-in-Law</option>
                                        <option value="Brother-in-Law">Brother-in-Law</option>
                                      </optgroup>
                                      <optgroup label="Social & Professional">
                                        <option value="Friend">Friend</option>
                                        <option value="Colleague">Colleague</option>
                                        <option value="Mentor">Mentor</option>
                                        <option value="Student">Student</option>
                                        <option value="Neighbor">Neighbor</option>
                                      </optgroup>
                                   </select>
                                ) : <span className="font-medium text-zinc-800 dark:text-zinc-200">{activeContact.relationship || 'Unspecified'}</span>}
                             </div>
                             <div className="flex flex-col gap-1.5 col-span-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Legacy Archive Access</span>
                                {editingData ? (
                                   <select value={editingData.archiveAccessTier ?? activeContact.archiveAccessTier ?? 'none'} onChange={e => setEditingData({...editingData, archiveAccessTier: e.target.value as any})} className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-medium text-sm">
                                      <option value="none">Standard Access (Fallback to Global Settings)</option>
                                      <option value="family">Trusted Reader / Family Tier</option>
                                   </select>
                                ) : (
                                   <div className="flex items-center gap-2">
                                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                         {activeContact.archiveAccessTier === 'family' ? 'Trusted Reader / Family Tier' : 'Standard Access'}
                                      </span>
                                      {activeContact.archiveAccessTier === 'family' && <ShieldCheck size={14} className="text-emerald-500" />}
                                   </div>
                                )}
                                <p className="text-xs text-zinc-500 mt-1">If approved as a Trusted Reader, this person's email will bypass public anonymization filters and will be authorized to view Family-Only archives.</p>
                             </div>
                          </div>
                          
                          {editingData && (
                             <div className="mt-8 flex gap-3 justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                <button onClick={() => setEditingData(null)} className="px-4 py-2 font-semibold text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">Cancel</button>
                                <button onClick={saveEdit} className="px-6 py-2 font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Save Profile</button>
                             </div>
                          )}
                      </div>
                   )}

                   {/* Tab Content: NEXUSLINK */}
                   {activeTab === 'nexus' && (
                      <div className="space-y-6">
                         
                         {activeContact.source === 'import' ? (
                            <div className="bg-white dark:bg-zinc-900 border-2 border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                               <div className="relative z-10">
                                  <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-200 mb-2">Isolated Identity</h3>
                                  <p className="text-sm text-indigo-700 dark:text-indigo-400/80 leading-relaxed max-w-lg mb-6">
                                     This person was synced from an address book, meaning they are a verified part of your network, but they do not appear in any collected legacy memories yet.
                                  </p>
                                  <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-full flex items-center gap-2 text-sm transition hover:shadow-lg hover:shadow-indigo-500/20">
                                     <Sparkles size={16} /> Prompt a memory via AI
                                  </button>
                               </div>
                            </div>
                         ) : (
                            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-6 shadow-sm">
                               <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-500 mb-3">
                                  <Quote size={14}/> Context String
                               </span>
                               <p className="text-amber-900 dark:text-amber-300 font-serif italic leading-relaxed text-lg pl-4 border-l-4 border-amber-300 dark:border-amber-700">
                                  {getContextSnippet(sources, activeContact.originalName)}
                               </p>
                            </div>
                         )}

                         <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                             <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200 border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">AI Disambiguation</h3>
                             
                             <div className="text-[10px] uppercase font-bold text-zinc-500 mb-3 block">Select a primary name for AI compilation contexts</div>
                             <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                   <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-3">Canon Identifier</span>
                                   <div 
                                      className={`flex items-center gap-1.5 w-max px-3 py-1.5 rounded-full font-mono text-sm cursor-pointer transition border ${activeContact.preferredName === activeContact.originalName ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100' : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-amber-400 group'}`}
                                      onClick={() => handleSetPreferredName(activeContact.originalName)}
                                   >
                                      <Star size={14} className={activeContact.preferredName === activeContact.originalName ? "fill-amber-400 text-amber-500" : "text-zinc-300 dark:text-zinc-600 group-hover:text-amber-400"} />
                                      {activeContact.originalName}
                                   </div>
                                </div>
                                
                                <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                   <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-3 px-1">Known Aliases</span>
                                   {editingData ? (
                                      <input 
                                         value={editingData.rawAliasesText ?? editingData.aliases?.join(', ') ?? activeContact.aliases?.join(', ') ?? ''} 
                                         onChange={e => setEditingData({...editingData, rawAliasesText: e.target.value})} 
                                         className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg font-medium text-sm focus:ring-2 outline-none"
                                         placeholder="e.g. Robert, Rob..."
                                      />
                                   ) : (
                                     <div className="flex flex-wrap gap-2">
                                        {(activeContact.aliases || []).length > 0 ? activeContact.aliases.map(a => (
                                           <div 
                                              key={a}
                                              className={`flex items-center gap-1.5 w-max px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition border ${activeContact.preferredName === a ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100' : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-amber-400 group'}`}
                                              onClick={() => handleSetPreferredName(a)}
                                           >
                                              <Star size={14} className={activeContact.preferredName === a ? "fill-amber-400 text-amber-500" : "text-zinc-300 dark:text-zinc-600 group-hover:text-amber-400"} />
                                              {a}
                                           </div>
                                        )) : <span className="text-xs text-zinc-400 p-1">No aliases to elect. Add some below.</span>}
                                     </div>
                                   )}
                                </div>
                             </div>

                             {editingData ? (
                                <div className="flex gap-2 mt-4 justify-end">
                                   <button onClick={saveEdit} className="px-4 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded text-sm font-semibold">Save Aliases</button>
                                </div>
                             ) : (
                                <button onClick={() => setEditingData({})} className="mt-4 text-xs font-bold text-indigo-600 hover:underline inline-block">Edit Disambiguation Schema</button>
                             )}
                         </div>

                      </div>
                   )}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-8 text-center">
                   <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                      <User size={32} className="text-zinc-300 dark:text-zinc-600" />
                   </div>
                   <h2 className="text-xl font-bold text-zinc-600 dark:text-zinc-300 mb-2">Select a Contact</h2>
                   <p className="max-w-sm text-sm">Review imported relationships, verify AI extraction algorithms, and build NexusLink bonds.</p>
                </div>
            )}
         </div>
      </main>

      {/* CREATE MODAL */}
      <AnimatePresence>
         {isCreateModalOpen && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all"
            >
               <motion.div 
                   initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                   className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl relative border border-zinc-200 dark:border-zinc-800"
               >
                   <button onClick={() => setIsCreateModalOpen(false)} className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition bg-zinc-100 dark:bg-zinc-800 p-2 rounded-full">
                      <X size={16}/>
                   </button>
                   <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mb-4">
                      <User size={20} />
                   </div>
                   <h2 className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-1">Add Contact</h2>
                   <p className="text-sm text-zinc-500 mb-6">Manually inject a person (like yourself) into the Address Book to correctly map their identity across timelines.</p>

                   <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">First Name</span>
                            <input value={createData.firstName} onChange={e => setCreateData({...createData, firstName: e.target.value})} className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none focus:border-indigo-500 transition" placeholder="Leia" />
                         </div>
                         <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Last Name</span>
                            <input value={createData.lastName} onChange={e => setCreateData({...createData, lastName: e.target.value})} className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none focus:border-indigo-500 transition" placeholder="Way" />
                         </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                         <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Relationship (To Narrator)</span>
                         <select value={createData.relationship} onChange={e => setCreateData({...createData, relationship: e.target.value})} className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none focus:border-indigo-500 transition cursor-pointer appearance-none">
                            <option value="">Select a relationship (Optional)</option>
                            <option value="Self">Self / Interviewer</option>
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Daughter">Daughter</option>
                            <option value="Son">Son</option>
                            <option value="Friend">Friend</option>
                            <option value="Colleague">Colleague</option>
                         </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                         <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Email Address</span>
                         <input type="email" value={createData.email} onChange={e => setCreateData({...createData, email: e.target.value})} className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none focus:border-indigo-500 transition" placeholder="Required for Archive Auth (Optional)" />
                      </div>
                   </div>

                   <button onClick={handleCreateContact} className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-indigo-600/20 active:scale-[0.98]">
                      Save to Address Book
                   </button>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

    </div>
  );
}
