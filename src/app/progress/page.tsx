"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Activity, Info, TrendingUp, Sparkles, Target, Compass, Edit3, MessageSquare, Star, ChevronLeft, ChevronRight, XCircle, Library } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { fetchHighFidelityStories, fetchLegacyInsights } from "@/lib/firebase/db";
import { HighFidelityStory } from "@/lib/rag";
import { computeCentroidMath, RECOGNIZED_ERAS, LABELS } from "@/lib/math";
import ReactMarkdown from "react-markdown";

// SVG Geometry for Hexagon
const size = 300;
const center = size / 2;
const maxRadius = 100;
const angles = LABELS.map((_, i) => (Math.PI * 2 * i) / LABELS.length - Math.PI / 2);
const webLevels = [0.2, 0.4, 0.6, 0.8, 1];
const getPoint = (angle: number, length: number) => ({
  x: center + Math.cos(angle) * length,
  y: center + Math.sin(angle) * length
});

export default function ProgressPage() {
  const { user, loading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);
  
  const startScroll = (dir: 'left' | 'right') => {
    if (scrollInterval.current) clearInterval(scrollInterval.current);
    scrollInterval.current = setInterval(() => {
       if (scrollRef.current) {
          scrollRef.current.scrollBy({ left: dir === 'left' ? -5 : 5, behavior: 'auto' });
       }
    }, 16);
  };

  const stopScroll = () => {
    if (scrollInterval.current) {
       clearInterval(scrollInterval.current);
       scrollInterval.current = null;
    }
  };
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [storiesSet, setStoriesSet] = useState<HighFidelityStory[]>([]);
  const [precompiledInsights, setPrecompiledInsights] = useState<any>(null);

  const [lifeCoverage, setLifeCoverage] = useState([
    { era: "Childhood (0-12)", key: "Childhood", mapped: 0, count: 0 },
    { era: "Teens (13-19)", key: "Teens", mapped: 0, count: 0 },
    { era: "Twenties", key: "Twenties", mapped: 0, count: 0 },
    { era: "Thirties", key: "Thirties", mapped: 0, count: 0 },
    { era: "Forties", key: "Forties", mapped: 0, count: 0 },
    { era: "Fifties+", key: "Fifties+", mapped: 0, count: 0 },
  ]);

  // Hexagon Dynamics
  const [activeEraIdx, setActiveEraIdx] = useState<number>(0);
  const [polygonPoints, setPolygonPoints] = useState<string>("");
  const [dataPoints, setDataPoints] = useState<{x:number, y:number}[]>([]);
  const [lowestCategory, setLowestCategory] = useState("Realistic");

  // Identities
  const [activeArchetype, setActiveArchetype] = useState<any>(null);
  const [driftInsight, setDriftInsight] = useState<string | null>(null);
  const [isStudyOpen, setIsStudyOpen] = useState(false);

  const deepDive = precompiledInsights?.deepDive;

  useEffect(() => {
    async function loadAnalytics() {
      if (!user) return;
      try {
        const [stories, insights] = await Promise.all([
           fetchHighFidelityStories(user.uid),
           fetchLegacyInsights(user.uid)
        ]);
        
        setStoriesSet(stories);
        setPrecompiledInsights(insights);

        // Map Module 1 Coverage
        const newCoverage = [
          { era: "Childhood (0-12)", key: "Childhood", mapped: 0, count: 0 },
          { era: "Teens (13-19)", key: "Teens", mapped: 0, count: 0 },
          { era: "Twenties", key: "Twenties", mapped: 0, count: 0 },
          { era: "Thirties", key: "Thirties", mapped: 0, count: 0 },
          { era: "Forties", key: "Forties", mapped: 0, count: 0 },
          { era: "Fifties+", key: "Fifties+", mapped: 0, count: 0 },
        ];
        
        let totalCount = 0;
        stories.forEach(s => {
           if (s.era !== "Timeless") {
             const track = newCoverage.find(c => c.key === s.era || c.era.startsWith(s.era));
             if (track) { track.count += 1; totalCount += 1; }
           }
        });
        if (totalCount > 0) {
           newCoverage.forEach(c => { c.mapped = Math.round((c.count / totalCount) * 100); });
        }
        setLifeCoverage(newCoverage);

        // Compute Base Centroid SVG Points (All Time)
        const globalData = computeCentroidMath(RECOGNIZED_ERAS[0], stories);
        const dPts = globalData.numericalArray.map((val, idx) => getPoint(angles[idx], val * maxRadius));
        setPolygonPoints(dPts.map(p => `${p.x},${p.y}`).join(" "));
        setDataPoints(dPts);
        setLowestCategory(globalData.lowestCat);

        // Map Global Identity from Compiled Insights if available
        if (insights && insights.allTime) {
           setActiveArchetype(insights.allTime);
        } else {
           setActiveArchetype(globalData.archetype); // fallback without context
        }

      } catch(e) {
        console.error("Initiation error:", e);
      } finally {
        setIsInitializing(false);
      }
    }
    loadAnalytics();
  }, [user]);

  async function handleEraClick(idx: number) {
     if (idx === activeEraIdx) return;
     setActiveEraIdx(idx);
     const eraObj = RECOGNIZED_ERAS[idx];
     
     // Morph the Hexagon Math visually
     const cData = computeCentroidMath(eraObj, storiesSet);
     const dPts = cData.numericalArray.map((val, idx) => getPoint(angles[idx], val * maxRadius));
     setPolygonPoints(dPts.map(p => `${p.x},${p.y}`).join(" "));
     setDataPoints(dPts);
     
     // Map texts
     if (idx === 0) {
        setDriftInsight(null);
        setActiveArchetype(precompiledInsights?.allTime || cData.archetype);
     } else {
        const compiledEra = precompiledInsights?.eras?.[eraObj.key];
        if (compiledEra) {
           setActiveArchetype(compiledEra);
           setDriftInsight(compiledEra.driftInsight);
        } else {
           setActiveArchetype(cData.archetype);
           setDriftInsight(null);
        }
     }
  }

  if (loading || isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F6F5F0] dark:bg-zinc-950"><Sparkles className="animate-spin text-blue-500" /></div>;
  }
  if (!user) return <div className="min-h-screen bg-[#F6F5F0] dark:bg-zinc-950 px-4"><LoginModule /></div>;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 font-sans p-6 md:p-12 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        {/* Header Block */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-8 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest text-xs">
            <Activity size={14} /> Legacy Progress
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
            Building Your Monument
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl">
            You aren't taking a test. You are mapping a life. Discover the areas of your narrative that shine the brightest, and uncover the gaps waiting for a story.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Module 1: Life Coverage Timeline */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp size={120} />
            </div>

            <h2 className="text-xl font-bold flex items-center gap-2 mb-2 z-10 relative">
              <Compass size={20} className="text-blue-500"/> Life Coverage
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 z-10 relative max-w-sm">
              Visualizing the density of your archived stories across chronological eras based on AI extraction.
            </p>

            <div className="space-y-6 z-10 relative">
              {lifeCoverage.map((era, idx) => (
                <div key={idx} className="relative">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{era.era}</span>
                    <span className="text-xs font-medium text-zinc-500">{era.count} {era.count === 1 ? 'story' : 'stories'} ({era.mapped}%)</span>
                  </div>
                  <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${era.mapped}%` }}
                      transition={{ duration: 1, delay: idx * 0.1, ease: "easeOut" }}
                      className={`h-full rounded-full ${era.mapped > 75 ? 'bg-indigo-500' : era.mapped > 30 ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                    />
                  </div>
                  {era.mapped < 30 && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium">
                      <Sparkles size={10} /> A narrative gap waiting to be filled in your {era.era.split(' ')[0]}.
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
               <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 mb-1"><Edit3 size={14} /> Architect Prompt</h3>
               <p className="text-xs text-indigo-700 dark:text-indigo-400/80 leading-relaxed">
                 You have excellent coverage of certain life periods, but others remain largely undocumented in the High-Fidelity cache. 
                 <Link href="/stories" className="font-bold underline underline-offset-2 ml-1 hover:text-indigo-500">Consider uploading stories to map those timelines!</Link>
               </p>
            </div>
            
            
            {deepDive ? (
              <div className={`w-full mt-4 p-5 rounded-3xl border z-10 relative transition-all duration-700 ${isStudyOpen ? 'bg-zinc-900 border-zinc-700 shadow-2xl shadow-zinc-900/50' : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/50 cursor-pointer overflow-hidden group'}`}>
                 {!isStudyOpen ? (
                    <div onClick={() => setIsStudyOpen(true)} className="flex flex-col items-center justify-center text-center py-4">
                       <div className="w-12 h-12 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                          <Sparkles size={20} className="text-zinc-500 dark:text-zinc-400" />
                       </div>
                       <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-widest mb-2">The Architect's Study</h3>
                       <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                          The AI has synthesized a cross-metric paradox examining the friction between your actions and reflections. 
                       </p>
                       <button className="mt-4 px-4 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          Unseal Observation
                       </button>
                    </div>
                 ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                       <div className="flex items-center justify-between mb-4 border-b border-zinc-700 pb-3">
                          <div className="flex items-center gap-2 text-zinc-400 text-[10px] uppercase tracking-widest font-bold">
                             <Target size={12} /> Architect Observation
                          </div>
                          <button onClick={() => setIsStudyOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                             <XCircle size={16} />
                          </button>
                       </div>
                       
                       <h3 className="text-lg font-bold text-white mb-3">
                          {deepDive.title}
                       </h3>
                       <p className="text-sm text-zinc-300 leading-relaxed mb-5 italic border-l-2 border-zinc-600 pl-3">
                          "{deepDive.analysis}"
                       </p>
                       
                       <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                          <p className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1.5">
                             <MessageSquare size={12} /> The Challenge
                          </p>
                          <p className="text-sm text-zinc-200 leading-relaxed font-serif">
                             "{deepDive.prompt}"
                          </p>
                       </div>

                       <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-zinc-500 font-medium tracking-wider uppercase">
                          <span className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700">Dominant: {deepDive.dominantTrait}</span>
                          <span className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700">Friction: Low {deepDive.flaw} Score</span>
                       </div>
                    </div>
                 )}
              </div>
            ) : (
              <div className="w-full mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 z-10 relative">
                 <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 mb-1"><MessageSquare size={14} /> Round Out Your Legacy</h3>
                 <p className="text-xs text-emerald-700 dark:text-emerald-400/80 leading-relaxed">
                   The AI notes your <span className="font-bold">{lowestCategory}</span> dimension is structurally your smallest mapped node overall. <br/><br/>
                   Can you drop a story into the archive about a time you engaged heavily with the {lowestCategory} side of life? <Link href="/stories" className="font-bold hover:text-emerald-500 underline underline-offset-2">Go to Archive</Link>
                 </p>
              </div>
            )}
          </div>

          {/* Module 2: The Morphing Hexagon */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col items-center">
            
            <div className="w-full">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                <Target size={20} className="text-emerald-500"/> Narrative Archetypes
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                Themes computed and dynamically synced from your Story Archive using the Holland Codes framework. Expand your hexagon by sharing different dimensions of your personality.
              </p>
            </div>

            <div className="relative w-full flex justify-center py-6 mt-4">
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
                {webLevels.map((level, idx) => {
                  const pts = angles.map(a => `${getPoint(a, level * maxRadius).x},${getPoint(a, level * maxRadius).y}`).join(" ");
                  return (
                    <polygon 
                      key={idx} points={pts} fill="none" stroke="currentColor" 
                      className="text-zinc-200 dark:text-zinc-800" strokeWidth={1} 
                    />
                  );
                })}
                
                {angles.map((a, idx) => (
                  <line 
                    key={idx} x1={center} y1={center} x2={getPoint(a, maxRadius).x} y2={getPoint(a, maxRadius).y} 
                    stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth={1}
                  />
                ))}

                <motion.polygon 
                  initial={{ points: angles.map(a => `${center},${center}`).join(" ") }}
                  animate={{ points: polygonPoints }}
                  transition={{ duration: 0.6, type: "spring", bounce: 0.25 }}
                  fill="rgba(16, 185, 129, 0.2)"
                  stroke="#10b981" strokeWidth={3} strokeLinejoin="round"
                />

                {dataPoints.map((p, idx) => (
                  <motion.circle 
                    key={idx}
                    initial={{ cx: center, cy: center }}
                    animate={{ cx: p.x, cy: p.y }}
                    transition={{ duration: 0.6, type: "spring", bounce: 0.25 }}
                    r={5}
                    className="fill-white dark:fill-zinc-900 stroke-emerald-500 stroke-[3px]"
                    style={{ filter: "drop-shadow(0px 2px 4px rgba(16, 185, 129, 0.3))" }}
                  />
                ))}

                {LABELS.map((label, idx) => {
                  const p = getPoint(angles[idx], maxRadius + 30);
                  let anchor: "start" | "middle" | "end" = "middle";
                  if (p.x > center + 10) anchor = "start";
                  if (p.x < center - 10) anchor = "end";
                  return (
                    <text 
                      key={label} x={p.x} y={p.y} textAnchor={anchor} alignmentBaseline="middle"
                      className="text-[10px] font-bold fill-zinc-600 dark:fill-zinc-400 tracking-wider uppercase"
                    >
                      {label}
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* Sub-Timeline Controls */}
            <div className="w-full mt-4 flex items-center gap-1">
              <button 
                 onMouseEnter={() => startScroll('left')} 
                 onMouseLeave={stopScroll}
                 onMouseUp={stopScroll}
                 className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors flex-shrink-0 cursor-pointer"
              >
                 <ChevronLeft size={20} />
              </button>

              <div 
                ref={scrollRef}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 shadow-inner overflow-x-auto no-scrollbar flex flex-nowrap items-center gap-2 relative"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                 {RECOGNIZED_ERAS.map((era, i) => (
                    <button
                      key={i}
                      onClick={() => handleEraClick(i)}
                      className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold tracking-widest uppercase transition-all flex-shrink-0 ${activeEraIdx === i ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}
                    >
                      {era.key}
                    </button>
                 ))}
              </div>

              <button 
                 onMouseEnter={() => startScroll('right')} 
                 onMouseLeave={stopScroll}
                 onMouseUp={stopScroll}
                 className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors flex-shrink-0 cursor-pointer"
              >
                 <ChevronRight size={20} />
              </button>
            </div>

            {/* Narrative Archetype Descriptions */}
            {activeArchetype && (
              <div className="w-full mt-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl p-6 border border-indigo-100 dark:border-indigo-800/30 shadow-md transition-all">
                <div className="flex items-center gap-2 bg-indigo-100 dark:bg-indigo-800/30 px-3 py-1 rounded-full text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-widest w-max mb-4">
                  <Star size={12} className={activeEraIdx === 0 ? "text-amber-500" : "text-indigo-500"} />
                  {activeEraIdx === 0 ? "All-Time Legacy Identity" : `${RECOGNIZED_ERAS[activeEraIdx].key} Era Identity`}
                </div>
                
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={`arch-block-${activeEraIdx}-${activeArchetype.title}`}
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
                    className="w-full"
                  >
                    <h2 className="text-2xl md:text-3xl font-black text-indigo-900 dark:text-indigo-100 mb-4 text-center md:text-left">
                      {activeArchetype.title}
                    </h2>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="p-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                         <span className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">Primary Flow</span>
                         <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">{activeArchetype.primaryRiasec}</span>
                       </div>
                       <div className="p-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                         <span className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">Secondary Flow</span>
                         <span className="font-bold text-indigo-500/80 dark:text-indigo-300/80 text-lg">{activeArchetype.secondaryRiasec}</span>
                       </div>
                    </div>

                    {activeEraIdx === 0 ? (
                      <div className="min-h-[4rem]">
                        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                           {activeArchetype.context ? `"${activeArchetype.context}"` : (
                              <span>
                                Please <Link href="/stories" className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 font-bold hover:text-indigo-500">run the Archive Compiler</Link> to generate your summary analysis.
                              </span>
                           )}
                        </p>
                      </div>
                    ) : (
                      <div className="min-h-[4rem] relative overflow-hidden">
                        {driftInsight ? (
                           <div className="mt-4 pt-4 border-t border-indigo-200 dark:border-indigo-800/50">
                             <div className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed border-l-2 border-indigo-400 pl-3">
                               <ReactMarkdown 
                                 components={{
                                   h4: ({node, ...props}: any) => <h4 className="text-base text-indigo-900 dark:text-indigo-300 font-bold mt-5 mb-2" {...props} />,
                                   p: ({node, ...props}: any) => <p className="mb-3 leading-relaxed" {...props} />,
                                   ul: ({node, ...props}: any) => <ul className="list-disc pl-5 my-3 space-y-1" {...props} />,
                                   li: ({node, ...props}: any) => <li className="" {...props} />,
                                   strong: ({node, ...props}: any) => <strong className="font-bold text-indigo-950 dark:text-indigo-200" {...props} />,
                                   blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-indigo-500 pl-4 py-2 my-4 bg-indigo-50 dark:bg-indigo-950/40 font-medium text-indigo-800 dark:text-indigo-300 shadow-sm rounded-r-md" {...props} />,
                                   hr: ({node, ...props}: any) => <hr className="my-5 border-indigo-200 dark:border-indigo-800/60" {...props} />
                                 }}
                               >
                                 {driftInsight}
                               </ReactMarkdown>
                             </div>
                           </div>
                        ) : (
                           <div className="mt-4 pt-4 border-t border-indigo-200 dark:border-indigo-800/50">
                              <p className="text-sm text-indigo-900/60 dark:text-indigo-200/50 font-medium leading-relaxed italic border-l-2 border-indigo-400/50 pl-3">
                                 The Oracle has not generated an insight for this explicitly. <Link href="/stories" className="underline underline-offset-2 hover:text-indigo-500 dark:hover:text-indigo-300">Run the Archivist</Link> to generate.
                              </p>
                           </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

              </div>
            )}

          </div>
        </div>
        
        <div className="bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl p-4 flex flex-col gap-3 text-sm text-zinc-500 mt-8">
          <div className="flex items-start gap-4">
            <Info size={20} className="text-zinc-400 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Live Analytics:</strong> These visualizations are mapped precisely to the mathematical tags outputted dynamically by the Archivist AI when you compile your transcripts.
            </p>
          </div>
          <Link href="/stories" className="mt-2 w-full flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm transition font-semibold">
            <Library size={18} />
            Return to High Fidelity Stories
          </Link>
        </div>

      </div>
    </div>
  );
}
