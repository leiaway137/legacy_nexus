"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, BookOpen, Clock, Target, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Sparkles, Crosshair, Loader2, Library, Globe } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { HighFidelityStory } from "@/lib/rag";
import { fetchUserSources, fetchHighFidelityStories, saveHighFidelityStories, fetchUserProfile } from "@/lib/firebase/db";
import { extractHighFidelityStoriesAction } from "@/app/actions";

const MOCK_STORIES: HighFidelityStory[] = [
  {
    id: "1",
    era: "Twenties",
    title: "Opening the First Bindery",
    synopsis: "The intense year opening the first major publishing bindery. Despite initial setbacks with capital, securing the historic downtown location proved to be the turning point.",
    psychometrics: [
      { label: "Realistic", val: 85 },
      { label: "Investigative", val: 30 },
      { label: "Artistic", val: 20 },
      { label: "Social", val: 60 },
      { label: "Enterprising", val: 90 },
      { label: "Conventional", val: 70 }
    ],
    rubric: {
      context: true,
      conflict: true,
      resolution: true,
      extraction: true,
    },
    gapPrompt: null
  },
  {
    id: "2",
    era: "Thirties",
    title: "The Printing Press Failure",
    synopsis: "The devastating failure of the imported German printing press. Partner relations broke down completely over the financial loss, resulting in a three-year legal battle.",
    psychometrics: [
      { label: "Realistic", val: 60 },
      { label: "Investigative", val: 80 },
      { label: "Artistic", val: 10 },
      { label: "Social", val: 20 },
      { label: "Enterprising", val: 40 },
      { label: "Conventional", val: 50 }
    ],
    rubric: {
      context: true,
      conflict: true,
      resolution: true,
      extraction: false,
    },
    gapPrompt: "Albert, that story about the printing press failure is intense. But you haven't told me: what did that teach you about choosing business partners?"
  },
  {
    id: "3",
    era: "Timeless",
    title: "Steamed Pork with Salted Fish",
    synopsis: "A classic, savory family recipe. The narrator distinctly recalls their father teaching them to mix ground pork with soy sauce and a specific fermented fish paste to create a deeply aromatic, simple dish.",
    psychometrics: [
      { label: "Realistic", val: 80 },
      { label: "Investigative", val: 10 },
      { label: "Artistic", val: 60 },
      { label: "Social", val: 50 },
      { label: "Enterprising", val: 20 },
      { label: "Conventional", val: 90 }
    ],
    rubric: {
      context: true,
      conflict: false,
      resolution: true,
      extraction: true,
    },
    gapPrompt: null,
    linguisticCorrections: [
      { original: "haam yuh", guess: "Haam Yu", meaning: "Salted Fish" },
      { original: "seen yuk", guess: "Siu Juk", meaning: "Roast Pork / Meat" }
    ]
  }
];

