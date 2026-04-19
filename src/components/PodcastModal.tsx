"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, Play, Square, Loader2, Save, FileAudio, RefreshCw, AudioLines } from "lucide-react";
import { generatePodcastTranscriptAction } from "@/app/actions";
import { AudioPodcast, fetchAudioPodcasts, saveAudioPodcast, fetchUserSources } from "@/lib/mongo/db";

interface PodcastModalProps {
  userId: string;
  onClose: () => void;
}

export function PodcastModal({ userId, onClose }: PodcastModalProps) {
  const [podcasts, setPodcasts] = useState<AudioPodcast[]>([]);
  const [activePodcast, setActivePodcast] = useState<AudioPodcast | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [focusArea, setFocusArea] = useState("");
  const [durationOption, setDurationOption] = useState("Short (~3-5 mins)");
  
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
    }
    loadExistingPodcasts();
    return () => {
      // Cleanup synth
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  const loadExistingPodcasts = async () => {
    const list = await fetchAudioPodcasts(userId);
    setPodcasts(list);
  };

  const handleGenerate = async () => {
    if (!focusArea.trim()) return;
    setIsGenerating(true);
    
    try {
      // 1. Fetch sources to build context
      const sources = await fetchUserSources(userId);
      const context = sources.map(s => s.textContent).join("\n\n").substring(0, 80000); // 80k character limit heuristic
      
      // 2. Generate transcript
      const transcript = await generatePodcastTranscriptAction(context, focusArea, durationOption);
      
      if (transcript && transcript.length > 0) {
        // 3. Save to DB
        const newPodcast: Omit<AudioPodcast, 'id' | 'createdAt' | 'userId'> = {
          title: `Deep Dive: ${focusArea}`,
          subject: focusArea,
          durationOption,
          transcript
        };
        const savedPodcast = await saveAudioPodcast(userId, newPodcast);
        
        if (savedPodcast) {
          setPodcasts(prev => [savedPodcast, ...prev]);
          setActivePodcast(savedPodcast);
          setFocusArea("");
        }
      } else {
        alert("Failed to generate dialogue. Check the console.");
      }
    } catch (e) {
      console.error(e);
      alert("Error generating podcast.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- Playback Engine ----
  
  const getVoices = () => {
    if (!synthRef.current) return { host1: null, host2: null };
    const voices = synthRef.current.getVoices();
    // Try to pick two distinct english voices
    const engVoices = voices.filter(v => v.lang.startsWith('en'));
    // Usually Google US English, Apple Samantha, etc.
    const host1 = engVoices.find(v => v.name.includes("Male") || v.name.includes("Daniel") || v.name.includes("David")) || engVoices[0];
    const host2 = engVoices.find(v => (v.name.includes("Female") || v.name.includes("Samantha") || v.name.includes("Zira")) && v !== host1) || engVoices[1] || engVoices[0];
    return { host1, host2 };
  };

  const playLine = (index: number) => {
    if (!activePodcast || !synthRef.current) return;
    if (index >= activePodcast.transcript.length) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentLineIndex(-1);
      return;
    }

    setCurrentLineIndex(index);
    const line = activePodcast.transcript[index];
    const utterance = new SpeechSynthesisUtterance(line.text);
    
    const { host1, host2 } = getVoices();
    
    if (line.speaker === "Host 1" && host1) {
      utterance.voice = host1;
      // utterance.pitch = 0.9;
    } else if (line.speaker === "Host 2" && host2) {
      utterance.voice = host2;
      // utterance.pitch = 1.1;
    }

    utterance.rate = 1.05; // Slightly faster for podcast vibe
    
    utterance.onend = () => {
      // Proceed to next line ONLY if still playing (wasn't stopped manually)
      if (isPlayingRef.current) {
         playLine(index + 1);
      }
    };
    
    synthRef.current.speak(utterance);
  };

  const togglePlayback = () => {
    if (!activePodcast) return;
    if (isPlaying) {
      synthRef.current?.cancel();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      // Start from beginning or resume from current index
      playLine(Math.max(0, currentLineIndex));
    }
  };
  
  useEffect(() => {
     if (synthRef.current) synthRef.current.cancel();
     setIsPlaying(false);
     isPlayingRef.current = false;
     setCurrentLineIndex(-1);
  }, [activePodcast]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-5xl h-[85vh] bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl flex overflow-hidden border border-zinc-200 dark:border-zinc-800"
      >
         {/* Left Sidebar - Library & Generator Setup */}
         <div className="w-[30%] bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
               <h2 className="font-bold text-lg flex items-center gap-2"><AudioLines className="text-blue-500" /> Audio Overview</h2>
               <p className="text-xs text-zinc-500 mt-1">Generate dynamic deep-dive podcasts from your legacy archive.</p>
            </div>
            
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
               <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 block">New Deep Dive Topic</label>
               <input 
                  type="text"
                  placeholder="e.g. Early career struggles..."
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-lg px-3 py-2 text-sm mb-3"
                  value={focusArea}
                  onChange={e => setFocusArea(e.target.value)}
               />
               
               <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 block">Duration</label>
               <select 
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-lg px-3 py-2 text-sm mb-4"
                  value={durationOption}
                  onChange={e => setDurationOption(e.target.value)}
               >
                  <option>Short (~3-5 mins)</option>
                  <option>Long (~10-15 mins)</option>
               </select>

               <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !focusArea.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm py-2 rounded-lg flex items-center justify-center gap-2 transition"
               >
                  {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  {isGenerating ? "Synthesizing Script..." : "Generate Podcast"}
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
               <div className="text-[10px] uppercase font-bold text-zinc-400 p-2">Library</div>
               {podcasts.length === 0 ? (
                  <div className="text-xs text-zinc-500 p-2 text-center italic">No podcasts generated yet.</div>
               ) : (
                  podcasts.map(p => (
                     <div 
                        key={p.id}
                        onClick={() => setActivePodcast(p)}
                        className={`p-3 rounded-lg cursor-pointer transition ${activePodcast?.id === p.id ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                     >
                        <div className="font-semibold text-sm truncate">{p.title}</div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 flex justify-between">
                           <span>{p.durationOption.split(' ')[0]}</span>
                           <span>{new Date(p.createdAt?.seconds ? p.createdAt.seconds * 1000 : p.createdAt).toLocaleDateString()}</span>
                        </div>
                     </div>
                  ))
               )}
            </div>
         </div>

         {/* Right Main Pane - Playback */}
         <div className="flex-1 flex flex-col relative h-full bg-white dark:bg-zinc-950">
            <button onClick={onClose} className="absolute right-4 top-4 p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-full z-10 transition">
               <X size={16} />
            </button>

            {activePodcast ? (
               <div className="flex flex-col h-full">
                  <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-end justify-between shrink-0">
                     <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-2 block">Now Playing</span>
                        <h1 className="text-3xl font-black">{activePodcast.title}</h1>
                     </div>
                     <button 
                        onClick={togglePlayback}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-lg ${isPlaying ? 'bg-zinc-900 text-white dark:bg-white dark:text-black hover:scale-95' : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105'}`}
                     >
                        {isPlaying ? <Square size={20} className="fill-current" /> : <Play size={24} className="fill-current ml-1" />}
                     </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-6">
                     {activePodcast.transcript.map((line, idx) => {
                        const isActiveLine = currentLineIndex === idx;
                        const isHost1 = line.speaker === "Host 1";
                        return (
                           <div 
                              key={idx} 
                              onClick={() => {
                                 setCurrentLineIndex(idx);
                                 synthRef.current?.cancel();
                                 setIsPlaying(true);
                                 isPlayingRef.current = true;
                                 playLine(idx);
                              }}
                              className={`flex gap-4 p-4 rounded-xl transition cursor-pointer ${isActiveLine ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}
                           >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isHost1 ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                 {isHost1 ? 'H1' : 'H2'}
                              </div>
                              <div className="flex flex-col">
                                 <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isHost1 ? 'text-amber-600' : 'text-indigo-600'}`}>{line.speaker}</span>
                                 <p className={`text-base leading-relaxed ${isActiveLine ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                    {line.text}
                                 </p>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 p-8 text-center">
                  <AudioLines size={48} className="mb-4 text-zinc-200 dark:text-zinc-800" />
                  <h3 className="text-xl font-bold text-zinc-600 dark:text-zinc-300">No Audio Selected</h3>
                  <p className="text-sm max-w-sm mt-2">Generate a new deep dive podcast using the panel on the left, or select an existing one from the library.</p>
               </div>
            )}
         </div>
      </motion.div>
    </div>
  );
}
