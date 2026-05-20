"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, BookOpen, PenTool, Sparkles, Loader2, Library, Feather, X, RefreshCw } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { HighFidelityStory } from "@/lib/rag";
import { fetchHighFidelityStories, saveHighFidelityStories } from "@/lib/local-db/db";
import { generateSandersonChapterAction } from "@/app/actions";
import ReactMarkdown from "react-markdown";
import { useTranslations } from 'next-intl';

const ERA_ORDER: Record<string, number> = {
  "Childhood": 1,
  "Teens": 2,
  "Twenties": 3,
  "Thirties": 4,
  "Forties": 5,
  "Fifties+": 6,
  "Timeless": 99
};

export default function MyStoriesPage() {
  const t = useTranslations('MyStoriesPage');
  const { user, loading } = useAuth();
  const [stories, setStories] = useState<HighFidelityStory[]>([]);
  const [activeStory, setActiveStory] = useState<HighFidelityStory | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [selectionContext, setSelectionContext] = useState<{text: string; x: number; y: number} | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editorialDraft, setEditorialDraft] = useState("");

  const handleSelection = () => {
     const selection = window.getSelection();
     if (selection && selection.toString().trim() !== "") {
        const text = selection.toString().trim();
        if (text.length < 5) return;
        
        try {
           const range = selection.getRangeAt(0);
           const rect = range.getBoundingClientRect();
           setSelectionContext({
              text,
              x: rect.left + rect.width / 2,
              y: Math.max(rect.top - 10, 40)
           });
        } catch (e) {
           console.error(e);
        }
     } else if (!isEditingNotes) {
        setSelectionContext(null);
     }
  };

  // Auto-scroll to top when a new story is selected
  useEffect(() => {
     if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeStory?.id]);
  useEffect(() => {
    async function load() {
      if (!user?.uid) return;
      try {
        const cached = await fetchHighFidelityStories(user.uid);
        // Sort chronologically
        const sorted = [...cached].sort((a, b) => (ERA_ORDER[a.era] || 99) - (ERA_ORDER[b.era] || 99));
        setStories(sorted);
        setActiveStory(prev => {
          if (prev && sorted.some(s => s.id === prev.id)) {
            return sorted.find(s => s.id === prev.id) || prev;
          }
          return sorted.length > 0 ? sorted[0] : null;
        });
      } catch (err) {
        console.error(err);
      } finally {
        setIsInitializing(false);
      }
    }
    load();
  }, [user?.uid]);

  // Group stories by Era for the Table of Contents
  const groupedStories = stories.reduce((acc, story) => {
    if (!acc[story.era]) acc[story.era] = [];
    acc[story.era].push(story);
    return acc;
  }, {} as Record<string, HighFidelityStory[]>);

  const eras = Object.keys(groupedStories).sort((a, b) => (ERA_ORDER[a] || 99) - (ERA_ORDER[b] || 99));

  async function handleGenerateChapter(notes?: string) {
    if (!activeStory || !user) return;
    setIsGenerating(true);
    setSelectionContext(null);
    setIsEditingNotes(false);
    
    try {
      const markdown = await generateSandersonChapterAction(activeStory, notes);
      if (markdown && !markdown.startsWith("Failed")) {
        // Update local state and tracking timestamps
        const updatedStory = { 
           ...activeStory, 
           sandersonAdaptation: markdown,
           sandersonGeneratedAt: Date.now()
        };
        const newStories = stories.map(s => s.id === updatedStory.id ? updatedStory : s);
        
        setStories(newStories);
        setActiveStory(updatedStory);
        
        // Persist to Firebase
        await saveHighFidelityStories(user.uid, newStories);
      } else {
         alert(t('failedToAdapt'));
      }
    } catch (err) {
      console.error(err);
      alert(t('errorGenerating'));
    } finally {
      setIsGenerating(false);
      setEditorialDraft("");
    }
  }

  if (loading || isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F4F1EA] dark:bg-[#111111]"><Loader2 className="animate-spin text-zinc-500" /></div>;
  }
  if (!user) return <div className="min-h-screen bg-[#F4F1EA] dark:bg-[#111111] px-4"><LoginModule /></div>;

  return (
    <div className="h-screen bg-[#F4F1EA] dark:bg-[#111111] flex flex-col font-sans transition-colors duration-500 overflow-hidden">
      
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-300/50 dark:border-zinc-800/50 bg-[#F4F1EA]/80 dark:bg-[#111111]/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/progress" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition flex items-center gap-2 text-sm font-medium">
            <ArrowLeft size={16} /> {t('dashboard')}
          </Link>
          <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
          <Link href="/stories" className="text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition flex items-center gap-2 text-sm font-medium">
            <Library size={16} /> {t('timeline')}
          </Link>
        </div>
        <div className="text-sm font-serif italic text-zinc-500 dark:text-zinc-400">
           {t('theLibrary')}
        </div>
      </header>

      {stories.length === 0 ? (
         <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <BookOpen size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
            <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-200 mb-2">{t('bookEmpty')}</h2>
            <p className="text-zinc-500 max-w-md">{t('bookEmptyDesc')}</p>
         </div>
      ) : (
         <div className="flex-1 flex overflow-hidden">
            
            {/* LEFT PANE: Table of Contents */}
            <div className="w-72 flex-shrink-0 border-r border-zinc-300/50 dark:border-zinc-800/50 overflow-y-auto bg-[#EFECE5] dark:bg-[#0a0a0a]">
              <div className="p-6 pb-2">
                 <h2 className="text-xs uppercase tracking-widest font-bold text-zinc-400 dark:text-zinc-600 mb-8 flex items-center gap-2">
                   <BookOpen size={14} /> {t('tableOfContents')}
                 </h2>
              </div>
              
              <div className="px-3 pb-8 space-y-6">
                 {eras.map(era => (
                   <div key={era}>
                     <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-3 mb-2">{era}</h3>
                     <div className="space-y-1">
                        {groupedStories[era].map((story, idx) => {
                           const isActive = activeStory?.id === story.id;
                           const hasDraft = !!story.sandersonAdaptation;
                           const isStale = (hasDraft && story.updatedAt && story.sandersonGeneratedAt) 
                                           ? story.updatedAt > story.sandersonGeneratedAt 
                                           : false;
                           
                           return (
                             <button
                               key={`${story.id}-${idx}`}
                               onClick={() => setActiveStory(story)}
                               className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-start justify-between gap-2 ${isActive ? 'bg-zinc-200 dark:bg-zinc-800 font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
                             >
                                <div className="flex items-start gap-2 overflow-hidden">
                                   <span className={`text-xs mt-0.5 ${hasDraft ? 'text-indigo-500 font-bold' : 'text-zinc-400'}`}>
                                      {idx + 1}.
                                   </span>
                                   <span className={isActive ? '' : 'truncate'}>{story.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                   {isStale && (
                                      <RefreshCw size={13} className="text-amber-500 opacity-80" />
                                   )}
                                   {hasDraft && (
                                      <Feather size={14} className="text-indigo-500 opacity-80" />
                                   )}
                                </div>
                             </button>
                           );
                        })}
                     </div>
                   </div>
                 ))}
              </div>
            </div>

            {/* RIGHT PANE: The Novel Reader */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto relative no-scrollbar scroll-smooth" onMouseUp={handleSelection} onTouchEnd={handleSelection}>
               {activeStory && (
                  <div className="max-w-2xl mx-auto py-16 px-8 lg:px-12">
                     <AnimatePresence mode="wait">
                        <motion.div
                           key={activeStory.id}
                           initial={{ opacity: 0, y: 10 }}
                           animate={{ opacity: 1, y: 0 }}
                           exit={{ opacity: 0, y: -10 }}
                           transition={{ duration: 0.4 }}
                        >
                           <header className="mb-16 text-center">
                              <span className="uppercase tracking-widest text-xs font-bold text-zinc-500 mb-4 block">
                                 {t('chapter', { number: stories.indexOf(activeStory) + 1 })}
                              </span>
                              <h1 className="text-3xl md:text-4xl font-serif text-zinc-900 dark:text-zinc-100 leading-tight">
                                 {activeStory.title}
                              </h1>
                              <div className="mt-8 flex items-center justify-center gap-3 opacity-60">
                                 <div className="h-px w-8 bg-zinc-400 dark:bg-zinc-500 rounded-full"></div>
                                 <p className="font-serif italic text-sm tracking-wide text-zinc-600 dark:text-zinc-400">
                                    {t('inspiredByTrueEvents')}
                                 </p>
                                 <div className="h-px w-8 bg-zinc-400 dark:bg-zinc-500 rounded-full"></div>
                              </div>
                           </header>
                           {activeStory.sandersonAdaptation ? (
                              <div className="prose prose-lg dark:prose-invert font-serif text-zinc-800 dark:text-zinc-300 leading-relaxed selection:bg-indigo-200 dark:selection:bg-indigo-900/50 max-w-none [&>p]:indent-8 [&>p]:mb-8 [&>p]:text-justify [&>p:first-of-type]:indent-0 [&>p:first-of-type::first-letter]:text-7xl [&>p:first-of-type::first-letter]:float-left [&>p:first-of-type::first-letter]:mr-3 [&>p:first-of-type::first-letter]:leading-[0.85] [&>p:first-of-type::first-letter]:font-medium [&>p:first-of-type::first-letter]:mt-1.5 [&>p:first-of-type::first-letter]:text-indigo-900 dark:[&>p:first-of-type::first-letter]:text-indigo-100">
                                 <ReactMarkdown>
                                    {activeStory.sandersonAdaptation}
                                 </ReactMarkdown>
                              </div>
                           ) : (
                              <div className="flex flex-col items-center justify-center py-20 text-center">
                                  <div className="w-16 h-16 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center shadow-sm mb-6 border border-zinc-200 dark:border-zinc-800">
                                    <PenTool className="text-zinc-400" size={24} />
                                 </div>
                                 <h3 className="text-xl font-serif text-zinc-800 dark:text-zinc-200 mb-2">{t('unwrittenChapter')}</h3>
                                 <p className="text-zinc-500 mb-8 max-w-sm">
                                    {t('unwrittenChapterDesc')}
                                 </p>
                              <button
                                    onClick={() => handleGenerateChapter()}
                                    disabled={isGenerating}
                                    className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-bold rounded-full transition-all disabled:opacity-50"
                                 >
                                    {isGenerating ? (
                                       <><Loader2 className="animate-spin" size={16} /> {t('draftingEpic')}</>
                                    ) : (
                                       <><Sparkles size={16} /> {t('rewriteRealisticEpic')}</>
                                    )}
                                 </button>
                                 
                                 {isGenerating && (
                                    <p className="text-xs text-zinc-400 mt-4 animate-pulse">
                                       {t('applyingHardMagic')}
                                    </p>
                                 )}
                              </div>
                           )}

                        </motion.div>
                     </AnimatePresence>
                  </div>
               )}

               {/* INLINE EDITORIAL TOOLTIP */}
               <AnimatePresence>
                  {selectionContext && !isEditingNotes && (
                     <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        style={{ top: selectionContext.y - 40, left: selectionContext.x }}
                        className="fixed z-50 -translate-x-1/2 flex items-center shadow-lg rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                     >
                        <button
                           onClick={() => setIsEditingNotes(true)}
                           className="px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                        >
                           <PenTool size={14} /> {t('markDiscrepancy')}
                        </button>
                     </motion.div>
                  )}

                  {isEditingNotes && selectionContext && (
                     <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl z-50 bg-white dark:bg-zinc-900 shadow-2xl rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6"
                     >
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <h3 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100"><PenTool size={16} className="text-indigo-500" /> {t('editorialCorrection')}</h3>
                              <p className="text-xs text-zinc-500 mt-1">{t('editorialCorrectionDesc')}</p>
                           </div>
                           <button onClick={() => { setIsEditingNotes(false); setSelectionContext(null); }} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                              <X size={18} />
                           </button>
                        </div>
                        
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg mb-4 border-l-4 border-indigo-400 text-sm font-serif italic text-zinc-600 dark:text-zinc-300 line-clamp-3">
                           "{selectionContext.text}"
                        </div>

                        <textarea
                           value={editorialDraft}
                           onChange={(e) => setEditorialDraft(e.target.value)}
                           placeholder={t('correctionPlaceholder')}
                           className="w-full bg-[#fcfbf9] dark:bg-zinc-950 rounded-lg p-3 text-sm min-h-[100px] outline-none border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none transition-all"
                        />

                        <div className="flex justify-end mt-4">
                           <button
                              disabled={isGenerating || !editorialDraft.trim()}
                              onClick={() => handleGenerateChapter(`Regarding the excerpt: "${selectionContext.text}"\n\nUser Correction: ${editorialDraft}`)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-full text-sm transition-all disabled:opacity-50 flex items-center gap-2 shadow-md"
                           >
                              {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} 
                              {t('regenerateEngine')}
                           </button>
                        </div>
                     </motion.div>
                  )}
               </AnimatePresence>
            </div>
         </div>
      )}
    </div>
  );
}
