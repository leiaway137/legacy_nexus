"use client";

import { useState, useEffect } from "react";
import { X, Lock, Users, ShieldAlert, Globe, Loader2, Copy, Check, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { type UserProfile, updateUserProfile, checkSlugAvailability, fetchUserProfile, fetchHighFidelityStories } from "@/lib/mongo/db";
import { generateUniversalCastMappingAction } from "@/app/actions";
import { UNIVERSAL_CAST } from "@/lib/constants";

interface ShareModalProps {
  userId: string;
  onClose: () => void;
}

export function ShareModal({ userId, onClose }: ShareModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [privacyLevel, setPrivacyLevel] = useState<"private" | "family" | "public_anonymized" | "public_transparent">("private");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"checking" | "available" | "taken" | "">("");
  const [familyEmails, setFamilyEmails] = useState("");
  const [pseudoMap, setPseudoMap] = useState<Record<string, string>>({});
  const [casting, setCasting] = useState(false);
  const [newRealName, setNewRealName] = useState("");
  const [newActor, setNewActor] = useState("");

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const data = await fetchUserProfile(userId);
      if (data) {
        setProfile(data);
        setPrivacyLevel(data.privacyLevel || "private");
        setSlug(data.publicSlug || "");
        setFamilyEmails(data.familyAccessEmails?.join(", ") || "");
        setPseudoMap(data.pseudonymMap || {});
      }
      setLoading(false);
    };
    loadProfile();
  }, [userId]);

  useEffect(() => {
    if (!slug) {
      setSlugStatus("");
      return;
    }
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (cleanSlug !== slug) {
       setSlug(cleanSlug);
    }
    
    // Default to available if it matches their existing
    if (profile?.publicSlug === cleanSlug) {
       setSlugStatus("available");
       return;
    }

    setSlugStatus("checking");
    const timeout = setTimeout(async () => {
      const available = await checkSlugAvailability(cleanSlug, userId);
      setSlugStatus(available ? "available" : "taken");
    }, 500);
    return () => clearTimeout(timeout);
  }, [slug, userId, profile]);

  const handleSave = async () => {
    setSaving(true);
    let finalSlug = slug;
    
    // If they switched to public but have no slug, autogenerate one based on name
    if ((privacyLevel === 'public_anonymized' || privacyLevel === 'public_transparent' || privacyLevel === 'family') && !slug) {
        let base = (profile?.firstName || "user") + "-" + (profile?.lastName || Date.now().toString().slice(-4));
        base = base.toLowerCase().replace(/[^a-z0-9-]/g, "");
        let isAvail = await checkSlugAvailability(base, userId);
        if (!isAvail) base += "-" + Math.floor(Math.random() * 1000);
        finalSlug = base;
        setSlug(finalSlug);
    }

    const emailList = familyEmails.split(",").map(e => e.trim()).filter(Boolean);

    await updateUserProfile(userId, {
       privacyLevel,
       publicSlug: finalSlug,
       familyAccessEmails: emailList,
       pseudonymMap: pseudoMap
    });
    
    // If we transition to public anonymized and haven't built it, we need to let the system know to trigger.
    if (privacyLevel === 'public_anonymized' && (!profile?.privacyLevel || profile.privacyLevel !== 'public_anonymized')) {
       // This will flag the server to start job
       await updateUserProfile(userId, { isAnonymizedBuildReady: false });
       // Note: the background anonymization job should be triggered from the backend or an action, 
       // but for now setting this flag will render a "Building..." state.
    }

    setSaving(false);
    onClose();
  };

  const copyLink = () => {
     if (!slug) return;
     navigator.clipboard.writeText(window.location.origin + "/legacy/" + slug);
     setCopied(true);
     setTimeout(() => setCopied(false), 2000);
  };

  const handleAutoCast = async () => {
    setCasting(true);
    const stories = await fetchHighFidelityStories(userId);
    const newMap = await generateUniversalCastMappingAction(stories, pseudoMap);
    setPseudoMap(newMap);
    setCasting(false);
  };

  const addManualCast = () => {
    if (!newRealName.trim() || !newActor.trim()) return;
    setPseudoMap(prev => ({ ...prev, [newRealName.trim()]: newActor.trim() }));
    setNewRealName("");
    setNewActor("");
  };

  const removeCast = (realName: string) => {
    setPseudoMap(prev => {
      const copy = { ...prev };
      delete copy[realName];
      return copy;
    });
  };

  const levels = [
    {
      id: "private",
      icon: <Lock size={18} className="text-zinc-500" />,
      title: "Private",
      desc: "Only you can access this archive.",
    },
    {
      id: "family",
      icon: <Users size={18} className="text-emerald-500" />,
      title: "Family Only",
      desc: "Restricted to specific email addresses you authorize.",
    },
    {
      id: "public_anonymized",
      icon: <ShieldAlert size={18} className="text-blue-500" />,
      title: "Public (Anonymized)",
      desc: "AI redacts all names/locations but shares the life wisdom.",
    },
    {
      id: "public_transparent",
      icon: <Globe size={18} className="text-amber-500" />,
      title: "Public (Transparent)",
      desc: "Fully open. Anyone with the link can explore the true narrative.",
    }
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white dark:bg-zinc-950 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Share Legacy Archive
          </h2>
          <button onClick={onClose} className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-zinc-500">
             <Loader2 size={32} className="animate-spin text-blue-500" />
             Loading settings...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {levels.map((lvl) => (
                <div 
                  key={lvl.id}
                  onClick={() => setPrivacyLevel(lvl.id as any)}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition ${
                    privacyLevel === lvl.id 
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' 
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {lvl.icon}
                    <span className={`font-bold text-sm ${privacyLevel === lvl.id ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {lvl.title}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{lvl.desc}</p>
                </div>
              ))}
            </div>

            <AnimatePresence mode="popLayout">
              {privacyLevel === 'family' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2 overflow-hidden"
                >
                  <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Authorized Family Emails</label>
                  <textarea 
                    value={familyEmails}
                    onChange={(e) => setFamilyEmails(e.target.value)}
                    placeholder="uncle.bob@example.com, cousin.sarah@example.com"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    rows={2}
                  />
                  <p className="text-xs text-zinc-500">Comma-separated list of Google accounts allowed to view.</p>
                </motion.div>
              )}

              {privacyLevel === 'public_anonymized' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-3 overflow-hidden border-t border-zinc-100 dark:border-zinc-800 pt-6"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                       <Users size={14}/> Actor Cast Mapping
                    </label>
                    <button 
                      onClick={handleAutoCast} 
                      disabled={casting}
                      className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-bold transition hover:bg-blue-200 dark:hover:bg-blue-900/50 flex items-center gap-2"
                    >
                      {casting ? <Loader2 size={12} className="animate-spin" /> : "✨"}
                      {casting ? "Casting Roles..." : "Auto-Generate Cast"}
                    </button>
                  </div>
                  
                  <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
                     {Object.keys(pseudoMap).length === 0 ? (
                       <p className="text-sm text-zinc-500 italic text-center py-4">No actors cast yet. Auto-generate or add manually.</p>
                     ) : (
                       <div className="flex flex-col gap-2 mb-4">
                         {Object.entries(pseudoMap).map(([realName, actor]) => (
                            <div key={realName} className="flex items-center justify-between bg-white dark:bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                               <div className="flex items-center gap-3">
                                 <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-through decoration-red-500/50">{realName}</span>
                                 <span className="text-zinc-400 text-xs">played by</span>
                                 <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{actor}</span>
                               </div>
                               <button onClick={() => removeCast(realName)} className="text-red-500 hover:text-red-600"><X size={14}/></button>
                            </div>
                         ))}
                       </div>
                     )}

                     <div className="flex gap-2 items-center">
                        <input 
                          type="text" 
                          placeholder="Real Name" 
                          value={newRealName}
                          onChange={e => setNewRealName(e.target.value)}
                          className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                        />
                        <select 
                          value={newActor}
                          onChange={e => setNewActor(e.target.value)}
                          className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                        >
                           <option value="">Select Universal Actor...</option>
                           {UNIVERSAL_CAST.map(actor => (
                             <option key={actor.name} value={actor.name}>{actor.name} - {actor.role.split('/')[0]}</option>
                           ))}
                        </select>
                        <button 
                          onClick={addManualCast}
                          disabled={!newRealName.trim() || !newActor.trim()}
                          className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                        >Add</button>
                     </div>
                  </div>
                  <p className="text-xs text-zinc-500">Universal actors guarantee character consistency across stories and chat sessions.</p>
                </motion.div>
              )}

              {privacyLevel !== 'private' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2 overflow-hidden border-t border-zinc-100 dark:border-zinc-800 pt-6"
                >
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider flex justify-between">
                    Public Link Customization
                    {slugStatus === 'checking' && <span className="text-zinc-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> checking...</span>}
                    {slugStatus === 'available' && <span className="text-emerald-500 flex items-center gap-1"><Check size={12}/> Address available</span>}
                    {slugStatus === 'taken' && <span className="text-red-500 flex items-center gap-1"><X size={12}/> Address taken</span>}
                  </label>
                  <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 focus-within:ring-2 focus-within:ring-blue-500/50">
                    <span className="text-zinc-400 text-sm pl-2 select-none font-mono">legacynexus.app/legacy/</span>
                    <input 
                      type="text" 
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="custom-name"
                      className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300"
                    />
                  </div>

                  {slug && slugStatus === 'available' && (
                    <div className="mt-4 p-4 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 flex flex-col gap-3">
                      <p className="text-xs text-zinc-500 flex items-center gap-2 font-medium">
                        <Info size={14} className="text-blue-500" /> This will be your sharing link:
                      </p>
                      <div className="flex gap-2">
                        <input 
                          readOnly 
                          value={typeof window !== 'undefined' ? `${window.location.origin}/legacy/${slug}` : `https://legacynexus.app/legacy/${slug}`}
                          className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-600 dark:text-zinc-300"
                        />
                        <button 
                           onClick={copyLink}
                           className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition hover:opacity-90"
                        >
                           {copied ? <Check size={16}/> : <Copy size={16}/>}
                           {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}

        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
           <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50 transition">
             Cancel
           </button>
           <button 
             onClick={handleSave} 
             disabled={saving || (privacyLevel !== 'private' && slugStatus === 'taken')}
             className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition shadow-md hover:shadow-lg"
           >
             {saving ? <Loader2 size={16} className="animate-spin"/> : null}
             {saving ? 'Saving...' : 'Save Privacy Options'}
           </button>
        </div>
      </motion.div>
    </div>
  );
}
