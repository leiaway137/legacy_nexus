"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, BookOpen, Clock, Target, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Sparkles, Crosshair, Loader2, Library, Globe, X, GripVertical, Save, Edit3 } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { InterviewerModal } from "@/components/InterviewerModal";
import { HighFidelityStory } from "@/lib/rag";
import { fetchUserSources, fetchHighFidelityStories, saveHighFidelityStories, fetchUserProfile, updateSourceSyncStatus, saveLegacyInsights, saveChatHistory, fetchContacts, saveContact, type Contact } from "@/lib/firebase/db";
import { extractHighFidelityStoriesAction, reduceHighFidelityStoriesAction, generateLegacyIdentityAction, generateDriftInsightAction, generateLegacyDeepDiveAction } from "@/app/actions";
import { computeCentroidMath, analyzeCrossMetricPattern, RECOGNIZED_ERAS } from "@/lib/math";

const ERA_ORDER: Record<string, number> = {
  "Childhood": 1,
  "Teens": 2,
  "Twenties": 3,
  "Thirties": 4,
  "Forties": 5,
  "Fifties+": 6,
  "Timeless": 99
};

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
    },
    extraction: {
      present: true,
      depthLevel: 2,
      primaryCategory: "Impact",
      secondaryCategory: "Resilience",
      insightSummary: "User realized that building a business is about sweat equity, not just capital.",
      legacyLesson: "Influence and longevity are built on endurance when resources fail.",
      rawQuote: "Despite initial setbacks with capital, securing the historic downtown location proved to be the turning point."
    }
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
    },
    extraction: {
      present: false,
      depthLevel: 0,
      primaryCategory: "None",
      secondaryCategory: "None",
      insightSummary: "",
      legacyLesson: "",
      rawQuote: ""
    },
    gapPrompt: "You mentioned the German printing press failed and it triggered a three-year legal battle. How did you ultimately resolve this conflict, and what personal lesson did that prolonged struggle teach you about trust in business?"
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
    },
    extraction: {
      present: true,
      depthLevel: 1,
      primaryCategory: "Relational",
      secondaryCategory: "Stewardship",
      insightSummary: "A timeless connection to heritage through food.",
      legacyLesson: "Traditional recipes carry the invisible weight of family history across generations.",
      rawQuote: "My father taught me to mix ground pork with soy sauce and fermented fish."
    },
    linguisticCorrections: [
      { original: "haam yuh", guess: "Haam Yu", meaning: "Salted Fish" },
      { original: "seen yuk", guess: "Siu Juk", meaning: "Roast Pork / Meat" }
    ]
  }
];

