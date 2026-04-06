"use client";

import { useState, useEffect, useRef } from "react";
import { processTranscriptAction, generateQuestionsAction, uploadAndExtractAction, generateSynopsisAction, chatWithLegacyAction, generateWisdomSummariesAction } from "./actions";
import { saveCompiledSession, fetchUserSessions, deleteSession, uploadNotebookSource, fetchUserSources, deleteNotebookSource, type NotebookSource } from "@/lib/firebase/db";
import { type TranscriptChunk, type WisdomSummary } from "@/lib/rag";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Sparkles, Search, BookOpen, FileText, X, PlusCircle, LogOut, ArrowRight, Share2, Settings, MessageSquare, AudioLines, Presentation, Network, Brain, FileSpreadsheet, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { InterviewerModal } from "@/components/InterviewerModal";
import { auth } from "@/lib/firebase/client";

export default function Home() {
  const { user, loading } = useAuth();
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [synopsis, setSynopsis] = useState<string>("");
  
  const [chatMessages, setChatMessages] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [wisdomSummaries, setWisdomSummaries] = useState<WisdomSummary[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterviewerThinking, setIsInterviewerThinking] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showVault, setShowVault] = useState(false);
  const [isInterviewerOpen, setIsInterviewerOpen] = useState(false);
  
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

    // 1. Fetch History
    const sessions = await fetchUserSessions(user.uid);
    const sortedHistory = sessions.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setHistory(sortedHistory);

    // 2. Fetch Sources
    const cloudSources = await fetchUserSources(user.uid);
    setSources(cloudSources);

    // 3. Hydrate UI efficiently
    if (cloudSources.length > 0 && sortedHistory.length > 0) {
       // Load the exact state from the most recent save instead of burning tokens
       const latestSession = sortedHistory[0] as any;
       setSynopsis(latestSession.synopsis || "No synopsis available.");
       setChunks(latestSession.chunks || []);
       setQuestions(latestSession.aiRecommendedQuestions || []);
       
       if (!latestSession.wisdomSummaries && latestSession.chunks) {
          const uniqueTags = Array.from(new Set<string>(latestSession.chunks.flatMap((c: any) => c.wisdomTags || [])));
          setWisdomSummaries(uniqueTags.map(tag => ({ tag, summary: "AI summary pending for historical archive." })));
       } else {
          setWisdomSummaries(latestSession.wisdomSummaries || []);
       }
       setChatMessages(latestSession.chatMessages || []);
    } else if (cloudSources.length > 0 && sortedHistory.length === 0) {
       // Fallback: If sources exist but no overview ever compiled
       await handleAutoProcess(cloudSources);
    } else {
       // Empty state
       setSynopsis("");
       setChunks([]);
       setWisdomSummaries([]);
       setChatMessages([]);
       setQuestions([]);
    }
    
    setIsProcessing(false);
  };

  const handleCloudUpload = async (files: File[]) => {
    if (!user || files.length === 0) return;
    setIsUploading(true);
    const uploadedSources: NotebookSource[] = [];

    // Process and extract to Firebase Persistence sequentially
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const text = await uploadAndExtractAction(formData);
      
      const savedDoc = await uploadNotebookSource(user.uid, file.name, file.size, text);
      if (savedDoc) uploadedSources.push(savedDoc);
    }
    
    // Once completely pushed to Cloud, amalgamate with current sources and trigger RAG
    const newSourceState = [...sources, ...uploadedSources];
    setSources(newSourceState);
    setIsUploading(false);
    
    await handleAutoProcess(newSourceState);
  };

  const handleAutoProcess = async (notebookFiles: NotebookSource[]) => {
    if (!user) return;
    if (notebookFiles.length === 0) {
      setSynopsis("");
      setChunks([]);
      setQuestions([]);
      return;
    }
    
    setIsProcessing(true);
    setSynopsis("");
    setChunks([]);
    setQuestions([]);
    setWisdomSummaries([]);
    setChatMessages([]);

    try {
      let combinedTranscript = "";
      for (const src of notebookFiles) {
        combinedTranscript += `\n\n--- SOURCE: ${src.fileName} ---\n${src.textContent}`;
      }

      // Step 1: Synopsis
      const syn = await generateSynopsisAction(combinedTranscript);
      setSynopsis(syn);

      // Step 2: Extract Timeline (Background)
      const newChunks = await processTranscriptAction(combinedTranscript);
      setChunks(newChunks);

      // Step 3: Extract Wisdom Summaries
      const newWisdom = await generateWisdomSummariesAction(combinedTranscript);
      setWisdomSummaries(newWisdom);

      // Step 4: Extract Questions
      if (newChunks.length > 0 && !newChunks[0].text.startsWith("SYSTEM ERROR")) {
        setIsInterviewerThinking(true);
        const summaryContext = newChunks.map((c) => c.text).join(" ");
        const newQs = await generateQuestionsAction(summaryContext);
        setQuestions(newQs);
        setIsInterviewerThinking(false);

        // Step 5: Background Vault Save
        await saveCompiledSession(user.uid, newChunks, newQs, syn, newWisdom);
        await hydrateDashboardState();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const removeSource = async (indexToRemove: number) => {
    const targetSource = sources[indexToRemove];
    if (targetSource && targetSource.id) {
       await deleteNotebookSource(targetSource.id);
    }
    
    const newSources = sources.filter((_, idx) => idx !== indexToRemove);
    setSources(newSources);
    handleAutoProcess(newSources); // dynamically re-evaluate the overview!
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

    const aiResponseText = await chatWithLegacyAction(combinedTranscript, msg, chatMessages);
    
    setChatMessages([...newHistory, { role: "assistant", text: aiResponseText }]);
    setIsChatting(false);
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
              const file = new File([transcript], `AI_Interview_${new Date().toISOString().split('T')[0]}.txt`, { type: "text/plain" });
              await handleCloudUpload([file]);
            }} 
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
            <div className="absolute top-10 right-0 w-48 bg-white shadow-lg border border-slate-200 rounded-xl hidden group-hover:block z-50 p-2">
               <div className="px-3 py-2 text-xs text-slate-500 truncate">{user.email}</div>
               <button onClick={() => auth.signOut()} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"><LogOut size={16}/> Sign Out</button>
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
                     <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
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
                     {isChatting && (
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

                 <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900 hover:border-emerald-400 transition cursor-pointer p-4 rounded-xl flex items-center gap-4 hover:shadow-md">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                       <Network className="text-emerald-600 dark:text-emerald-400" size={20}/>
                    </div>
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-emerald-900 dark:text-emerald-400">Relationship Mind Map</span>
                       <span className="text-xs text-emerald-700/70 dark:text-emerald-400/70">Visual graphic mapping relationships</span>
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
    </div>
  );
}
