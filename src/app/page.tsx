"use client";

import { useState, useEffect, useRef } from "react";
import { processTranscriptAction, generateQuestionsAction, uploadAndExtractAction, generateSynopsisAction, chatWithLegacyAction, generateWisdomSummariesAction, extractHighFidelityStoriesAction, reduceHighFidelityStoriesAction, embedAndUpsertToPineconeAction, deletePineconeSourceAction, deleteAllPineconeResourcesAction, recompileStoriesWithContactsAction, reduceDashboardOverviewAction } from "./actions";
import { saveCompiledSession, fetchUserSessions, deleteSession, uploadNotebookSource, fetchUserSources, deleteNotebookSource, fetchHighFidelityStories, saveHighFidelityStories, fetchUserProfile, saveChatHistory, fetchChatHistory, fetchContacts, saveContact, fetchDashboardState, saveDashboardState, type PersistentDashboardState, type NotebookSource, type Contact } from "@/lib/firebase/db";
import { type TranscriptChunk, type WisdomSummary, type HighFidelityStory, type DashboardOverview } from "@/lib/rag";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { Sparkles, Search, BookOpen, FileText, X, PlusCircle, LogOut, ArrowRight, Share2, Settings, MessageSquare, AudioLines, Presentation, Network, Brain, FileSpreadsheet, Loader2, RefreshCcw, Trash2, User, Activity } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { InterviewerModal } from "@/components/InterviewerModal";
import { NetworkModal } from "@/components/NetworkModal";
import { auth } from "@/lib/firebase/client";

export interface UploadProgressState {
  [fileName: string]: {
    stage: string;
    progress: number;
  };
}