export default function StoriesPage() {
  const { user, loading } = useAuth();
  
  const [stories, setStories] = useState<HighFidelityStory[]>([]);
  const [selectedStory, setSelectedStory] = useState<HighFidelityStory | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mappingProgress, setMappingProgress] = useState("");
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [eta, setEta] = useState<string>("");
  const [hasScanned, setHasScanned] = useState(false);
  const [isLoadingCache, setIsLoadingCache] = useState(true);

  const [isInterviewerOpen, setIsInterviewerOpen] = useState(false);
  const [activeGapPrompt, setActiveGapPrompt] = useState<string | null>(null);
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectionContext, setSelectionContext] = useState<{text: string; x: number; y: number} | null>(null);
  const [overrideInput, setOverrideInput] = useState("");
  const [selectedContactAliasId, setSelectedContactAliasId] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  const handleSelection = () => {
     const selection = window.getSelection();
     if (selection && selection.toString().trim() !== "") {
        const text = selection.toString().trim();
        if (text.length < 3) return;
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
     } else {
        setSelectionContext(null);
     }
  };

  useEffect(() => {
     document.addEventListener("selectionchange", handleSelection);
     return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const submitGeneralCorrection = async () => {
     if (!selectedStory || !user || !selectionContext || !overrideInput.trim()) return;
     setIsSavingCorrection(true);
     try {
        const newNarrative = (selectedStory.detailedNarrative || "").replace(new RegExp(selectionContext.text, 'g'), overrideInput);
        const newSynopsis = (selectedStory.synopsis || "").replace(new RegExp(selectionContext.text, 'g'), overrideInput);
        
        const updatedStory = { ...selectedStory, detailedNarrative: newNarrative, synopsis: newSynopsis };
        const updatedStories = stories.map(s => s.id === updatedStory.id ? updatedStory : s);
        
        await saveHighFidelityStories(user.uid, updatedStories);
        setStories(updatedStories);
        setSelectedStory(updatedStory);
        setSelectionContext(null);
        setOverrideInput("");
     } catch (e) {
        console.error(e);
     } finally {
        setIsSavingCorrection(false);
     }
  };

  const submitIdentityLink = async () => {
     if (!selectedStory || !user || !selectionContext || !selectedContactAliasId) return;
     setIsSavingCorrection(true);
     try {
         const contact = contacts.find(c => c.id === selectedContactAliasId);
         if (!contact) throw new Error("Contact not found");

         if (!(contact.aliases || []).includes(selectionContext.text)) {
            const newContact = { ...contact, aliases: [...(contact.aliases || []), selectionContext.text] };
            await saveContact(user.uid, newContact);
         }

         const canonicalName = contact.preferredName || contact.firstName || contact.originalName || "Unknown";
         const newNarrative = (selectedStory.detailedNarrative || "").replace(new RegExp(selectionContext.text, 'g'), canonicalName);
         const newSynopsis = (selectedStory.synopsis || "").replace(new RegExp(selectionContext.text, 'g'), canonicalName);
         
         const updatedStory = { ...selectedStory, detailedNarrative: newNarrative, synopsis: newSynopsis };
         const updatedStories = stories.map(s => s.id === updatedStory.id ? updatedStory : s);
         
         await saveHighFidelityStories(user.uid, updatedStories);
         setStories(updatedStories);
         setSelectedStory(updatedStory);
         
         const updatedContacts = await fetchContacts(user.uid);
         setContacts(updatedContacts);

         setSelectionContext(null);
         setSelectedContactAliasId("");
     } catch (e) {
         console.error(e);
     } finally {
         setIsSavingCorrection(false);
     }
  };

  // Safeguard: Prevent accidental reloads when processing
  useEffect(() => {
    if (!isAnalyzing) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnalyzing]);

  useEffect(() => {
    async function loadCached() {
      if (user) {
        const cached = await fetchHighFidelityStories(user.uid);
        if (cached && cached.length > 0) {
          setStories(cached);
          setHasScanned(true);
        }
        const cList = await fetchContacts(user.uid);
        setContacts(cList);
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

  const handleAnalyzeVault = async (forceFullScan: boolean = false) => {
    setIsAnalyzing(true);
    setHasScanned(false);
    try {
      // 1. Fetch all raw text from the user's uploaded sources
      let sources = await fetchUserSources(user.uid);
      
      if (sources.length === 0) {
        alert("Your archive is currently empty! Please upload some life stories on the dashboard first, or interact with the AI interviewer.");
        setIsAnalyzing(false);
        return;
      }

      // 2. Incremental Sync Logic
      let currentCache: HighFidelityStory[] = [];
      if (!forceFullScan) {
        const existingStories = await fetchHighFidelityStories(user.uid);
        if (existingStories) currentCache = existingStories;
        
        // Filter out already synced sources
        sources = sources.filter(s => !s.isSynced);
        
        if (sources.length === 0) {
          alert("All your documents are already synced! If you want to completely re-evaluate the archive, use the 'Force Full Re-Scan' option.");
          setIsAnalyzing(false);
          setHasScanned(true);
          return;
        }
      }

      // 3. Fetch profile for linguistic/identity background
      const profile = await fetchUserProfile(user.uid);
      const linguisticContext = [profile?.culturalHeritage, profile?.primaryLanguage, profile?.secondaryLanguages].filter(Boolean).join(" | ");
      const identityContext = [
        profile?.firstName && `Subject Name: ${profile?.firstName} ${profile?.lastName || ''}`,
        profile?.pronouns && `Subject Pronouns: ${profile?.pronouns}`,
        profile?.genderIdentity && `Subject Gender: ${profile?.genderIdentity}`
      ].filter(Boolean).join(" | ");

      // 4. Map-Reduce Pipeline Loop
      // Aggressive chunking (5000 chars = ~1000 words). This guarantees Gemini returns extremely quickly (<10sec), bypassing any local VPN/ISP idle socket timeouts that cause 'fetch failed'.
      const CHUNK_SIZE = 5000; 
      const AVG_SECONDS_PER_CHUNK = 8;
      
      // Calculate total chunks across all sources for accurate ETA
      let totalChunks = 0;
      sources.forEach(s => {
         totalChunks += Math.ceil((s.textContent?.length || 1) / CHUNK_SIZE);
      });
      let chunksProcessed = 0;

      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const text = s.textContent || "";
        const numChunks = Math.ceil(text.length / CHUNK_SIZE);
        let documentMappedStories: HighFidelityStory[] = [];
        
        for (let c = 0; c < numChunks; c++) {
           const estimatedSeconds = (totalChunks - chunksProcessed) * AVG_SECONDS_PER_CHUNK;
           setEta(`~${Math.ceil(estimatedSeconds / 60)} min ${estimatedSeconds % 60} sec remaining`);
           setProgressPercent((chunksProcessed / totalChunks) * 100);
           
           if (numChunks > 1) {
              setMappingProgress(`Extracting events from: ${s.fileName || `Document ${i + 1}`} (Part ${c + 1}/${numChunks})`);
           } else {
              setMappingProgress(`Extracting events from: ${s.fileName || `Document ${i + 1}`} (${i + 1}/${sources.length})`);
           }

           const chunkText = text.substring(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
           const sourceContext = `[Source: ${s.fileName}]\n${chunkText}`;
           
           try {
              const mappedStories = await extractHighFidelityStoriesAction(sourceContext, linguisticContext, undefined, identityContext);
              if (mappedStories && mappedStories.length > 0) {
                 documentMappedStories.push(...mappedStories);
              }
           } catch (mapErr: any) {
              console.error("Map-Reduce failed on specific chunk:", s.id, mapErr);
           }
           chunksProcessed++;
        }
        
        if (documentMappedStories.length > 0) {
           setMappingProgress(`Bridging timeline for: ${s.fileName || `Document ${i + 1}`}...`);
           currentCache = await reduceHighFidelityStoriesAction(currentCache, documentMappedStories, linguisticContext);
        }
        
        try {
          // Incrementally save the updated cache to Firebase FIRST, then mark as synced
          // This prevents catastrophic data loss if the user refreshes before the global save at the very end
          await saveHighFidelityStories(user.uid, currentCache);
          await updateSourceSyncStatus(s.id, true);
        } catch (e) {
          console.error("Failed to update sync tracking for source:", s.id);
        }
      }
      
      if (currentCache.length > 0) {
        setProgressPercent(95);
        setEta("Synthesizing Legacy Insights...");
        setMappingProgress("Architecting universal timeline narratives and psychological drift. This may take 30-45 seconds...");
        
        // 1. Generate Global Stats
        const globalData = computeCentroidMath(RECOGNIZED_ERAS[0], currentCache);
        const globalCtx = await generateLegacyIdentityAction(globalData.archetype.primaryRiasec, globalData.archetype.secondaryRiasec, globalData.archetype.extraction, globalData.archetype.title);
        (globalData.archetype as any).context = globalCtx;

        const insightsPackage: any = {
           allTime: globalData.archetype,
           eras: {}
        };

        // 2. Generate Drift for Populated Eras
        for (let i = 1; i < RECOGNIZED_ERAS.length; i++) {
           const eraObj = RECOGNIZED_ERAS[i];
           const eraStories = currentCache.filter(s => s.era === eraObj.key || s.era === eraObj.label);
           if (eraStories.length > 0) {
              const cData = computeCentroidMath(eraObj, currentCache);
              const strGlobal = globalData.archetype.rawStories.slice(0, 10).map((s:any)=>s.title).join(", ");
              const strEra = cData.archetype.rawStories.slice(0, 10).map((s:any)=>s.title+": "+s.synopsis).join("\n").slice(0, 2000);
              
              const driftTxt = await generateDriftInsightAction(
                 "All-Time Timeline", globalData.archetype.title,
                 eraObj.key, cData.archetype.title,
                 strGlobal || "(No macro timeline)",
                 strEra || "(No stories from this era)"
              );
              insightsPackage.eras[eraObj.key] = {
                 ...cData.archetype,
                 driftInsight: driftTxt
              };
           }
        }

        // 3. Generate Cross-Metric Deep Dive (Friction & Blind Spots)
        const crossPattern = analyzeCrossMetricPattern(currentCache);
        if (crossPattern) {
           const deepDiveData = await generateLegacyDeepDiveAction(
              crossPattern.dominantTrait,
              crossPattern.flaw,
              crossPattern.flawScore,
              crossPattern.exampleStoryTitle,
              (crossPattern as any).exampleStoryContext || ""
           );
           insightsPackage.deepDive = {
              ...crossPattern,
              ...deepDiveData
           };
        }
        
        await saveLegacyInsights(user.uid, insightsPackage);

        setProgressPercent(100);
        setEta("Almost done!");
        setMappingProgress("Finalizing chronological sorting and preserving to Firebase...");
        await saveHighFidelityStories(user.uid, currentCache);
        setStories(currentCache);
      } else {
        alert("The AI returned an empty storyline. Ensure your journals contain specific narrative events or reduce the complexity of the files.");
      }
    } catch (e: any) {
      console.error(e);
      alert("AI Compilation Error: " + (e.message || "Please try again."));
    } finally {
      setIsAnalyzing(false);
      setMappingProgress("");
      setProgressPercent(null);
      setEta("");
      setHasScanned(true);
    }
  };

  return (
    <div className="h-full bg-[#F3F4F6] dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 font-sans p-6 md:p-12 overflow-y-auto no-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8 mt-4">

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
              This timeline visualizes your raw transcripts synthesized into categorized narrative moments. Syncing will only scan new documents.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 flex-shrink-0 w-full sm:w-auto">
            <button 
              onClick={() => handleAnalyzeVault(false)}
              disabled={isAnalyzing}
              className="flex-shrink-0 flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all hover:-translate-y-1 w-full sm:w-auto text-sm"
            >
              {isAnalyzing ? (
                <><Loader2 size={18} className="animate-spin" /> Compiling...</>
              ) : (
                <><Library size={18} /> Sync New Files</>
              )}
            </button>
            <button 
                onClick={() => setIsStoryboardOpen(true)}
                className="flex flex-shrink-0 items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-800 dark:text-zinc-200 font-bold rounded-2xl shadow-sm transition-all hover:-translate-y-1 w-full sm:w-auto text-sm"
              >
               <Edit3 size={18} /> Edit Timeline
            </button>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
                <button 
                  onClick={async () => {
                     setHasScanned(false);
                     setIsAnalyzing(true);
                     try {
                        let currentCache = await fetchHighFidelityStories(user.uid);
                        if (!currentCache || currentCache.length === 0) {
                           alert("No cached stories found. Please run a full sync first.");
                           setIsAnalyzing(false); return;
                        }
                        
                        setProgressPercent(95);
                        setEta("Synthesizing Legacy Insights...");
                        setMappingProgress("Architecting universal timeline narratives and psychological drift. This may take 30-45 seconds...");
                        
                        const globalData = computeCentroidMath(RECOGNIZED_ERAS[0], currentCache);
                        const globalCtx = await generateLegacyIdentityAction(globalData.archetype.primaryRiasec, globalData.archetype.secondaryRiasec, globalData.archetype.extraction, globalData.archetype.title);
                        (globalData.archetype as any).context = globalCtx;

                        const insightsPackage: any = { allTime: globalData.archetype, eras: {} };

                        for (let i = 1; i < RECOGNIZED_ERAS.length; i++) {
                           const eraObj = RECOGNIZED_ERAS[i];
                           const eraStories = currentCache.filter(s => s.era === eraObj.key || s.era === eraObj.label);
                           if (eraStories.length > 0) {
                              const cData = computeCentroidMath(eraObj, currentCache);
                              const strGlobal = globalData.archetype.rawStories.slice(0, 10).map((s:any)=>s.title).join(", ");
                              const strEra = cData.archetype.rawStories.slice(0, 10).map((s:any)=>s.title+": "+s.synopsis).join("\n").slice(0, 2000);
                              
                              const driftTxt = await generateDriftInsightAction("All-Time Timeline", globalData.archetype.title, eraObj.key, cData.archetype.title, strGlobal || "(No macro timeline)", strEra || "(No stories from this era)");
                              insightsPackage.eras[eraObj.key] = { ...cData.archetype, driftInsight: driftTxt };
                           }
                        }

                        const crossPattern = analyzeCrossMetricPattern(currentCache);
                        if (crossPattern) {
                           const deepDiveData = await generateLegacyDeepDiveAction(crossPattern.dominantTrait, crossPattern.flaw, crossPattern.flawScore, crossPattern.exampleStoryTitle, crossPattern.exampleStoryContext);
                           insightsPackage.deepDive = { ...crossPattern, ...deepDiveData };
                        }
                        
                        await saveLegacyInsights(user.uid, insightsPackage);
                        setProgressPercent(100);
                        setStories(currentCache);
                        alert("Insights successfully refreshed without rescanning documents!");
                     } catch(e) { console.error(e); } finally { setIsAnalyzing(false); setProgressPercent(null); setEta(""); setHasScanned(true); setMappingProgress(""); }
                  }}
                  disabled={isAnalyzing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-xl transition-all text-xs w-full sm:w-auto"
                >
                  <Sparkles size={14}/> Regenerate Insights Only
                </button>
                <button 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to completely rebuild your archive? This deletes the current cache and reads every document from scratch. It may take up to 45 minutes.')) { handleAnalyzeVault(true); }
                  }}
                  disabled={isAnalyzing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 border border-zinc-200 dark:border-zinc-800 hover:border-red-200 dark:hover:border-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-xl transition-all text-xs w-full sm:w-auto"
                >
                  Force Full Re-Scan
                </button>
            </div>
          </div>
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

          <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-12 xl:gap-8">
            
            {/* Left Column: Timeline */}
            <div className="relative">
              {/* Vertical Track Line */}
              {!isAnalyzing && (stories.length > 0 || !hasScanned) && (
                <div className="absolute left-8 md:left-36 top-0 bottom-0 w-1 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
              )}
              
              <div className="space-y-16">
                {!isAnalyzing && [...(stories.length > 0 ? stories : (hasScanned ? [] : MOCK_STORIES))]
                  .filter(s => s.era !== "Timeless")
                  .sort((a, b) => (ERA_ORDER[a.era] || 99) - (ERA_ORDER[b.era] || 99))
                  .map((story, i) => {
                    // @ts-ignore
                    const impact = story.impact_metadata;
                    const w_intensity = impact?.emotional_intensity || 2;
                    let dotClass = "absolute left-[26px] md:left-[134px] top-6 w-5 h-5 bg-indigo-600 text-white rounded-full border-4 border-[#F3F4F6] dark:border-[#0f0f0f] shadow flex items-center justify-center";
                    let innerClass = "w-1.5 h-1.5 bg-white rounded-full";
                    let tagText = "Snapshot";
                    let tagClass = "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700";
                    
                    if (w_intensity >= 5) {
                       dotClass = "absolute left-[20px] md:left-[128px] top-4 w-8 h-8 bg-amber-500 text-white rounded-full border-4 border-[#F3F4F6] dark:border-[#0f0f0f] shadow-[0_0_20px_rgba(245,158,11,0.6)] flex items-center justify-center z-10";
                       innerClass = "w-3 h-3 bg-white rounded-full animate-pulse";
                       tagText = "Core Memory";
                       tagClass = "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50";
                    } else if (w_intensity >= 3) {
                       dotClass = "absolute left-[24px] md:left-[132px] top-5 w-6 h-6 bg-indigo-500 text-white rounded-full border-4 border-[#F3F4F6] dark:border-[#0f0f0f] shadow-lg shadow-indigo-500/40 flex items-center justify-center";
                       innerClass = "w-2 h-2 bg-white rounded-full";
                       tagText = "Pivot Event";
                       tagClass = "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/50";
                    }

                    return (
              <div key={`${story.id}-${i}`} className="relative pl-20 md:pl-[210px]">
                
                {/* Timeline Dot */}
                <div className={dotClass}>
                   <div className={innerClass} />
                </div>
                
                {/* Era Tag */}
                <div className="absolute left-0 w-24 md:w-[124px] top-5 text-right pr-4 hidden md:block">
                  <span className="text-sm font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{story.era || "Undefined"}</span>
                </div>

                {/* The Story Card Face */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedStory(story)}
                  className={`bg-white dark:bg-zinc-900 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-3xl p-6 border ${w_intensity >= 5 ? 'border-amber-500/50 shadow-amber-500/10' : 'border-zinc-200 dark:border-zinc-800'} shadow-sm relative overflow-hidden transition-all group`}
                >
                  <div className="flex flex-wrap gap-2 items-center mb-3">
                     <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border ${tagClass}`}>
                        {tagText} {impact?.duration_weight ? `(Weight: x${(((w_intensity + (impact.narrative_complexity || 2))/2) * impact.duration_weight).toFixed(1)})` : ''}
                     </span>
                     {story.gapPrompt && (
                       <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900 flex items-center gap-1 shadow-sm animate-pulse">
                          <AlertTriangle size={10} /> Narrative Gap
                       </span>
                     )}
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{story.title}</h2>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-2 leading-relaxed">
                    "{story.synopsis}"
                  </p>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-indigo-500 flex items-center gap-1.5 mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                     <BookOpen size={14}/> Read Detailed Memory
                  </p>
                </motion.div>
              </div>
            );
          })}
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
                  const rawTimeless = !isAnalyzing ? (stories.length > 0 ? stories : (hasScanned ? [] : MOCK_STORIES)).filter(s => s.era === "Timeless") : [];
                  const timeless = rawTimeless.sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                  
                  if (!isAnalyzing && timeless.length === 0 && hasScanned) {
                    return (
                      <div className="bg-amber-50/50 dark:bg-amber-950/10 rounded-3xl p-8 border border-dashed border-amber-200 dark:border-amber-900 flex flex-col items-center justify-center text-center">
                        <Sparkles className="text-amber-300 dark:text-amber-700/50 w-10 h-10 mb-3" />
                        <h4 className="font-bold text-amber-900 dark:text-amber-500 mb-2">No Generic Themes Yet</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-600/80">When the AI identifies timeless life advice, philosophies, or recipes that do not fit a specific era, they will appear here as standalone cards.</p>
                      </div>
                    );
                  }

                  const grouped = timeless.reduce((acc, story) => {
                     const cat = story.timelessCategory || "General Philosophy";
                     if (!acc[cat]) acc[cat] = [];
                     acc[cat].push(story);
                     return acc;
                  }, {} as Record<string, HighFidelityStory[]>);

                  return Object.entries(grouped).map(([categoryName, catStories]) => (
                     <div key={categoryName} className="mb-10 last:mb-0">
                        <h4 className="text-sm font-bold text-amber-600 dark:text-amber-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                           {categoryName}
                           <div className="h-px bg-amber-200/50 dark:bg-amber-900/50 flex-1" />
                        </h4>
                        <div className="space-y-6">
                           {catStories.map((story, i) => (
                           <motion.div 
                             key={`${story.id}-${i}`}
                             initial={{ opacity: 0, scale: 0.95 }}
                             animate={{ opacity: 1, scale: 1 }}
                             onClick={() => setSelectedStory(story)}
                             className="bg-zinc-50 dark:bg-[#1a1a1a] cursor-pointer hover:bg-white dark:hover:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-amber-500/30 transition-all"
                           >
                             <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-3xl rounded-full" />
                             
                             <div className="flex flex-wrap gap-2 items-center mb-3">
                                {story.gapPrompt && (
                                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900 flex items-center gap-1 shadow-sm animate-pulse">
                                     <AlertTriangle size={10} /> Narrative Gap
                                  </span>
                                )}
                             </div>
                             <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 group-hover:text-amber-600 transition-colors">{story.title}</h2>
                             <p className="text-zinc-600 dark:text-zinc-400 mb-2 leading-relaxed">
                               "{story.synopsis}"
                             </p>
                             <p className="text-[11px] uppercase tracking-wider font-bold text-amber-500 flex items-center gap-1.5 mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <BookOpen size={14}/> Read Detailed Memory
                             </p>
                           </motion.div>
                           ))}
                        </div>
                     </div>
                  ));
                })()}
              </div>
            </div>

          </div>

        </div>

      </div>

      <AnimatePresence>
        {isAnalyzing && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-[100] bg-indigo-600 text-white p-4 shadow-2xl border-t border-indigo-400"
          >
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin text-indigo-200" size={24} />
                <div>
                  <h4 className="font-bold flex items-center justify-between gap-4">
                     Extracting High-Fidelity Stories
                     {eta && <span className="text-xs font-medium text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/30 font-mono tracking-tight">{eta}</span>}
                  </h4>
                  <p className="text-sm text-indigo-200">
                     {mappingProgress || "The AI is synthetically reading your entire Legacy Vault..."} Please do not close or refresh.
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 overflow-hidden">
               <div 
                 className={`h-full bg-indigo-300 ${progressPercent === null ? 'w-full animate-[pulse_1s_ease-in-out_infinite]' : 'transition-all duration-1000 ease-in-out'}`} 
                 style={{ width: progressPercent !== null ? `${progressPercent}%` : '100%' }} 
               />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {selectedStory && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setSelectedStory(null)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 10 }}
               className="relative w-full max-w-4xl max-h-[85vh] bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-y-auto border border-zinc-200 dark:border-zinc-800"
             >
                <div className="sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between z-10">
                   <div className="flex items-center gap-3">
                     <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 rounded border border-zinc-200 dark:border-zinc-800">
                        {selectedStory.era}
                     </span>
                     <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">{selectedStory.title}</h2>
                   </div>
                   <button onClick={() => setSelectedStory(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full text-zinc-500 transition-colors">
                      <X size={20} />
                   </button>
                </div>
                
                <div className="p-6 md:p-8 space-y-10">
                   {/* 1. Detailed Narrative */}
                   <div>
                     <h3 className="text-sm font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <BookOpen size={16} /> Detailed Memory
                     </h3>
                     <div className="prose dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {selectedStory.detailedNarrative ? (
                           selectedStory.detailedNarrative.split('\n').filter(p => p.trim() !== '').map((paragraph, idx) => (
                              <p key={idx} className="mb-4">{paragraph}</p>
                           ))
                        ) : (
                           <p className="italic opacity-80">{selectedStory.synopsis}</p>
                        )}
                     </div>
                   </div>

                   {/* Narrative Gap Prompt Action */}
                   {selectedStory.gapPrompt && (
                      <div className="mt-6 p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border-2 border-rose-200 dark:border-rose-900 shadow-inner">
                         <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400 flex items-center justify-center flex-shrink-0 mt-1">
                               <AlertTriangle size={18} />
                            </div>
                            <div className="flex flex-col w-full">
                               <h4 className="font-bold text-rose-700 dark:text-rose-400 text-sm uppercase tracking-wider mb-2">Narrative Gap Detected</h4>
                               <p className="text-zinc-800 dark:text-zinc-200 text-sm italic mb-4 leading-relaxed font-serif">"{selectedStory.gapPrompt}"</p>
                               <button 
                                 onClick={() => {
                                    setActiveGapPrompt(selectedStory.gapPrompt || "");
                                    setIsInterviewerOpen(true);
                                 }}
                                 className="self-start text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-transform px-4 py-2 rounded-full shadow-md"
                               >
                                  Ask the AI Interviewer
                               </button>
                            </div>
                         </div>
                      </div>
                   )}

                   <hr className="border-zinc-200 dark:border-zinc-800" />

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Linguistic Corrections */}
                      {selectedStory.linguisticCorrections && selectedStory.linguisticCorrections.length > 0 && (
                        <div className="col-span-1 md:col-span-2 mb-2 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                          <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5 mb-3"><Globe size={12} /> AI Phonetic Correction</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedStory.linguisticCorrections.map((correction, idx) => (
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
                          {selectedStory.psychometrics?.map((metric, idx) => (
                            <div key={`${metric.label}-${idx}`}>
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
                          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 leading-tight">Context<br /><span className="text-xs opacity-75">(The Setup)</span></span>
                            {selectedStory.rubric?.context ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-zinc-300 dark:text-zinc-700" />}
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 leading-tight">Conflict<br /><span className="text-xs opacity-75">(The Pivot)</span></span>
                            {selectedStory.rubric?.conflict ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-zinc-300 dark:text-zinc-700" />}
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 leading-tight">Resolution<br /><span className="text-xs opacity-75">(The Outcome)</span></span>
                            {selectedStory.rubric?.resolution ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-zinc-300 dark:text-zinc-700" />}
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-transparent">
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 leading-tight">Extraction<br /><span className="text-xs opacity-75">(The Moral)</span></span>
                            {selectedStory.extraction?.present ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-red-500" />}
                          </div>
                        </div>
                      </div>

                      {/* Taxonomy Block */}
                      {selectedStory.extraction?.present && selectedStory.extraction.depthLevel > 0 && (
                        <div className="col-span-1 md:col-span-2 mt-4 p-4 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50">
                          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-orange-200/50 dark:border-orange-900/50">
                             <Globe size={14} className="text-orange-500" />
                             <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Wisdom Taxonomy</span>
                             <div className="ml-auto flex items-center gap-1.5">
                               <span className="text-[10px] bg-white dark:bg-zinc-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded shadow-sm font-semibold border border-orange-100 dark:border-orange-900">{selectedStory.extraction.primaryCategory}</span>
                               {selectedStory.extraction.secondaryCategory !== "None" && selectedStory.extraction.secondaryCategory !== selectedStory.extraction.primaryCategory && (
                                 <span className="text-[10px] bg-orange-100/50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded font-medium">{selectedStory.extraction.secondaryCategory}</span>
                               )}
                               <span className="text-[10px] bg-orange-200/50 dark:bg-orange-800/40 text-orange-800 dark:text-orange-200 px-1.5 py-0.5 rounded font-bold ml-1">Lvl {selectedStory.extraction.depthLevel}</span>
                             </div>
                          </div>
                          
                          <div className="space-y-3">
                            {selectedStory.extraction.legacyLesson && (
                              <div className="font-serif text-base text-zinc-900 dark:text-zinc-100 leading-snug">
                                "{selectedStory.extraction.legacyLesson}"
                              </div>
                            )}
                            
                            {(selectedStory.extraction.insightSummary || selectedStory.extraction.rawQuote) && (
                              <div className="pl-3 border-l-2 border-orange-200 dark:border-orange-800 space-y-1.5">
                                {selectedStory.extraction.insightSummary && (
                                  <p className="text-xs font-medium text-orange-800/80 dark:text-orange-300/80 uppercase tracking-wide">
                                    {selectedStory.extraction.insightSummary}
                                  </p>
                                )}
                                {selectedStory.extraction.rawQuote && (
                                  <p className="text-sm text-zinc-600 dark:text-zinc-400 italic">
                                    "{selectedStory.extraction.rawQuote}"
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                   </div>

                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isInterviewerOpen && user && (
          <InterviewerModal 
            userId={user.uid} 
            initialPrompt={activeGapPrompt || undefined}
            onClose={() => {
               setIsInterviewerOpen(false);
               setActiveGapPrompt(null);
            }} 
            onSave={async (transcript) => {
               try {
                   // This is completely optional since Identity Harvester auto-runs in Modal.
                   // But let's just alert success organically.
               } finally {
                   setIsInterviewerOpen(false);
                   setActiveGapPrompt(null);
                   alert("Interview fragment saved! When you re-run 'Analyze Archives', this new context will backfill all gaps automatically.");
               }
            }} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectionContext && (
          <motion.div 
             initial={{ opacity: 0, y: 10, scale: 0.95 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             exit={{ opacity: 0, y: 5, scale: 0.95 }}
             className="fixed z-[9999] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-4 w-[380px]"
             style={{ left: Math.min(selectionContext.x, window.innerWidth - 400), top: selectionContext.y + 20 }}
          >
            <div className="flex items-center justify-between mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <h4 className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 text-sm">
                <Sparkles size={14} /> Correct Fact or Identity
              </h4>
              <button onClick={() => setSelectionContext(null)} className="text-zinc-400 hover:text-zinc-600">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-3 italic line-clamp-2 leading-relaxed">
               "{selectionContext.text}"
            </p>
            
            {/* Identity Resolver Mode */}
            <div className="mb-4 bg-zinc-50 dark:bg-[#121212] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Link as Alias to Address Book</p>
              <select
                 value={selectedContactAliasId}
                 onChange={(e) => setSelectedContactAliasId(e.target.value)}
                 className="w-full text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                 <option value="">Select an Identity to overwrite this text...</option>
                 {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.preferredName || c.firstName || c.originalName} {c.lastName || ""}</option>
                 ))}
              </select>
              <button 
                 onClick={submitIdentityLink}
                 disabled={isSavingCorrection || !selectedContactAliasId}
                 className="w-full justify-center flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 font-bold text-xs rounded-md transition disabled:opacity-50"
              >
                 {isSavingCorrection ? <Loader2 size={12} className="animate-spin"/> : <Globe size={12}/>}
                 Map Alias & Rewrite Fast
              </button>
            </div>

            {/* General Content Edit Mode */}
            <div>
               <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">General Content Correction</p>
               <textarea 
                 value={overrideInput}
                 onChange={(e) => setOverrideInput(e.target.value)}
                 placeholder="Type the exact text to replace the highlight with..."
                 className="w-full text-sm bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 min-h-[60px] mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
               />
               <button 
                 onClick={submitGeneralCorrection}
                 disabled={isSavingCorrection || !overrideInput.trim()}
                 className="w-full justify-center flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-white hover:bg-zinc-900 font-bold text-xs rounded-md transition disabled:opacity-50"
               >
                 {isSavingCorrection ? <Loader2 size={12} className="animate-spin"/> : <Target size={12}/>}
                 Rapid Override
               </button>
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isStoryboardOpen && user && (
           <StoryboardModal 
              stories={stories} 
              setStories={setStories} 
              userId={user.uid} 
              onClose={() => setIsStoryboardOpen(false)} 
           />
        )}
      </AnimatePresence>

    </div>
  );
}

function StoryboardModal({ stories, setStories, userId, onClose }: any) {
  const [localStories, setLocalStories] = useState<any[]>(() => {
     return [...stories].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)).map((s, i) => ({
        ...s,
        _dragId: `${s.id}-${i}-${Math.random().toString(36).substr(2, 9)}`
     }));
  });
  const [isSaving, setIsSaving] = useState(false);

  const storiesByEra = Object.keys(ERA_ORDER).reduce((acc, era) => {
    acc[era] = localStories.filter(s => s.era === era).sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    return acc;
  }, {} as Record<string, any[]>);

  const handleReorder = (era: string, newOrder: any[]) => {
    const updatedEraStories = newOrder.map((s, index) => ({ ...s, orderIndex: index }));
    const newLocalStories = localStories.map(s => {
       const found = updatedEraStories.find(u => u._dragId === s._dragId);
       return found ? found : s;
    });
    setLocalStories(newLocalStories);
  };

  const handleEraChange = (storyDragId: string, newEra: string) => {
    const newLocalStories = localStories.map(s => {
       if (s._dragId === storyDragId) {
          const currentMax = Math.max(0, ...localStories.filter(x => x.era === newEra).map(x => x.orderIndex || 0));
          return { ...s, era: newEra, orderIndex: currentMax + 1 };
       }
       return s;
    });
    setLocalStories(newLocalStories);
  };

  const saveChanges = () => {
    // 1. Optimistic Update: instantly update local state and close the modal
    setStories(localStories);
    onClose();

    // 2. Background Processing: sync to Firebase without blocking the user
    saveHighFidelityStories(userId, localStories).catch((e) => {
      console.error("Failed background save:", e);
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-950 w-full max-w-7xl h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800"
      >
         {/* HEADER */}
         <div className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 gap-4">
            <div>
               <h2 className="text-2xl font-bold flex items-center gap-2"><Library /> Storyboard Editor</h2>
               <p className="text-sm text-zinc-500">Drag to reorder chronologically within eras, or change an event's classification.</p>
            </div>
            <div className="flex gap-3 shrink-0">
               <button onClick={onClose} disabled={isSaving} className="px-4 py-2 font-bold rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition border border-zinc-200 dark:border-zinc-800">Cancel</button>
               <button onClick={saveChanges} disabled={isSaving} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition">
                 {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Timeline
               </button>
            </div>
         </div>

         {/* ERA JUMP NAV */}
         <div className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            {Object.keys(ERA_ORDER).sort((a,b)=>ERA_ORDER[a]-ERA_ORDER[b]).map(era => (
               <button 
                  key={`nav-${era}`}
                  onClick={() => {
                     const container = document.getElementById("storyboard-scroll-container");
                     const target = document.getElementById(`era-col-${era}`);
                     if (container && target) {
                        const targetOffset = target.offsetLeft - container.offsetLeft - 24;
                        container.scrollTo({ left: targetOffset, behavior: 'smooth' });
                     }
                  }}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 transition shrink-0 shadow-sm"
               >
                  {era}
               </button>
            ))}
         </div>

         {/* GRID BODY */}
         <div id="storyboard-scroll-container" className="flex-1 overflow-x-auto p-6 bg-[#F6F5F0] dark:bg-[#0a0a0a] relative scroll-smooth">
            <div className="flex gap-6 h-full items-start w-max pb-8">
               {Object.entries(ERA_ORDER).sort((a,b)=>a[1]-b[1]).map(([eraKey, _]) => {
                 const eraStories = storiesByEra[eraKey] || [];
                 return (
                   <div key={eraKey} id={`era-col-${eraKey}`} className="w-[320px] shrink-0 flex flex-col gap-3 h-full overflow-hidden transition-all">
                      <div className="bg-white dark:bg-zinc-900 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between shrink-0">
                         <h3 className="font-bold text-sm tracking-widest uppercase text-indigo-900 dark:text-indigo-400">{eraKey}</h3>
                         <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-900">{eraStories.length}</span>
                      </div>

                      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                        <Reorder.Group axis="y" values={eraStories} onReorder={(newOrder) => handleReorder(eraKey, newOrder)} className="flex flex-col gap-3">
                          {eraStories.map((story, index) => (
                             <Reorder.Item key={story._dragId} value={story} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xl shadow-black/5 cursor-grab active:cursor-grabbing hover:border-indigo-400 group transition-colors">
                                <div className="flex justify-between items-start mb-3 gap-2">
                                   <div className="flex items-start gap-2 flex-1">
                                      <span className="shrink-0 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 font-extrabold text-[10px] w-5 h-5 flex items-center justify-center rounded-full mt-0.5 shadow-sm">
                                         {index + 1}
                                      </span>
                                      <h4 className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100 leading-snug">{story.title}</h4>
                                   </div>
                                   <GripVertical size={16} className="text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-white shrink-0" />
                                </div>
                                <p className="text-xs text-zinc-500 line-clamp-3 mb-4 leading-relaxed font-medium">"{story.synopsis}"</p>
                                
                                <select 
                                   value={story.era} 
                                   onChange={(e) => handleEraChange(story._dragId, e.target.value)}
                                   className="w-full text-xs font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 p-2 rounded-lg cursor-pointer focus:outline-none focus:border-indigo-500 transition-colors"
                                >
                                   {Object.keys(ERA_ORDER).map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                             </Reorder.Item>
                          ))}
                          {eraStories.length === 0 && (
                             <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl h-24 flex items-center justify-center text-xs text-zinc-400 font-bold uppercase tracking-widest bg-zinc-50/50 dark:bg-zinc-900/50">Empty</div>
                          )}
                        </Reorder.Group>
                      </div>
                   </div>
                 );
               })}
            </div>
         </div>
      </motion.div>
    </div>
  );
}