export default function StoriesPage() {
  const { user, loading } = useAuth();
  
  const [stories, setStories] = useState<HighFidelityStory[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [isLoadingCache, setIsLoadingCache] = useState(true);

  useEffect(() => {
    async function loadCached() {
      if (user) {
        const cached = await fetchHighFidelityStories(user.uid);
        if (cached && cached.length > 0) {
          setStories(cached);
          setHasScanned(true);
        }
      }
      setIsLoadingCache(false);
    }
    loadCached();
  }, [user]);

  if (loading || isLoadingCache) {
     return <div className="min-h-screen flex items-center justify-center bg-[#F6F5F0] dark:bg-zinc-950"><Sparkles className="animate-spin text-indigo-500" /></div>;
  }

  if (!user) {
     return <div className="min-h-screen bg-[#F6F5F0] dark:bg-zinc-950 px-4"><LoginModule /></div>;
  }

  const handleAnalyzeVault = async () => {
    setIsAnalyzing(true);
    setHasScanned(false);
    try {
      // 1. Fetch all raw text from the user's uploaded sources
      const sources = await fetchUserSources(user.uid);
      if (sources.length === 0) {
        alert("Your archive is currently empty! Please upload some life stories on the dashboard first, or interact with the AI interviewer.");
        setIsAnalyzing(false);
        return;
      }

      // Combine text context
      const vaultContext = sources.map(s => `[Source: ${s.fileName}]\n${s.textContent}`).join("\n\n");

      // 2. Fetch profile for linguistic/cultural background
      const profile = await fetchUserProfile(user.uid);

      // 3. Transmit to Gemini Pipeline
      const linguisticContext = [profile?.culturalHeritage, profile?.primaryLanguage, profile?.secondaryLanguages].filter(Boolean).join(" | ");
      const newStories = await extractHighFidelityStoriesAction(vaultContext, linguisticContext);
      
      if (newStories && newStories.length > 0) {
        // 3. CACHE the results to Firebase immediately!
        await saveHighFidelityStories(user.uid, newStories);
        setStories(newStories);
      } else {
        alert("The AI could not confidently extract stories from the text provided. Ensure your journals contain specific narrative events.");
      }
    } catch (e) {
      console.error(e);
      alert("Encountered an error compiling the stories. Please try again.");
    } finally {
      setIsAnalyzing(false);
      setHasScanned(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 font-sans p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Navigation */}
        <Link 
          href="/progress" 
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Legacy Progress
        </Link>

        {/* Header Block */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest text-xs">
              <BookOpen size={14} /> High-Fidelity Archive
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
              Compiled Stories
            </h1>
            <p className="text-lg text-zinc-500 dark:text-zinc-400">
              This timeline visualizes your raw transcripts synthesized into categorized narrative moments. Each point evaluates your narrative completeness.
            </p>
          </div>

          <button 
            onClick={handleAnalyzeVault}
            disabled={isAnalyzing}
            className="flex-shrink-0 flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all hover:-translate-y-1"
          >
            {isAnalyzing ? (
              <><Loader2 size={20} className="animate-spin" /> Compiling Vault...</>
            ) : (
              <><Library size={20} /> Analyze Archives</>
            )}
          </button>
        </div>

        {/* Central Vertical Timeline */}
        <div className="relative pt-8 pb-20">
          
          {/* Empty / Placeholder State */}
          {!hasScanned && !isAnalyzing && stories.length === 0 && (
            <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-3xl p-8 md:p-12 border border-indigo-100 dark:border-indigo-900/50 flex flex-col items-center justify-center text-center space-y-4">
              <Sparkles className="w-12 h-12 text-indigo-400 animate-pulse" />
              <h2 className="text-2xl font-bold text-indigo-950 dark:text-indigo-300">Your Timeline is Waiting</h2>
              <p className="text-indigo-700 dark:text-indigo-400 max-w-md">
                 Click "Analyze Archives" above to instruct the AI to build dynamic High-Fidelity stories straight from your uploaded journals and interview transcripts. <br/><br/>
                 <span className="text-xs opacity-70">For the UI Gamification preview, the sample data lives below. It will be replaced when you process real files!</span>
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="h-64 flex flex-col items-center justify-center space-y-4">
               <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
               <p className="font-medium text-zinc-500 animate-pulse">The AI is synthetically reading your entire Legacy Vault...</p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 xl:gap-8">
            
            {/* Left Column: Timeline */}
            <div className="relative">
              {/* Vertical Track Line */}
              {!isAnalyzing && (stories.length > 0 || !hasScanned) && (
                <div className="absolute left-8 md:left-36 top-0 bottom-0 w-1 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
              )}
              
              <div className="space-y-16">
                {!isAnalyzing && (stories.length > 0 ? stories : (hasScanned ? [] : MOCK_STORIES)).filter(s => s.era !== "Timeless").map((story, i) => (
              <div key={story.id || i} className="relative pl-20 md:pl-[210px]">
                
                {/* Timeline Dot */}
                <div className="absolute left-[26px] md:left-[134px] top-6 w-5 h-5 bg-indigo-600 text-white rounded-full border-4 border-[#F3F4F6] dark:border-[#0f0f0f] shadow flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>
                
                {/* Era Tag */}
                <div className="absolute left-0 w-24 md:w-[124px] top-5 text-right pr-4 hidden md:block">
                  <span className="text-sm font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{story.era || "Undefined"}</span>
                </div>

                {/* The Story Card */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden"
                >
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">{story.title}</h2>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                    "{story.synopsis}"
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Linguistic Corrections (If Any) */}
                    {story.linguisticCorrections && story.linguisticCorrections.length > 0 && (
                      <div className="col-span-1 md:col-span-2 mb-2 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                        <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5 mb-3"><Globe size={12} /> AI Phonetic Correction</h4>
                        <div className="flex flex-wrap gap-2">
                          {story.linguisticCorrections.map((correction, idx) => (
                            <div key={idx} className="bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 text-xs px-3 py-1.5 rounded-md flex items-center gap-2">
                               <span className="text-zinc-400 dark:text-zinc-600 line-through decoration-red-400/50">{correction.original}</span>
                               <ArrowLeft size={10} className="text-zinc-300" />
                               <span className="font-bold text-indigo-700 dark:text-indigo-400">{correction.guess}</span>
                               {correction.meaning && <span className="opacity-70 text-indigo-600 dark:text-indigo-500 ml-1">({correction.meaning})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Psychometric Scorecard */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <Target size={14} /> Psychometric Profile
                      </h3>
                      <div className="space-y-4">
                        {story.psychometrics?.map(metric => (
                          <div key={metric.label}>
                            <div className="flex justify-between items-end mb-1">
                              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{metric.label}</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${metric.val}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Completeness Rubric */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <Crosshair size={14} /> Completeness Rubric
                      </h3>
                      <div className="space-y-3">
                        
                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Context (The Setup)</span>
                          {story.rubric?.context ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-zinc-300 dark:text-zinc-700" />}
                        </div>
                        
                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Conflict (The Pivot)</span>
                          {story.rubric?.conflict ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-zinc-300 dark:text-zinc-700" />}
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Resolution (The Outcome)</span>
                          {story.rubric?.resolution ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-zinc-300 dark:text-zinc-700" />}
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-transparent">
                          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Extraction (The Moral)</span>
                          {story.rubric?.extraction ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : (
                            <AlertTriangle size={16} className="text-red-500" />
                          )}
                        </div>

                      </div>
                    </div>

                  </div>

                  {/* AI Gap Trigger */}
                  {!story.rubric?.extraction && story.gapPrompt && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="mt-6 p-4 md:p-5 bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500 rounded-r-2xl"
                    >
                      <div className="flex gap-4">
                        <ShieldAlert size={24} className="text-red-500 flex-shrink-0" />
                        <div>
                          <h4 className="font-bold text-red-900 dark:text-red-400 mb-1 flex items-center gap-2">
                             Narrative Gap Detected <span className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">AI Interruption</span>
                          </h4>
                          <p className="text-sm text-red-800 dark:text-red-300/80 leading-relaxed font-medium">
                            {story.gapPrompt}
                          </p>
                          <div className="mt-4 flex gap-3">
                            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors">
                              Record the Moral Now
                            </button>
                            <button className="px-4 py-2 bg-transparent hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg transition-colors">
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                </motion.div>
              </div>
            ))}
              </div>
            </div>

            {/* Right Column: Timeless & Generic Philosophies */}
            <div className="space-y-8 xl:pt-0 pt-16">
              <div className="flex items-center gap-2 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <Sparkles size={18} className="text-amber-500" />
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">Philosophies & Skills</h3>
              </div>
              
              <div className="space-y-8">
                {(() => {
                  const timeless = !isAnalyzing ? (stories.length > 0 ? stories : (hasScanned ? [] : MOCK_STORIES)).filter(s => s.era === "Timeless") : [];
                  
                  if (!isAnalyzing && timeless.length === 0 && hasScanned) {
                    return (
                      <div className="bg-amber-50/50 dark:bg-amber-950/10 rounded-3xl p-8 border border-dashed border-amber-200 dark:border-amber-900 flex flex-col items-center justify-center text-center">
                        <Sparkles className="text-amber-300 dark:text-amber-700/50 w-10 h-10 mb-3" />
                        <h4 className="font-bold text-amber-900 dark:text-amber-500 mb-2">No Generic Themes Yet</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-600/80">When the AI identifies timeless life advice, philosophies, or recipes that do not fit a specific era, they will appear here as standalone cards.</p>
                      </div>
                    );
                  }

                  return timeless.map((story, i) => (
                  <motion.div 
                    key={story.id || i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-zinc-50 dark:bg-[#1a1a1a] rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-amber-500/30 transition-colors"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-3xl rounded-full" />
                    
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">{story.title}</h2>
                    <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                      "{story.synopsis}"
                    </p>

                    {story.linguisticCorrections && story.linguisticCorrections.length > 0 && (
                      <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/30">
                        <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest flex items-center gap-1.5 mb-3"><Globe size={12} /> Secondary Language Guestimation</h4>
                        <div className="flex flex-wrap gap-2">
                          {story.linguisticCorrections.map((correction, idx) => (
                            <div key={idx} className="bg-white dark:bg-[#1a1a1a] shadow-sm text-xs px-3 py-2 rounded-md border border-amber-200/50 dark:border-amber-800/50 flex items-center gap-2">
                               <span className="text-zinc-400 dark:text-zinc-600 line-through decoration-red-400/50">{correction.original}</span>
                               <ArrowLeft size={10} className="text-zinc-300 transform rotate-180" />
                               <span className="font-bold text-amber-700 dark:text-amber-400">{correction.guess}</span>
                               {correction.meaning && <span className="text-amber-600/80 dark:text-amber-500/80 ml-1 italic">({correction.meaning})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-6">
                      {/* Psychometric Scorecard */}
                      <div>
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                          <Target size={14} /> Thematic Profile
                        </h3>
                        <div className="space-y-3">
                          {story.psychometrics?.filter(m => m.val > 0).map(metric => (
                            <div key={metric.label}>
                              <div className="flex justify-between items-end mb-1">
                                <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">{metric.label}</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${metric.val}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  ));
                })()}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
