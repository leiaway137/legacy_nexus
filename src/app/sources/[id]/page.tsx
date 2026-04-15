"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Loader2, Bot, User, TextQuote, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchUserSources, updateNotebookSourceParsedContent, NotebookSource, fetchUserProfile, updateNotebookSourceIntelligence } from "@/lib/firebase/db";
import { useParams } from "next/navigation";

export default function SourceViewerPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const sourceId = params.id as string;
  
  const [source, setSource] = useState<NotebookSource | null>(null);
  const [parsedChunks, setParsedChunks] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const [errorLocal, setErrorLocal] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Track hasParsed using a ref to prevent strict mode double-firing
  const hasParsed = useRef(false);

  useEffect(() => {
    if (user && sourceId) {
      fetchUserSources(user.uid).then(sources => {
        const target = sources.find(s => s.id === sourceId);
        if (target) {
            setSource(target);
            if (target.parsedContent) {
                setParsedChunks(target.parsedContent);
            } else if (!hasParsed.current) {
                // If not parsed yet, trigger stream immediately
                hasParsed.current = true;
                formatTranscriptWithAI(target);
            }
        } else {
            setErrorLocal("Source not found.");
        }
      });
    }
  }, [user, sourceId]);

  useEffect(() => {
    // Keep scroll pinned to bottom while streaming
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [parsedChunks, isStreaming]);

  const formatTranscriptWithAI = async (targetSource: NotebookSource, forceFormat?: 'DIALOGUE' | 'REPORT') => {
      setIsStreaming(true);
      setErrorLocal("");
      let completedString = "";

      try {
          if (!targetSource.textContent || targetSource.textContent.length < 20) {
              throw new Error("UNABLE_TO_PARSE: This document seems to have no machine-readable text (it may be a scanned image). Please re-upload a text-searchable version.");
          }

          let currentIntelligence = targetSource.intelligence;

          // Step 1: Analyze Document Intelligence if missing
          if (!currentIntelligence) {
              setAnalysisStage("Analyzing Speakers & Context...");
              const analyzeRes = await fetch("/api/analyze-transcript", {
                  method: "POST",
                  headers: {"Content-Type": "application/json"},
                  body: JSON.stringify({ textContent: targetSource.textContent })
              });
              
              if (!analyzeRes.ok) {
                  const errData = await analyzeRes.json().catch(() => ({}));
                  throw new Error(errData.error || `Analysis Error ${analyzeRes.status}`);
              }
              
              const analyzeData = await analyzeRes.json();
              currentIntelligence = analyzeData.intelligence || analyzeData; // handle {intelligence: ...} or direct object mapping

              if (targetSource.id && currentIntelligence) {
                  await updateNotebookSourceIntelligence(targetSource.id, currentIntelligence);
                  setSource(prev => prev ? { ...prev, intelligence: currentIntelligence } : prev);
              }
          }

          setAnalysisStage("Reconstructing Narrative...");

          // Dynamically fetch linguistic context to perform phonetic translation on-the-fly!
          let linguisticContext = "";
          if (user) {
             const profile = await fetchUserProfile(user.uid);
             linguisticContext = [profile?.culturalHeritage, profile?.primaryLanguage, profile?.secondaryLanguages].filter(Boolean).join(" | ");
          }

          const res = await fetch("/api/parse-transcript", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({ textContent: targetSource.textContent, linguisticContext, forceFormat, documentIntelligence: currentIntelligence })
          });

          if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || `Server Error ${res.status}`);
          }
          
          const reader = res.body?.getReader();
          const decoder = new TextDecoder("utf-8");

          if (reader) {
              while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = decoder.decode(value, { stream: true });
                  completedString += chunk;
                  setParsedChunks(completedString);
              }
          }
          
          // Complete, save to Firebase
          if (targetSource.id) {
              await updateNotebookSourceParsedContent(targetSource.id, completedString);
          }
      } catch (err: any) {
          setErrorLocal(`DEBUG: ${err.message || String(err)}`);
      } finally {
          setIsStreaming(false);
      }
  };

  // Recursively process children strings to inject [EDIT] UI spans
  const renderWithHighlights = (children: React.ReactNode): React.ReactNode => {
      if (Array.isArray(children)) {
          return children.map((child, idx) => <span key={idx}>{renderWithHighlights(child)}</span>);
      }
      if (typeof children === 'string') {
          const parts = children.split(/\[EDIT:\s*(.*?)\]/g);
          if (parts.length === 1) return children;
          return parts.map((part, i) => {
              if (i % 2 !== 0) {
                  return <span key={i} className="bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded text-[13px] font-semibold border border-amber-200 dark:border-amber-800/80 shadow-sm mx-0.5" title="AI Linguistic Correction">{part}</span>;
              }
              return <span key={i}>{part}</span>;
          });
      }
      // If it's a React element, clone it and process its children
      if (typeof children === 'object' && children !== null && 'props' in (children as any)) {
          const el = children as React.ReactElement<any, any>;
          if (el.props.children) {
             return React.cloneElement(el, { ...el.props }, renderWithHighlights(el.props.children));
          }
      }
      return children;
  };

  // Safe manual regex formatter for Dialogue blocks
  const renderMessageWithHighlights = (msg: string) => {
      const parts = msg.split(/\[EDIT:\s*(.*?)\]/g);
      return parts.map((part, i) => {
          if (i % 2 !== 0) {
              return <span key={i} className="bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded text-sm font-semibold border border-amber-200 dark:border-amber-800/80 shadow-sm mx-0.5" title="AI Linguistic Correction">{part}</span>;
          }
          return <span key={i}>{part}</span>;
      });
  };

  // Render prose document using Markdown
  const renderReport = (text: string) => {
      return (
         <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 md:p-10 shadow-sm w-full mx-auto max-w-3xl">
             <ReactMarkdown 
                  components={{
                     h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6 mt-8 pb-2 border-b border-zinc-100 dark:border-zinc-800" {...props}>{renderWithHighlights(props.children)}</h1>,
                     h2: ({node, ...props}) => <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4 mt-8" {...props}>{renderWithHighlights(props.children)}</h2>,
                     h3: ({node, ...props}) => <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3 mt-6" {...props}>{renderWithHighlights(props.children)}</h3>,
                     p: ({node, ...props}) => <p className="text-zinc-700 dark:text-zinc-300 text-[15.5px] leading-[1.8] mb-5 tracking-tight" {...props}>{renderWithHighlights(props.children)}</p>,
                     ul: ({node, ...props}) => <ul className="list-disc list-inside mb-5 text-zinc-700 dark:text-zinc-300 space-y-2 ml-2" {...props}>{renderWithHighlights(props.children)}</ul>,
                     ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-5 text-zinc-700 dark:text-zinc-300 space-y-2 ml-2" {...props}>{renderWithHighlights(props.children)}</ol>,
                     li: ({node, ...props}) => <li className="leading-relaxed" {...props}>{renderWithHighlights(props.children)}</li>,
                     strong: ({node, ...props}) => <strong className="font-bold text-zinc-900 dark:text-zinc-100" {...props}>{renderWithHighlights(props.children)}</strong>,
                  }}
              >
                  {text}
              </ReactMarkdown>
         </div>
      );
  };

  // Convert raw string into structured dialogue bubbles safely
  const renderDialogue = (text: string) => {
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      const blocks: {speaker: string, message: string}[] = [];
      let currentSpeaker = "Narrator";

      lines.forEach(line => {
          // Attempt to extract speaker name if it strictly starts with "Speaker:" or "**Speaker**:"
          const match = line.match(/^(\*\*?[^*:]+\*\*?|[^:]+):\s*(.*)/);
          if (match && match[1].length < 35) { // Limit speaker name length to prevent accidental sentence matching
             currentSpeaker = match[1].replace(/\*/g, '').trim(); 
             blocks.push({ speaker: currentSpeaker, message: match[2].trim() });
          } else {
             if (blocks.length > 0) {
                 blocks[blocks.length - 1].message += "\n\n" + line.trim();
             } else {
                 blocks.push({ speaker: currentSpeaker, message: line.trim() });
             }
          }
      });
      
      return blocks.map((block, idx) => {
          const isInterviewer = block.speaker.toLowerCase().includes("interviewer") || block.speaker.toLowerCase() === "system";

          return (
             <div key={idx} className={`flex gap-4 w-full ${isInterviewer ? 'flex-row-reverse' : 'flex-row'} items-start mb-6`}>
                 <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center ${isInterviewer ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                     {isInterviewer ? <Bot size={18}/> : <User size={18}/>}
                 </div>
                 <div className={`flex flex-col ${isInterviewer ? 'items-end' : 'items-start'} max-w-[85%]`}>
                     <span className="text-xs font-bold text-zinc-500 mb-1">{block.speaker}</span>
                     <div className={`p-4 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap ${isInterviewer ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-none shadow-sm'}`}>
                        {renderMessageWithHighlights(block.message)}
                     </div>
                 </div>
             </div>
          );
      });
  };

  if (loading || (!source && !errorLocal)) {
     return <div className="flex items-center justify-center h-screen bg-zinc-50 dark:bg-zinc-950"><Loader2 className="animate-spin text-zinc-400 w-8 h-8" /></div>;
  }

  if (errorLocal) {
     return (
        <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 dark:bg-zinc-950">
            <TextQuote size={48} className="text-zinc-300 mb-4"/>
            <h2 className="text-lg font-bold text-zinc-700">Unable to Load Transcript</h2>
            <p className="text-zinc-500 mb-6">{errorLocal}</p>
            <Link href="/sources" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 transition">Return to Vault</Link>
        </div>
     );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 font-sans relative">
      <header className="flex-shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-10 w-full">
          <div className="flex items-center gap-4">
              <Link href="/sources" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition text-zinc-500">
                <ArrowLeft size={18} />
              </Link>
              <div className="border-l border-zinc-200 dark:border-zinc-800 pl-4">
                  <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      {source?.fileName || "Unknown Document"}
                  </h1>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold">{isStreaming ? (analysisStage || "AI Reconstructing Script...") : "Interactive Script"}</span>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {!isStreaming && parsedChunks && (
                 <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-full items-center mr-2">
                     <button 
                        onClick={(e) => { 
                             e.preventDefault();
                             setParsedChunks(""); hasParsed.current = true; if (source) formatTranscriptWithAI(source, 'DIALOGUE');
                        }} 
                        className={`text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${!parsedChunks.includes("[FORMAT: REPORT]") ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
                     >
                        Chat View
                     </button>
                     <button 
                        onClick={(e) => { 
                             e.preventDefault();
                             setParsedChunks(""); hasParsed.current = true; if (source) formatTranscriptWithAI(source, 'REPORT');
                        }} 
                        className={`text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${parsedChunks.includes("[FORMAT: REPORT]") ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
                     >
                        Prose View
                     </button>
                 </div>
              )}
              {isStreaming && <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold animate-pulse leading-none"><Bot size={12}/> Generating...</div>}
          </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth w-full">
         <div className="max-w-4xl mx-auto w-full pb-32">
            {parsedChunks ? (
                parsedChunks.includes("[FORMAT: REPORT]") 
                 ? renderReport(parsedChunks.replace(/\[FORMAT:[^\]]+\]/g, "").trim())
                 : renderDialogue(parsedChunks.replace(/\[FORMAT:[^\]]+\]/g, "").trim())
            ) : (
                <div className="flex flex-col items-center justify-center p-20 text-center opacity-50 mt-10">
                   <Loader2 size={32} className="animate-spin text-zinc-400 mb-6"/>
                   <span className="font-bold text-zinc-600 text-lg mb-2">{analysisStage || "Cognitive Reconstruction Initialized"}</span>
                   <span className="text-sm text-zinc-500 max-w-md mx-auto">{analysisStage === "Analyzing Speakers & Context..." ? "Identifying speakers, context, and structural document type..." : "Classifying document constraints and formatting extraction pipeline..."}</span>
                </div>
            )}
         </div>
      </main>
      
      {/* Visual fade block at bottom */}
      <div className="h-16 bg-gradient-to-t from-zinc-50 dark:from-zinc-950 to-transparent fixed bottom-0 left-0 right-0 pointer-events-none z-10"/>
    </div>
  );
}
