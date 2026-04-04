"use client";

import { useState } from "react";
import { processTranscriptAction, generateQuestionsAction } from "./actions";
import { type TranscriptChunk } from "@/lib/rag";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, BrainCircuit, User, Search, BookOpen, MessageSquare, MapPin } from "lucide-react";

const DEFAULT_ALBERT_STORY = `During my childhood in the 1930s, we didn't have much. I remember finding hiding spots near the old crates around the railyard. It was a time of immense imagination and resilience. Later, in the 1940s, the American twist came for all of us. I ended up spending time working at the Lawrence Radiation Lab, dealing with wartime rationing and strict protocols. In the 1950s, I joined P&G where they were implementing Theory Y management styles, acting in the social and corporate world to change the old guard. Finally, at Frito-Lay, I faced the utmost challenge dealing with the traditionalists and finding my place as an engineer in a changing world.`;

export default function Home() {
  const [transcript, setTranscript] = useState(DEFAULT_ALBERT_STORY);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterviewerThinking, setIsInterviewerThinking] = useState(false);

  const handleProcess = async () => {
    if (!transcript) return;
    setIsProcessing(true);
    setChunks([]);
    setQuestions([]);

    try {
      // 1. Process Transcript
      const newChunks = await processTranscriptAction(transcript);
      setChunks(newChunks);

      if (newChunks.length > 0) {
        setIsInterviewerThinking(true);
        // 2. Generate Interview Questions based on the processed story
        const summaryContext = newChunks.map((c) => c.text).join(" ");
        const newQs = await generateQuestionsAction(summaryContext);
        setQuestions(newQs);
        setIsInterviewerThinking(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F5F0] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans selection:bg-blue-200 dark:selection:bg-blue-900">
      {/* Brand Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xl">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-1.5 rounded-lg">
            <span className="font-extrabold font-serif text-blue-600 dark:text-blue-400 leading-none">N</span>
          </div>
          Narrative Nexus
        </div>
        <nav className="hidden md:flex gap-8 font-medium text-sm text-zinc-600 dark:text-zinc-400">
          <a href="#" className="flex items-center gap-2 hover:text-blue-600 transition-colors"><Search size={16}/> Search</a>
          <a href="#" className="flex items-center gap-2 hover:text-blue-600 transition-colors"><BookOpen size={16}/> My Vault</a>
          <a href="#" className="flex items-center gap-2 hover:text-blue-600 transition-colors"><BrainCircuit size={16}/> Learn</a>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (Identity & Timeline) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Identity Snapshot */}
          <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 flex items-center gap-6">
            <div className="h-24 w-24 flex-shrink-0 bg-blue-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border-4 border-white dark:border-zinc-900 shadow-sm relative overflow-hidden">
               <User size={40} className="text-blue-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Albert, Legacy Keeper</h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> 
                RIASEC: Investigative / Conventional
              </p>
              <p className="text-zinc-600 dark:text-zinc-300 italic pt-2 font-medium">
                "Doing what is right, even when it's not easiest"
              </p>
            </div>
          </section>

          {/* Transcript Config Box (For Testing) */}
          <section className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm p-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <div className="flex justify-between items-end mb-2">
              <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                Raw Transcript Sandbox
              </h2>
            </div>
            <textarea
              className="w-full h-32 p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm mb-3 focus:ring-2 ring-blue-500 outline-none resize-none transition-all"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste legacy transcript here..."
            />
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Sparkles className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {isProcessing ? "Processing..." : "Process Transcript with Gen AI"}
            </button>
          </section>

          {/* The Story Timeline */}
          <section className="relative">
            {/* Timeline Line */}
            {chunks.length > 0 && (
               <div className="absolute left-6 top-4 bottom-4 w-px bg-zinc-300 dark:bg-zinc-800 z-0"></div>
            )}
            
            <div className="space-y-6 relative z-10">
              <AnimatePresence>
                {chunks.map((chunk, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20, y: 10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{ delay: index * 0.2 }}
                    className="flex gap-4"
                  >
                    {/* Timeline Node */}
                    <div className="flex-shrink-0 mt-5 w-12 flex justify-center">
                       <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_0_4px_rgba(59,130,246,0.2)] dark:shadow-[0_0_0_4px_rgba(59,130,246,0.1)]"></div>
                    </div>
                    {/* Card */}
                    <div className="flex-1 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow group">
                      <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed text-[15px]">
                        {chunk.text}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {chunk.wisdomTags.map((tag, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {chunks.length === 0 && !isProcessing && (
                <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl">
                  Processed timeline cards will appear here.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column (Map Placeholder & Conversation AI) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Interactive Map Placeholder */}
          <section className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm aspect-video flex flex-col items-center justify-center text-zinc-400 relative overflow-hidden group">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 dark:opacity-5"></div>
            <MapPin className="mb-2 text-zinc-300 dark:text-zinc-700 group-hover:scale-110 transition-transform" size={32} />
            <p className="text-sm font-medium z-10">Interactive Map Nodes</p>
          </section>

          {/* Ad Space Placeholder */}
          <section className="bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center h-48">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">Premium Skyscraper UNIT</p>
            <p className="text-[10px] text-zinc-500">Contextually Tuned Ads Space</p>
          </section>

          {/* Conversation AI Sandbox */}
          <section className="sticky top-24 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col">
            <div className="bg-blue-600 px-4 py-3 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 font-medium text-sm">
                <MessageSquare size={16} /> Conversation AI
              </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col gap-4 bg-zinc-50 dark:bg-zinc-950/50">
              <p className="text-xs text-zinc-500 font-medium">NotebookLM-style chat initialized.</p>
              
              <div className="flex flex-col gap-2">
                <AnimatePresence>
                  {isInterviewerThinking && (
                    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex items-center gap-2 text-xs text-blue-500 py-2">
                      <Sparkles size={14} className="animate-pulse" /> Interviewer is formulating responses...
                    </motion.div>
                  )}
                  {questions.length > 0 && (
                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                      Suggested Interrogations:
                    </div>
                  )}
                  {questions.map((q, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="text-left bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-700 p-3 rounded-xl text-[13px] text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:shadow hover:-translate-y-0.5 leading-relaxed"
                    >
                      {q}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
               <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-950 rounded-full inset-shadow-sm p-1">
                  <input type="text" placeholder="Prompt entry..." className="flex-1 bg-transparent px-3 text-sm outline-none w-full" disabled />
                  <button disabled className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white disabled:opacity-50">
                    <svg className="w-4 h-4 translate-x-[-1px] translate-y-[1px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
               </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
