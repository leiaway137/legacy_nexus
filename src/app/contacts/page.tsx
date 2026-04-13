"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, User, Mail, ShieldCheck, Phone, Edit3, Trash2, Search, Upload, RefreshCw, Loader2, Quote, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchContacts, saveContact, deleteContact, fetchUserSources, Contact, NotebookSource } from "@/lib/firebase/db";
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

  const handleBulkCommit = async () => {
    if (!user) return;
    setIsCommitingBulk(true);
    try {
      const currentStories = await fetchHighFidelityStories(user.uid);
      const relationalContext = "Identity Map & Relationships: " + contacts.map(c => 
          `'${c.originalName}', '${c.aliases.join("', '")}' -> ${c.completeName}` + 
          (c.relationship ? ` (Relationship to narrator: ${c.relationship})` : '')
      ).join(" | ");
      const batchSize = 1;
      let updatedStories: any[] = [];
      for (let i = 0; i < currentStories.length; i += batchSize) {
         const batch = currentStories.slice(i, i + batchSize);
         const resBatch = await recompileStoriesWithContactsAction(batch, relationalContext);
         updatedStories = [...updatedStories, ...resBatch];
         if (i + batchSize < currentStories.length) {
            await new Promise(res => setTimeout(res, 2500)); // Rate limit buffer
         }
      }
      
      await saveHighFidelityStories(user.uid, updatedStories);
      alert("Timeline successfully realigned using the Address Book details!");
    } catch(err: any) {
      console.error(err);
      alert("Failed to commit timeline changes: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsCommitingBulk(false);
    }
  };

  const saveEdit = async () => {
      if (!user || !activeContact || !editingData) return;
      
      const updatedAliases = editingData.rawAliasesText !== undefined 
           ? editingData.rawAliasesText.split(',').map(s=>s.trim()).filter(Boolean) 
           : (editingData.aliases ?? activeContact.aliases);
           
      const merged = { ...activeContact, ...editingData, aliases: updatedAliases };
      delete merged.rawAliasesText;
      
      await saveContact(user.uid, merged);
      setContacts(prev => prev.map(c => c.id === merged.id ? merged : c));
      setEditingData(null);
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

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-zinc-400" /></div>;

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans">
      
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
         <div className="flex items-center gap-4">
             <Link href="/" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition text-zinc-500">
               <ArrowLeft size={20} />
             </Link>
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
             </div>
             <input type="file" accept=".vcf,.csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
             <button disabled={isImporting || isCommitingBulk} onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50">
               {isImporting ? <Loader2 className="animate-spin" size={14}/> : <Upload size={14}/>}
               {isImporting ? "Processing..." : "Import"}
             </button>
             <button disabled={isCommitingBulk || contacts.length === 0} onClick={handleBulkCommit} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50">
               {isCommitingBulk ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
               {isCommitingBulk ? "Aligning..." : "Commit Ties to Timeline"}
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
                                      <div className="flex flex-col">
                                         <span className="font-semibold text-sm">
                                            {c.lastName ? `${c.lastName}, ${c.firstName || ''}` : (c.completeName || c.originalName)}
                                         </span>
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
            <div className="absolute right-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-0.5 py-4 z-10 select-none">
                {ALPHABET.map(letter => (
                    <div 
                       key={letter} 
                       onClick={() => scrollToLetter(letter)}
                       className="text-[10px] font-bold text-indigo-500/60 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer w-full text-center hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-transform"
                    >
                        {letter}
                    </div>
                ))}
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
                             
                             <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                   <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">Canon Identifier</span>
                                   <span className="font-mono text-sm bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded text-zinc-700 dark:text-zinc-300">
                                      {activeContact.originalName}
                                   </span>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                   <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-2 px-1">Known Aliases</span>
                                   {editingData ? (
                                      <input 
                                         value={editingData.rawAliasesText ?? editingData.aliases?.join(', ') ?? activeContact.aliases?.join(', ') ?? ''} 
                                         onChange={e => setEditingData({...editingData, rawAliasesText: e.target.value})} 
                                         className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded font-medium text-sm focus:ring-2 outline-none"
                                         placeholder="e.g. Bobby, Rob..."
                                      />
                                   ) : (
                                     <div className="flex flex-wrap gap-1">
                                        {(activeContact.aliases || []).length > 0 ? activeContact.aliases.map(a => <span key={a} className="bg-zinc-200 dark:bg-zinc-800 text-xs px-2 py-1 rounded font-medium">{a}</span>) : <span className="text-xs text-zinc-400 p-1">No aliases saved.</span>}
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
    </div>
  );
}
