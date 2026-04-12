import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, Save, Mail, User, ShieldCheck, Loader2, Quote, RefreshCw, Upload, Sparkles } from "lucide-react";
import { Contact, saveContact, fetchContacts, NotebookSource } from "@/lib/firebase/db";
import { recompileStoriesWithContactsAction } from "@/app/actions";
import { fetchHighFidelityStories, saveHighFidelityStories } from "@/lib/firebase/db";
import { parseCSV, parseVCF, correlateContacts } from "@/lib/contacts";

interface NetworkModalProps {
  userId: string;
  onClose: () => void;
  onContactsUpdated: (contacts: Contact[]) => void;
  contacts: Contact[];
  sources?: NotebookSource[];
}

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

export function NetworkModal({ userId, onClose, onContactsUpdated, contacts: initialContacts, sources }: NetworkModalProps) {
  const [localContacts, setLocalContacts] = useState<Contact[]>(initialContacts);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [isCommitingBulk, setIsCommitingBulk] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Safeguard: Prevent accidental reloads when processing bulk commit
  useEffect(() => {
    if (!isCommitingBulk) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCommitingBulk]);
  
  // Form State
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [aliases, setAliases] = useState("");
  const [email, setEmail] = useState("");

  const handleAutoFillName = (originalName: string) => {
    const parts = originalName.trim().split(/\s+/);
    if (parts.length === 1) {
      setFirstName(parts[0]);
      setMiddleName("");
      setLastName("");
    } else if (parts.length === 2) {
      setFirstName(parts[0]);
      setMiddleName("");
      setLastName(parts[1]);
    } else if (parts.length >= 3) {
      setFirstName(parts[0]);
      setLastName(parts[parts.length - 1]);
      setMiddleName(parts.slice(1, -1).join(" "));
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditingId(contact.id);
    
    // Only prefill First Name with completeName if they actually changed it from originalName
    let derivedFirst = contact.firstName || "";
    if (!derivedFirst && contact.completeName && contact.completeName !== contact.originalName) {
       derivedFirst = contact.completeName;
    }
    setFirstName(derivedFirst);
    
    setMiddleName(contact.middleName || "");
    setLastName(contact.lastName || "");
    setRelationship(contact.relationship || "");
    setAliases((contact.aliases || []).join(", "));
    setEmail(contact.email || "");
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  const handleSave = async (contact: Contact) => {
    const formattedAliases = aliases.split(",").map(s => s.trim()).filter(Boolean);
    const assembledCompleteName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    
    // We only save to Firebase Contact DB here, no background compile!
    const updatedData = { 
       ...contact, 
       completeName: assembledCompleteName || contact.originalName, 
       firstName, 
       middleName, 
       lastName, 
       relationship: relationship || undefined,
       aliases: formattedAliases, 
       email 
    };
    
    await saveContact(userId, updatedData);
    
    // Optimistic local update
    const freshContacts = localContacts.map(c => c.id === contact.id ? { ...c, ...updatedData } : c);
    setLocalContacts(freshContacts);
    onContactsUpdated(freshContacts);
    setEditingId(null);
  };

  const handleBulkCommit = async () => {
    setIsCommitingBulk(true);
    try {
      const freshContacts = await fetchContacts(userId);
      const currentStories = await fetchHighFidelityStories(userId);
      const relationalContext = "Identity Map & Relationships: " + freshContacts.map(c => 
          `'${c.originalName}', '${c.aliases.join("', '")}' -> ${c.completeName}` + 
          (c.relationship ? ` (Relationship to narrator: ${c.relationship})` : '')
      ).join(" | ");
      
      const updatedStories = await recompileStoriesWithContactsAction(currentStories, relationalContext);
      await saveHighFidelityStories(userId, updatedStories);
      alert("Timeline successfully realigned using the new Identity Map!");
    } catch(err) {
      console.error("Failed to recompile stories after contact merge", err);
      alert("Failed to commit timeline changes. Please try again.");
    } finally {
      setIsCommitingBulk(false);
    }
  };

  const handleInvite = (contact: Contact) => {
    if (!contact.email) {
       alert("Please save an email address first.");
       return;
    }
    console.log(`[NEXUSLINK SIMULATION] Mock-sending invite to: ${contact.email}\nSubject: Invitation from ${userId} to map legacy.\nBody: You have been mentioned in an interactive legacy map. Join NexusLink to provide your perspective!`);
    alert(`Invite drafted to ${contact.email} (check console for preview)`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const pContacts = file.name.endsWith('.csv') ? parseCSV(text) : file.name.endsWith('.vcf') ? parseVCF(text) : parseCSV(text);
      
      if (pContacts.length === 0) {
        alert("Failed to extract any contacts. Please check file format.");
        return;
      }
      
      // Run AI Correlation logic
      const correlated = correlateContacts(userId, pContacts, localContacts);
      
      // Persist the delta
      await Promise.all(correlated.map(c => saveContact(userId, c)));
      
      setLocalContacts(correlated);
      onContactsUpdated(correlated);
      alert(`Imported and Correlated ${pContacts.length} contacts automatically.`);
    } catch (err) {
      console.error("Import failed:", err);
      alert("Failed to parse file.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isCommitingBulk ? onClose : undefined}
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative bg-white dark:bg-zinc-900 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800"
      >
        <div className="p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><User className="text-blue-500"/> NexusLink Relationship Map</h2>
            <p className="text-sm text-zinc-500 mt-1">Manage identities and resolve mapping discrepancies.</p>
          </div>
          <div className="flex gap-3">
             <input type="file" accept=".vcf,.csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
             <button disabled={isImporting || isCommitingBulk} onClick={() => fileInputRef.current?.click()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50">
               {isImporting ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16}/>}
               {isImporting ? "Processing..." : "Import Contacts"}
             </button>
             <button disabled={isCommitingBulk || localContacts.length === 0} onClick={handleBulkCommit} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50">
               {isCommitingBulk ? <Loader2 className="animate-spin" size={16}/> : <RefreshCw size={16}/>}
               {isCommitingBulk ? "Rewriting Timeline..." : "Commit Changes"}
             </button>
             <button disabled={isCommitingBulk} onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition disabled:opacity-50"><X size={20}/></button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-50/50 dark:bg-[#121212]">
          {localContacts.length === 0 ? (
             <div className="text-center py-12 text-zinc-500">
               <User className="mx-auto h-12 w-12 text-zinc-300 mb-3"/>
               <p>No contacts discovered yet.</p>
               <p className="text-sm">Upload stories or chat to automatically detect people.</p>
             </div>
          ) : (
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
               {localContacts.map(contact => (
                 <div key={contact.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
                   
                   {editingId === contact.id ? (
                      <div className="p-5 flex flex-col gap-4">
                         
                         <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Extracted Canonical Reference</label>
                            <div className="w-full mt-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50 rounded text-sm text-zinc-500 dark:text-zinc-400 font-mono cursor-not-allowed opacity-80">
                               {contact.originalName}
                            </div>
                         </div>
                         
                         <div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">First Name</label>
                                <input disabled={isCommitingBulk} value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full mt-1 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-sm"/>
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Middle</label>
                                <input disabled={isCommitingBulk} value={middleName} onChange={e => setMiddleName(e.target.value)} className="w-full mt-1 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-sm"/>
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Last Name</label>
                                <input disabled={isCommitingBulk} value={lastName} onChange={e => setLastName(e.target.value)} className="w-full mt-1 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-sm"/>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleAutoFillName(contact.originalName)}
                              disabled={isCommitingBulk}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider mt-2 hover:underline transition"
                            >
                              ⤓ Auto-fill from reference
                            </button>
                         </div>
                         <div>
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Relationship to Narrator</label>
                           <select disabled={isCommitingBulk} value={relationship} onChange={e => setRelationship(e.target.value)} className="w-full mt-1 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-700 dark:text-zinc-300">
                             <option value="">-- Select relationship --</option>
                             <optgroup label="Core">
                               <option value="Self / Account Owner">Self / Account Owner</option>
                             </optgroup>
                             <optgroup label="Immediate Family">
                               <option value="Mother">Mother</option>
                               <option value="Father">Father</option>
                               <option value="Daughter">Daughter</option>
                               <option value="Son">Son</option>
                               <option value="Sister">Sister</option>
                               <option value="Brother">Brother</option>
                               <option value="Spouse">Spouse</option>
                               <option value="Partner">Partner</option>
                             </optgroup>
                             <optgroup label="Extended Family">
                               <option value="Grandmother">Grandmother</option>
                               <option value="Grandfather">Grandfather</option>
                               <option value="Aunt">Aunt</option>
                               <option value="Uncle">Uncle</option>
                               <option value="Cousin">Cousin</option>
                               <option value="Extended Family">Extended Family</option>
                             </optgroup>
                             <optgroup label="Platonic / Professional">
                               <option value="Friend">Friend</option>
                               <option value="Roommate">Roommate</option>
                               <option value="Acquaintance">Acquaintance</option>
                               <option value="Boss">Boss</option>
                               <option value="Employee">Employee</option>
                               <option value="Colleague">Colleague</option>
                               <option value="Client">Client</option>
                               <option value="Mentor">Mentor</option>
                               <option value="Student">Student</option>
                             </optgroup>
                           </select>
                         </div>
                         <div>
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Aliases (comma separated)</label>
                           <input disabled={isCommitingBulk} value={aliases} onChange={e => setAliases(e.target.value)} className="w-full mt-1 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-sm placeholder-zinc-400" placeholder="e.g. Bobby, Rob"/>
                         </div>
                         <div>
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Email Address (NexusLink)</label>
                           <input disabled={isCommitingBulk} value={email} onChange={e => setEmail(e.target.value)} className="w-full mt-1 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-sm placeholder-zinc-400" placeholder="robert@example.com"/>
                         </div>
                         <div className="flex gap-2 mt-2">
                           <button disabled={isCommitingBulk} onClick={() => handleSave(contact)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-semibold flex justify-center items-center gap-2">
                             <Save size={16}/> Save Form Locally
                           </button>
                           <button disabled={isCommitingBulk} onClick={handleCancel} className="flex-[0.4] bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 py-2 rounded text-sm font-semibold">
                             Cancel
                           </button>
                         </div>
                      </div>
                   ) : (
                      <div className="p-5 flex flex-col h-full">
                         <div className="flex justify-between items-start mb-2">
                           <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 truncate pr-2 flex items-center gap-2 flex-wrap">
                             {contact.completeName || contact.originalName}
                             {contact.relationship && (
                                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold border border-indigo-200 dark:border-indigo-800">
                                   {contact.relationship}
                                </span>
                             )}
                           </h3>
                           {contact.linkedAccountId && <ShieldCheck size={18} className="text-emerald-500 flex-shrink-0" title="Verified Nexus User"/>}
                         </div>
                         <div className="text-xs text-zinc-500 mb-2">
                            Extracted as: <span className="font-mono text-zinc-600 dark:text-zinc-400 text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">{contact.originalName}</span>
                         </div>
                         
                         <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider mb-3">
                            {(!contact.source || contact.source === 'story') && <span className="text-blue-500 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 px-2 py-0.5 rounded">Extracted from Story</span>}
                            {contact.source === 'import' && <span className="text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 rounded">Phone Import</span>}
                            {contact.source === 'merged' && <span className="text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded flex items-center gap-1"><ShieldCheck size={10}/> Verified Merge</span>}
                         </div>
                         
                         {/* Disambiguation Context */}
                         {(!contact.source || contact.source === 'story' || contact.source === 'merged') ? (
                           <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-lg p-3 mb-4">
                              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600/70 mb-1.5"><Quote size={10}/> Context Reference</span>
                              <p className="text-xs italic text-zinc-600 dark:text-zinc-400 leading-relaxed truncate whitespace-normal line-clamp-3">
                                 {getContextSnippet(sources, contact.originalName)}
                              </p>
                           </div>
                         ) : (
                           <div className="bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700/50 rounded-lg p-3 mb-4">
                              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Missing Narrative</span>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-3">
                                 This individual was imported from your phone, but has no verified stories associated with them.
                              </p>
                              <button className="w-full justify-center bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800 text-[10px] font-bold uppercase tracking-widest py-2 rounded flex items-center gap-1.5 transition">
                                 <Sparkles size={12}/> Prompt Interview about {contact.firstName || contact.originalName}
                              </button>
                           </div>
                         )}
                         
                         {contact.aliases && contact.aliases.length > 0 && (
                            <div className="mt-auto mb-4 flex flex-wrap gap-1.5">
                              {contact.aliases.map(a => <span key={a} className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded border border-blue-100 dark:border-blue-800/50">{a}</span>)}
                            </div>
                         )}

                         <div className="mt-auto flex gap-2">
                            <button onClick={() => handleEdit(contact)} disabled={isCommitingBulk} className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 py-2 rounded font-semibold transition disabled:opacity-50">
                              Edit Identity Form
                            </button>
                            <button onClick={() => handleInvite(contact)} disabled={isCommitingBulk} className="flex items-center justify-center gap-1.5 flex-[0.7] text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-200 dark:border-emerald-800 py-2 rounded font-semibold transition">
                              <Mail size={14}/> Invite
                            </button>
                         </div>
                      </div>
                   )}
                 </div>
               ))}
             </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