export default function Home() {
  const { user, loading } = useAuth();
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeUploads, setActiveUploads] = useState<UploadProgressState>({});
  
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [synopsis, setSynopsis] = useState<string>("");
  
  const [chatMessages, setChatMessages] = useState<{role: string, text: string}[]>([]);
  const [activeStreamText, setActiveStreamText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [wisdomSummaries, setWisdomSummaries] = useState<WisdomSummary[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [dashboardProgress, setDashboardProgress] = useState<{current: number, total: number, etaSeconds: number} | null>(null);

  // Safeguard: Prevent accidental reloads when processing
  useEffect(() => {
    if (!isProcessing) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Required by standard
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  const [isInterviewerThinking, setIsInterviewerThinking] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showVault, setShowVault] = useState(false);
  const [isInterviewerOpen, setIsInterviewerOpen] = useState(false);
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showNetwork, setShowNetwork] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatting]);

  useEffect(() => {
    if (user) {
      hydrateDashboardState();
    }
  }, [user]);

  const hydrateDashboardState = async () => {
    if (!user) return;
    setIsProcessing(true);

    // 1. Fetch Sources and Contacts
    const cloudSources = await fetchUserSources(user.uid);
    setSources(cloudSources);
    const loadedContacts = await fetchContacts(user.uid);
    setContacts(loadedContacts);

    // 2. Fetch Persistent Dashboard State
    const dashboardState = await fetchDashboardState(user.uid);
    
    // 3. Diff and Hydrate UI
    if (cloudSources.length > 0) {
       // If the persistent state is perfectly synced with current vault, just hydrate instantly!
       if (dashboardState && dashboardState.processedSourceIds.length === cloudSources.length) {
          setSynopsis(dashboardState.synopsis || "No synopsis available.");
          setWisdomSummaries(dashboardState.wisdom || []);
          setQuestions(dashboardState.questions || []);
          const pastChats = await fetchChatHistory(user.uid);
          setChatMessages(pastChats.slice(-6));
       } else {
          // Rolling Iteration: Unprocessed PDFs detected! Let's incrementally map-reduce them.
          await handleAutoProcess(cloudSources, dashboardState);
       }
    } else {
       // Empty state
       setSynopsis("");
       setWisdomSummaries([]);
       setChatMessages([]);
       setActiveStreamText("");
       setQuestions([]);
    }
    
    setIsProcessing(false);
  };

  const handleCloudUpload = async (files: File[]) => {
    if (!user || files.length === 0) return;
    setIsUploading(true);
    const uploadedSources: NotebookSource[] = [];
    
    // Initialize Progress State for all files
    const initialProgress: UploadProgressState = {};
    files.forEach(f => initialProgress[f.name] = { stage: "Queued", progress: 0 });
    setActiveUploads(initialProgress);
    
    const rawMappedStories: HighFidelityStory[] = [];

    const profile = await fetchUserProfile(user.uid);
    const subjectName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : (user.displayName || "the user");

    // Process and extract to Firebase Persistence sequentially
    for (const file of files) {
      setActiveUploads(prev => ({ ...prev, [file.name]: { stage: "Extracting Text", progress: 10 } }));
      const formData = new FormData();
      formData.append("file", file);
      const text = await uploadAndExtractAction(formData);
      
      setActiveUploads(prev => ({ ...prev, [file.name]: { stage: "Mapping Internal Story Arcs", progress: 30 } }));
      
      // Batch slice text to completely bypass Vercel 1MB payload limits and timeouts!
      const textChunks = [];
      for (let i = 0; i < text.length; i += 15000) {
         textChunks.push(text.substring(i, i + 15000));
      }
      
      for (let j = 0; j < textChunks.length; j++) {
         if (textChunks.length > 1) {
             setActiveUploads(prev => ({ ...prev, [file.name]: { stage: `Mapping Era Threads (${j+1}/${textChunks.length})`, progress: 30 + (20 * (j/textChunks.length)) } }));
         }
         const chunkStories = await extractHighFidelityStoriesAction(textChunks[j], undefined, undefined, subjectName);
         rawMappedStories.push(...chunkStories);
         
         // 500ms breather to prevent SocketError / connection drops on Vercel Native Fetch bounds
         await new Promise(r => setTimeout(r, 500));
      }
      
      setActiveUploads(prev => ({ ...prev, [file.name]: { stage: "Uploading to Firebase Storage", progress: 50 } }));
      const savedDoc = await uploadNotebookSource(user.uid, file.name, file.size, text);
      
      if (savedDoc) {
        uploadedSources.push(savedDoc);
        setActiveUploads(prev => ({ ...prev, [file.name]: { stage: "Vectorizing via Pinecone Agents", progress: 70 } }));
        await embedAndUpsertToPineconeAction(user.uid, savedDoc.id, text);
      }
      
      setActiveUploads(prev => ({ ...prev, [file.name]: { stage: "Waiting for Global Synthesis", progress: 80 } }));
    }
    
    // Group Update: Set Global High Fidelity Progress
    setActiveUploads(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => next[k] = { stage: "Reducing & Synthesizing Global Timeline...", progress: 90 });
        return next;
    });
    
    // Once completely pushed to Cloud, amalgamate with current sources and trigger RAG
    const newSourceState = [...sources, ...uploadedSources];
    setSources(newSourceState);
    
    // --- NEW: Map-Reduce High-Fidelity Synthesis ---
    if (user && rawMappedStories.length > 0) {
      try {
        const currentStories = await fetchHighFidelityStories(user.uid);
        
        const loadedUserContacts = await fetchContacts(user.uid);
        let relationalContext = "";
        if (loadedUserContacts.length > 0) {
           relationalContext = "Identity Map: " + loadedUserContacts.map(c => `'${c.originalName}', '${c.aliases.join("', '")}' -> ${c.completeName}`).join(" | ");
        }

        const updatedStories = await reduceHighFidelityStoriesAction(currentStories, rawMappedStories, undefined, relationalContext);
        await saveHighFidelityStories(user.uid, updatedStories);

        // Auto-Harvest Contacts
        const existingNames = new Set(loadedUserContacts.flatMap(c => [c.originalName, c.completeName, ...(c.aliases || [])]));
        const discoveredNames = new Set<string>();
        updatedStories.forEach(story => {
           story.peopleMentioned?.forEach(name => {
              if (!existingNames.has(name)) discoveredNames.add(name);
           });
        });
        
        for (const name of discoveredNames) {
           await saveContact(user.uid, { originalName: name, completeName: name, aliases: [], email: "", linkedAccountId: "" } as Contact);
        }
        if (discoveredNames.size > 0) setContacts(await fetchContacts(user.uid));

      } catch (err) {
        console.error("Map-Reduce synthesis failed:", err);
      }
    }
    // ---------------------------------------------
    
    await handleAutoProcess(newSourceState);
    
    // Finish UI Bar
    setActiveUploads(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => next[k] = { stage: "Complete", progress: 100 });
        return next;
    });
    
    // Hide UI
    setTimeout(() => {
        setActiveUploads({});
        setIsUploading(false);
    }, 2000);
  };

  const handleAutoProcess = async (notebookFiles: NotebookSource[], currentState: PersistentDashboardState | null = null) => {
    if (!user) return;
    if (notebookFiles.length === 0) {
      setSynopsis("");
      setWisdomSummaries([]);
      setQuestions([]);
      await saveChatHistory(user.uid, []);
      // MUST WIPE PERSISTENT STATE FULLY IF NO SOURCES REMAIN
      await saveDashboardState(user.uid, { synopsis: "", wisdom: [], questions: [], processedSourceIds: [] });
      return;
    }
    
    setIsProcessing(true);
    let activeState: PersistentDashboardState = currentState || {
        synopsis: "",
        wisdom: [],
        questions: [],
        processedSourceIds: []
    };

    try {
      // Find which files haven't been summarized yet
      const unprocessedFiles = notebookFiles.filter(src => src.id && !activeState.processedSourceIds.includes(src.id));
      
      if (unprocessedFiles.length === 0) {
          setIsProcessing(false);
          setDashboardProgress(null);
          return; // Everything already mapped!
      }

      setSynopsis("Iterating over new additions to compile Legacy Overview...");
      
      let processedCount = 0;
      const totalDocs = unprocessedFiles.length;
      let startTime = Date.now();
      
      setDashboardProgress({ current: 0, total: totalDocs, etaSeconds: 0 });

      const profile = await fetchUserProfile(user.uid);
      const subjectName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : (user.displayName || "the user");

      for (const src of unprocessedFiles) {
          const safeText = src.textContent ? src.textContent.substring(0, 15000) : "";
          if (!safeText) {
             processedCount++;
             continue;
          }
          
          // Map-Reduce this single file into the rolling dashboard overview mapping exclusively to the Main Subject
          const updatedOverview = await reduceDashboardOverviewAction(activeState, safeText, subjectName);
          
          processedCount++;
          const elapsed = Date.now() - startTime;
          const avg = elapsed / processedCount;
          const eta = Math.round((avg * (totalDocs - processedCount)) / 1000);
          setDashboardProgress({ current: processedCount, total: totalDocs, etaSeconds: eta });
          
          // 1500ms breather to completely prevent 'SocketError: other side closed'
          await new Promise(r => setTimeout(r, 1500));
          
          if (updatedOverview) {
             activeState = {
                 ...updatedOverview,
                 processedSourceIds: [...activeState.processedSourceIds, src.id!]
             };
             
             // Update the UI dynamically during the loop!
             setSynopsis(activeState.synopsis);
             setWisdomSummaries(activeState.wisdom);
             setQuestions(activeState.questions);
          }
      }

      // Final Persistent Save to Firestore
      await saveDashboardState(user.uid, activeState);
      await saveChatHistory(user.uid, []); // Flush chats when vault structure completely changes
    } catch (e) {
      console.error(e);
      setSynopsis(activeState.synopsis || "Synopsis unavailable. Waiting on background process to cycle.");
    } finally {
      setIsProcessing(false);
      setDashboardProgress(null); // Reset progress
    }
  };

  const removeSource = async (indexToRemove: number) => {
    const targetSource = sources[indexToRemove];
    
    // Optimistic UI Update: immediately slice the file out so the user sees it disappear.
    const newSources = sources.filter((_, idx) => idx !== indexToRemove);
    setSources(newSources);
    
    // Flush the persistent chat since the timeline facts are being altered!
    setChatMessages([]);
    setActiveStreamText("");
    if (user) {
       await saveChatHistory(user.uid, []);
    }

    // Fire off re-evaluation immediately in the background
    handleAutoProcess(newSources); 

    if (targetSource && targetSource.id) {
       await deleteNotebookSource(targetSource.id);
       
       // Scrub orphaned Vectors from Pinecone natively!
       if (user) {
          if (newSources.length === 0) {
             // Sweep the entire namespace if vault is emptied!
             await deleteAllPineconeResourcesAction(user.uid);
          } else {
             await deletePineconeSourceAction(user.uid, targetSource.id);
          }
       }
    }

    // --- NEW: Reconciliation Recompile ---
    if (user) {
      try {
        if (newSources.length > 0) {
          const vaultContext = newSources.map(s => `[Source: ${s.fileName}]\n${s.textContent}`).join("\n\n");
          const recompiled = await extractHighFidelityStoriesAction(vaultContext);
          await saveHighFidelityStories(user.uid, recompiled);
        } else {
          await saveHighFidelityStories(user.uid, []);
        }
      } catch (err) {
        console.error("Reconciliation compilation failed:", err);
      }
    }
    // -------------------------------------
  };

  const viewHistoricalSession = (session: any) => {
    setSynopsis(session.synopsis || "No synopsis available for historical archive.");
    setChunks(session.chunks || []);
    setQuestions(session.aiRecommendedQuestions || []);
    
    if (!session.wisdomSummaries && session.chunks) {
       const uniqueTags = Array.from(new Set<string>(session.chunks.flatMap((c: any) => c.wisdomTags || [])));
       setWisdomSummaries(uniqueTags.map(tag => ({ tag, summary: "AI summary pending for historical archive." })));
    } else {
       setWisdomSummaries(session.wisdomSummaries || []);
    }
    
    setChatMessages([]);
    setShowVault(false);
  };

  const handleChatSubmit = async (e?: React.FormEvent, presetMessage?: string) => {
    e?.preventDefault();
    const msg = presetMessage || chatInput;
    if (!msg.trim() || isChatting || sources.length === 0) return;

    const newUserMsg = { role: "user", text: msg };
    const newHistory = [...chatMessages, newUserMsg];
    setChatMessages(newHistory);
    setChatInput("");
    setIsChatting(true);

    let combinedTranscript = "";
    for (const src of sources) {
       combinedTranscript += `\n\n--- SOURCE: ${src.fileName} ---\n${src.textContent}`;
    }

    let linguisticContext = "";
    if (user) {
      const profile = await fetchUserProfile(user.uid);
      linguisticContext = [profile?.culturalHeritage, profile?.primaryLanguage, profile?.secondaryLanguages].filter(Boolean).join(" | ");
    }

    let relationalContext = "";
    if (contacts.length > 0) {
       relationalContext = "Identity Map: " + contacts.map(c => `'${c.originalName}', '${c.aliases.join("', '")}' -> ${c.completeName}`).join(" | ");
    }

    // Do not create placeholder in chatMessages immediately. We will stream it in activeStreamText!
    setChatMessages(newHistory);
    setActiveStreamText("");
    
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          question: msg,
          history: chatMessages, // omit the current user prompt since it's sent as 'question'
          linguisticContext,
          relationalContext,
        }),
      });

      if (!response.body) throw new Error("No response body.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rawStreamText = "";
      let displayedText = "";
      let isNetworkDone = false;

      // Software Typewriter: Decoupled and throttled to 60ms (approx 15fps) to prevent AST lockups
      const pumpTypewriter = () => {
        if (displayedText.length < rawStreamText.length) {
          const distance = rawStreamText.length - displayedText.length;
          const charsToAdd = Math.max(1, Math.min(distance, Math.ceil(distance / 5)));
          
          displayedText += rawStreamText.substring(displayedText.length, displayedText.length + charsToAdd);
          setActiveStreamText(displayedText);
          
          setTimeout(pumpTypewriter, 60);
        } else if (isNetworkDone) {
          const finalMessages = [...newHistory, { role: "assistant", text: displayedText }];
          setChatMessages(finalMessages);
          setActiveStreamText("");
          setIsChatting(false);
          saveChatHistory(user.uid, finalMessages);
        } else {
          setTimeout(pumpTypewriter, 60);
        }
      };
      
      pumpTypewriter();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          isNetworkDone = true;
          break;
        }
        rawStreamText += decoder.decode(value, { stream: true });
      }
    } catch (e: any) {
      console.error("Chat Stream err:", e);
      setChatMessages(prev => [...prev, { role: "assistant", text: "SYSTEM ERROR: Stream failed." }]);
      setActiveStreamText("");
      setIsChatting(false);
    }
  };

  const handleTagClick = (wisdom: WisdomSummary) => {
    const hasRealSummary = wisdom.summary && !wisdom.summary.includes('pending');
    const promptMessage = hasRealSummary 
      ? `Please discuss the theme of ${wisdom.tag}. You can expand gracefully on this insight: "${wisdom.summary}"`
      : `Based on the transcripts, what can you tell me about the theme of ${wisdom.tag}?`;
    handleChatSubmit(undefined, promptMessage);
  };

  const removeHistorySession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    await hydrateDashboardState();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F6F5F0] dark:bg-zinc-950"><Sparkles className="animate-spin text-blue-500" /></div>;
  if (!user) return <div className="min-h-screen bg-[#F6F5F0] dark:bg-zinc-950 px-4"><LoginModule /></div>;

  return (
    <div className="h-screen flex flex-col bg-[#F3F4F6] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      
      <AnimatePresence>
        {isInterviewerOpen && (
          <InterviewerModal 
            onClose={() => setIsInterviewerOpen(false)} 
            onSave={async (transcript) => {
              const enrichedTranscript = `--- METADATA ---\nSOURCE: Legacy Nexus Active AI Interface Interview\nINTERVIEWER: Legacy Nexus AI\nDATE: ${new Date().toISOString().split('T')[0]}\n--- TRANSCRIPT ---\n\n${transcript}`;
              const file = new File([enrichedTranscript], `AI_Interview_${new Date().toISOString().split('T')[0]}.txt`, { type: "text/plain" });
              await handleCloudUpload([file]);
            }} 
          />
        )}
        {showNetwork && user && (
          <NetworkModal 
            userId={user.uid}
            contacts={contacts}
            sources={sources}
            onClose={() => setShowNetwork(false)}
            onContactsUpdated={(updatedContacts) => setContacts(updatedContacts)}
          />
        )}
      </AnimatePresence>

      {/* Global Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 dark:bg-white text-white dark:text-zinc-900 w-8 h-8 rounded-full flex items-center justify-center font-bold font-serif shadow-sm">N</div>
          <span className="font-semibold text-lg flex items-center gap-2">Legacy Nexus <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-xs rounded-full font-medium text-zinc-500">Workspace</span></span>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition"><Share2 size={16}/> Share</button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition"><Settings size={16}/> Settings</button>
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer relative group">
            {user.email?.[0].toUpperCase()}
            <div className="absolute top-full right-0 pt-2 w-48 hidden group-hover:block z-50">
               <div className="bg-white shadow-lg border border-slate-200 rounded-xl p-2 flex flex-col gap-1">
                 <div className="px-3 py-2 text-xs text-slate-500 truncate">{user.email}</div>
                 <Link href="/profile" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2">
                   <User size={16}/> Profile
                 </Link>
                 <Link href="/progress" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2">
                   <Activity size={16}/> Legacy Progress
                 </Link>
                 <button onClick={() => auth.signOut()} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 pt-3"><LogOut size={16}/> Sign Out</button>
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        
        {/* COLUMN 1: Sources (25%) */}
        <div className="col-span-3 bg-white/60 dark:bg-zinc-900/40 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full overflow-y-auto">
          <div className="p-4 flex items-center justify-between sticky top-0 bg-white/60 dark:bg-zinc-900/40 backdrop-blur z-10 border-b border-zinc-100 dark:border-zinc-800/50">
            <h2 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              Sources
            </h2>
            <button 
              onClick={() => setShowVault(!showVault)}
              className="text-xs bg-amber-50 text-amber-600 hover:bg-amber-100 px-2 py-1 rounded-md font-bold transition flex items-center gap-1"
            >
              <BookOpen size={12}/> Vault ({history.length})
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Native Auto-upload Label */}
            <label className={`flex items-center justify-center gap-2 w-full py-2.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-medium rounded-full cursor-pointer transition shadow-sm ${isUploading ? 'opacity-50 pointer-events-none':''}`}>
              {isUploading ? <RefreshCcw size={16} className="animate-spin text-zinc-500"/> : <PlusCircle size={16} />} 
              {isUploading ? 'Uploading to cloud...' : 'Add sources'}
              <input 
                type="file" multiple className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const newFiles = Array.from(e.target.files);
                    handleCloudUpload(newFiles);
                  }
                  e.target.value = "";
                }} 
                accept=".txt,.md,.csv,.pdf,application/pdf" 
              />
            </label>

            {/* Dynamic Progress Trackers */}
            {Object.keys(activeUploads).length > 0 && (
               <div className="flex flex-col gap-3 mb-2">
                  {Object.entries(activeUploads).map(([fileName, data]) => (
                      <div key={fileName} className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
                          <div className="flex justify-between mb-2">
                             <span className="truncate max-w-[150px] font-medium text-zinc-700 dark:text-zinc-300">{fileName}</span>
                             <span className="text-zinc-500 font-bold">{Math.round(data.progress)}%</span>
                          </div>
                          <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                             <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out" style={{width: `${data.progress}%`}}></div>
                          </div>
                          <span className="text-[10px] text-zinc-500 mt-2 block font-medium animate-pulse">{data.stage}</span>
                      </div>
                  ))}
               </div>
            )}

            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
              <input type="text" placeholder="Search sources..." className="w-full pl-8 pr-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-transparent focus:border-blue-500/20" />
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-500">
               <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-200">All</span>
               <span className="px-3 py-1 border border-zinc-200 dark:border-zinc-700 rounded-full">PDFs</span>
               <span className="px-3 py-1 border border-zinc-200 dark:border-zinc-700 rounded-full">Text</span>
            </div>

            {/* List the currently active persistent Cloud Sources */}
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">{sources.length > 0 ? "Cloud Resources" : ""}</p>
              <AnimatePresence>
                {sources.map((src, idx) => (
                  <motion.div key={src.id || idx} initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0}} className="flex items-center gap-3 p-2 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-transparent dark:border-zinc-800 rounded-lg group text-sm">
                     <FileText size={16} className={`${src.fileName.endsWith('.pdf') ? 'text-red-500':'text-blue-500'}`} />
                     <span className="flex-1 truncate font-medium">{src.fileName}</span>
                     <button onClick={() => removeSource(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500"><X size={14}/></button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {/* Wisdom Tags */}
            <div className="mt-8 flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4 flex-1 h-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{wisdomSummaries.length > 0 ? "Wisdom Tags" : ""}</p>
              
              {wisdomSummaries.length > 0 && (
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2 text-zinc-400" />
                  <input 
                    type="text" 
                    placeholder="Search tags..." 
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-transparent focus:border-blue-500/20" 
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-10">
                {[...wisdomSummaries]
                  .filter(w => w.tag.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                  .sort((a,b) => a.tag.localeCompare(b.tag))
                  .map((wisdom, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => handleTagClick(wisdom)}
                    className="text-xs font-semibold px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50 rounded-md cursor-pointer transition text-left"
                  >
                    {wisdom.tag}
                  </button>
                ))}
              </div>
            </div>
            
          </div>
        </div>

        {/* Modal: Vault Dropdown (if toggled) */}
        {showVault && (
          <div className="absolute top-16 left-64 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-900/10 flex justify-between items-center">
              <h3 className="font-bold text-amber-700 dark:text-amber-500 flex items-center gap-2"><BookOpen size={16}/> Saved Timelines</h3>
              <button onClick={() => setShowVault(false)}><X size={16} className="text-zinc-400"/></button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {history.map((session) => (
               <div key={session.id} onClick={() => viewHistoricalSession(session)} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 p-3 rounded-xl cursor-pointer group transition">
                 <p className="text-xs text-zinc-500 mb-1">{new Date(session.createdAt?.toDate?.() || Date.now()).toLocaleString()}</p>
                 <p className="text-sm font-semibold line-clamp-2 leading-snug">{session.synopsis || "Historical Session Compilation"}</p>
                 <button onClick={(e) => removeHistorySession(e, session.id)} className="mt-2 text-xs text-red-500 opacity-0 group-hover:opacity-100 flex items-center gap-1"><Trash2 size={12}/> Delete</button>
               </div>
              ))}
              {history.length === 0 && <p className="text-sm p-4 text-center text-zinc-500">Vault is empty.</p>}
            </div>
          </div>
        )}

        {/* COLUMN 2: Chat & Document Viewer (50%) */}
        <div className="col-span-6 bg-white dark:bg-zinc-950 flex flex-col h-full relative min-h-0">
          
          <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
             <div className="flex items-center gap-2 text-zinc-400 font-medium text-sm">
                Chat
             </div>
             <button className="text-xs font-semibold px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">Save to note</button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-10 pb-40 scroll-smooth">
             
             {isProcessing ? (
               <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4">
                 <Loader2 size={32} className="animate-spin text-blue-500" />
                 <p className="text-sm font-medium animate-pulse">Reading sources & generating synopsis...</p>
               </div>
             ) : (
               <>
                 {/* Synopsis Block */}
                 {(synopsis || chunks.length > 0) && (
                   <div className="mb-12">
                     <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 mb-6 leading-tight">Legacy Overview</h1>
                     <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                       {synopsis}
                     </p>
                   </div>
                 )}

                 {/* Chat Messages */}
                 {chatMessages.length > 0 && (
                   <div className="flex flex-col gap-6">
                     {chatMessages.map((msg, index) => (
                       <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm ml-auto' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-tl-sm mr-auto'}`}>
                           <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                             <ReactMarkdown 
                               components={{
                                 p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                                 strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                                 ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4" {...props} />,
                                 ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4" {...props} />,
                                 li: ({node, ...props}) => <li className="mb-1" {...props} />,
                                 h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3" {...props} />,
                                 h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-3" {...props} />,
                                 h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2" {...props} />
                               }}
                             >
                               {msg.text}
                             </ReactMarkdown>
                           </div>
                         </div>
                       </div>
                     ))}
                     {activeStreamText && (
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl p-4 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-tl-sm mr-auto">
                            <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                              <ReactMarkdown 
                                components={{
                                  p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                                  strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                                  ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4" {...props} />,
                                  ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4" {...props} />,
                                  li: ({node, ...props}) => <li className="mb-1" {...props} />,
                                  h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3" {...props} />,
                                  h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-3" {...props} />,
                                  h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2" {...props} />
                                }}
                              >
                                {activeStreamText}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                     )}
                     {isChatting && !activeStreamText && (
                       <div className="flex justify-start">
                         <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 rounded-2xl rounded-tl-sm p-4 w-16 flex justify-center">
                           <Loader2 size={16} className="animate-spin" />
                         </div>
                       </div>
                     )}
                     <div ref={messagesEndRef} className="h-4" />
                   </div>
                 )}

                 {sources.length === 0 && chunks.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-50">
                     <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4"><MessageSquare size={32}/></div>
                     <p className="text-lg font-medium text-zinc-500">Add a source to begin generation.</p>
                   </div>
                 )}
               </>
             )}

          </div>

          {/* Sticky Input Chat Box at Absolute Bottom */}
          <div className="absolute bottom-6 left-8 right-8">
             <form onSubmit={handleChatSubmit} className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-xl rounded-full px-4 py-3 flex items-center gap-3">
                <input 
                  type="text" 
                  placeholder="Ask any question about the sources..." 
                  className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-zinc-400"
                  disabled={sources.length === 0 || isProcessing || isChatting}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button 
                  type="submit"
                  disabled={sources.length === 0 || isProcessing || isChatting || !chatInput.trim()} 
                  className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-50 transition"
                >
                  <ArrowRight size={16}/>
                </button>
             </form>
             <p className="text-center text-[10px] text-zinc-400 mt-3">Legacy Nexus can make mistakes. Always verify stories with family.</p>
          </div>
        </div>

        {/* COLUMN 3: Studio (25%) */}
        <div className="col-span-3 bg-zinc-50 dark:bg-[#121212] border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full overflow-y-auto">
           <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-[15px] flex items-center justify-between">
              Studio
              <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Beta</span>
           </div>

           <div className="p-4 space-y-6">
              
              {/* Studio Tool Grid */}
              <div className="grid grid-cols-1 gap-3">
                 <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 hover:border-blue-400 transition cursor-pointer p-4 rounded-xl flex items-center gap-4 hover:shadow-md">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                       <AudioLines className="text-blue-600 dark:text-blue-400" size={20}/>
                    </div>
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-blue-900 dark:text-blue-300">Audio Overview</span>
                       <span className="text-xs text-blue-700/70 dark:text-blue-400/70">Listen to a deep dive podcast</span>
                    </div>
                 </div>

                 <div 
                   onClick={() => setShowNetwork(true)}
                   className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900 hover:border-emerald-400 transition cursor-pointer p-4 rounded-xl flex items-center gap-4 hover:shadow-md"
                 >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                       <Network className="text-emerald-600 dark:text-emerald-400" size={20}/>
                    </div>
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-emerald-900 dark:text-emerald-400">Network Entities</span>
                       <span className="text-xs text-emerald-700/70 dark:text-emerald-400/70">Manage NexusLink Identities</span>
                    </div>
                 </div>

                 <div 
                   onClick={() => setIsInterviewerOpen(true)}
                   className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900 hover:border-purple-400 transition cursor-pointer p-4 rounded-xl flex items-center gap-4 hover:shadow-md"
                 >
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                       <Brain className="text-purple-600 dark:text-purple-400" size={20}/>
                    </div>
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-purple-900 dark:text-purple-400">AI Interviewer</span>
                       <span className="text-xs text-purple-700/70 dark:text-purple-400/70">Interactive voice conversations</span>
                    </div>
                 </div>
              </div>

              {/* AI Interviewer Integration */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 mb-4"><Brain size={14}/> Interviewer Suggestions</h3>
                
                {isInterviewerThinking && (
                   <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 animate-pulse text-sm text-zinc-500">
                     Synthesizing interrogations...
                   </div>
                )}
                
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div key={idx} className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm hover:border-blue-400 cursor-pointer transition text-[13px] leading-snug text-zinc-700 dark:text-zinc-300 font-medium">
                      {q}
                    </div>
                  ))}
                  {questions.length === 0 && !isInterviewerThinking && chunks.length > 0 && (
                     <p className="text-sm text-zinc-500">No suggestions generated.</p>
                  )}
                  {chunks.length === 0 && !isProcessing && (
                     <p className="text-xs text-zinc-400 text-center mt-8">Upload documents to unlock the Studio features.</p>
                  )}
                </div>
              </div>
           </div>
        </div>

      </main>
      <AnimatePresence>
        {isProcessing && (
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
                  <h4 className="font-bold">
                     {dashboardProgress ? `Synthesizing Vault Context (${dashboardProgress.current}/${dashboardProgress.total})` : "Synthesizing Vault Context"}
                  </h4>
                  <p className="text-sm text-indigo-200">
                     {dashboardProgress && dashboardProgress.etaSeconds > 0 
                         ? `Estimated time remaining: ${dashboardProgress.etaSeconds}s`
                         : "The AI is currently processing your data. Please do not close or refresh this page."}
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 overflow-hidden">
               {dashboardProgress ? (
                   <div 
                      className="h-full bg-indigo-200 transition-all duration-1000" 
                      style={{ width: `${(dashboardProgress.current / dashboardProgress.total) * 100}%` }} 
                   />
               ) : (
                   <div className="h-full bg-indigo-300 w-full animate-pulse" />
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
