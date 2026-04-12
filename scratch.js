const fs = require('fs');

const code = `"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Activity, Info, Sparkles, Edit3, MessageSquare, Star, Waves } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { fetchHighFidelityStories } from "@/lib/firebase/db";
import { HighFidelityStory } from "@/lib/rag";
import { generateLegacyIdentityAction, generateDriftInsightAction } from "@/app/actions";

const LABELS = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"];
const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#64748b"];
const RECOGNIZED_ERAS = [
  { key: "Childhood", label: "Childhood (0-12)" },
  { key: "Teens", label: "Teens (13-19)" },
  { key: "Twenties", label: "Twenties" },
  { key: "Thirties", label: "Thirties" },
  { key: "Forties", label: "Forties" },
  { key: "Fifties+", label: "Fifties+" }
];

const ARCHETYPE_MATRIX: Record<string, Record<string, string>> = {
  "Realistic": { "Competence": "The Master Craftsman", "Resilience": "The Survivalist", "Achievement": "The Trailblazer", "Physicality": "The Architect" },
  "Investigative": { "Philosophical": "The Sage", "Self-Awareness": "The Alchemist", "Competence": "The Architect" },
  "Artistic": { "Achievement": "The Visionary", "Relational": "The Muse", "Philosophical": "The Existentialist", "Expression": "The Creator" },
  "Social": { "Relational": "The Bridge-Builder", "Achievement": "The Mentor", "Resilience": "The Healer" },
  "Enterprising": { "Achievement": "The Titan", "Regret": "The Reformed Leader", "Impact": "The Catalyst" },
  "Conventional": { "Resilience": "The Anchor", "Competence": "The Custodian", "Philosophical": "The Moralist", "Stewardship": "The Guardian" }
};

function getArchetypeTitle(topRiasec: string, secondRiasec: string, domExtCat: string) {
  let primaryTitle = ARCHETYPE_MATRIX[topRiasec]?.[domExtCat] || 
    (topRiasec === "Realistic" ? "The Realist" :
     topRiasec === "Investigative" ? "The Analyst" :
     topRiasec === "Artistic" ? "The Creator" :
     topRiasec === "Social" ? "The Empath" :
     topRiasec === "Enterprising" ? "The Catalyst" :
     topRiasec === "Conventional" ? "The Guardian" : "The Pragmatist");
  
  let secondaryTitle = ARCHETYPE_MATRIX[secondRiasec]?.[domExtCat] || "The Seeker";
  const primeNode = primaryTitle.replace(/^The\\s+/i, '');
  const secNode = secondaryTitle.replace(/^The\\s+/i, '');
  return primeNode === secNode ? \`The \${primeNode}\` : \`The \${secNode} \${primeNode}\`;
}

export default function ProgressPage() {
  const { user, loading } = useAuth();
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [storiesSet, setStoriesSet] = useState<HighFidelityStory[]>([]);
  
  // Matrix data for streams
  const [streamMatrix, setStreamMatrix] = useState<number[][]>([]);
  const [totalsMatrix, setTotalsMatrix] = useState<number[]>([]);
  const [coreMemories, setCoreMemories] = useState<Array<{eraIdx: number, valIdx: number, title: string, intensity: number}>>([]);
  
  // Identity
  const [dominantArchetype, setDominantArchetype] = useState<any>(null);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);

  // Drift Analysis
  const [activeEraIdx, setActiveEraIdx] = useState<number | null>(null);
  const [driftInsight, setDriftInsight] = useState<string | null>(null);
  const [isGeneratingDrift, setIsGeneratingDrift] = useState(false);

  useEffect(() => {
    async function loadAnalytics() {
      if (!user) return;
      try {
        const stories = await fetchHighFidelityStories(user.uid);
        setStoriesSet(stories);

        // Calculate Era-based data
        const tempStream: number[][] = [];
        const tempTotals: number[] = [];
        let globalRiasec: Record<string, { sum: number, weights: number }> = { 
          "Realistic": { sum: 0, weights: 0 }, "Investigative": { sum: 0, weights: 0 }, 
          "Artistic": { sum: 0, weights: 0 }, "Social": { sum: 0, weights: 0 }, 
          "Enterprising": { sum: 0, weights: 0 }, "Conventional": { sum: 0, weights: 0 } 
        };
        const extCounts = new Map<string, number>();
        let highestCatCount = 0;
        let domCat = "None";
        const foundCores: any[] = [];

        RECOGNIZED_ERAS.forEach((era, idx) => {
           let eraTotals: Record<string, { sum: number, weights: number }> = { 
             "Realistic": { sum: 0, weights: 0 }, "Investigative": { sum: 0, weights: 0 }, 
             "Artistic": { sum: 0, weights: 0 }, "Social": { sum: 0, weights: 0 }, 
             "Enterprising": { sum: 0, weights: 0 }, "Conventional": { sum: 0, weights: 0 } 
           };

           const eraStories = stories.filter(s => s.era === era.key || s.era === era.label);
           eraStories.forEach(s => {
              const impact = (s as any).impact_metadata;
              const we = impact?.emotional_intensity || 2.5;
              const wc = impact?.narrative_complexity || 2.5;
              const wd = impact?.duration_weight || 1.25;
              const totalW = ((we + wc) / 2) * wd;

              if (we >= 5) {
                 const highestDim = s.psychometrics?.sort((a,b)=>b.val-a.val)[0]?.label || "Realistic";
                 foundCores.push({ eraIdx: idx, valIdx: LABELS.indexOf(highestDim), title: s.title, intensity: we });
              }

              s.psychometrics?.forEach(m => {
                 if (eraTotals[m.label]) {
                    eraTotals[m.label].sum += (m.val * totalW);
                    eraTotals[m.label].weights += totalW;
                    globalRiasec[m.label].sum += (m.val * totalW);
                    globalRiasec[m.label].weights += totalW;
                 }
              });

              if (s.extraction?.present && s.extraction.primaryCategory && s.extraction.primaryCategory !== "None") {
                 const count = (extCounts.get(s.extraction.primaryCategory) || 0) + 1;
                 extCounts.set(s.extraction.primaryCategory, count);
                 if (count > highestCatCount) {
                     highestCatCount = count;
                     domCat = s.extraction.primaryCategory;
                 }
              }
           });

           const eraNumArr = LABELS.map(l => {
              const agg = eraTotals[l];
              return agg.weights > 0 ? (agg.sum / agg.weights) : 0.05; // Base trickle
           });
           
           tempStream.push(eraNumArr);
           tempTotals.push(eraNumArr.reduce((a,b)=>a+b, 0));
        });

        setStreamMatrix(tempStream);
        setTotalsMatrix(tempTotals);
        setCoreMemories(foundCores);

        // Global Architect
        const sr = [...LABELS].sort((a, b) => {
           const scA = globalRiasec[a].weights > 0 ? (globalRiasec[a].sum / globalRiasec[a].weights) : 0;
           const scB = globalRiasec[b].weights > 0 ? (globalRiasec[b].sum / globalRiasec[b].weights) : 0;
           return scB - scA;
        });
        const archTitle = getArchetypeTitle(sr[0], sr[1], domCat);
        
        const cacheK = \`legacy_arch_\${user.uid}_\${sr[0]}_\${sr[1]}_\${domCat}\`;
        const cachedCtx = localStorage.getItem(cacheK);
        setDominantArchetype({
          primaryRiasec: sr[0], secondaryRiasec: sr[1], title: archTitle, context: cachedCtx || null
        });

        if (!cachedCtx) {
           setIsGeneratingContext(true);
           generateLegacyIdentityAction(sr[0], sr[1], domCat, archTitle).then(ctx => {
              localStorage.setItem(cacheK, ctx);
              setDominantArchetype((prev: any) => ({ ...prev, context: ctx }));
           }).finally(()=>setIsGeneratingContext(false));
        }

      } catch(e) {
        console.error("Init err", e);
      } finally {
        setIsInitializing(false);
      }
    }
    loadAnalytics();
  }, [user]);

  // Handle Drift Generation
  async function handleEraPivot(idx: number) {
    if (activeEraIdx === idx) {
       setActiveEraIdx(null);
       setDriftInsight(null);
       return;
    }
    setActiveEraIdx(idx);
    if (idx === 0) return; // Cannot map drift for the first era out of nothing

    setIsGeneratingDrift(true);
    try {
       const prevKey = RECOGNIZED_ERAS[idx-1];
       const curKey = RECOGNIZED_ERAS[idx];
       
       const s1 = storiesSet.filter(s => s.era === prevKey.key || s.era === prevKey.label);
       const s2 = storiesSet.filter(s => s.era === curKey.key || s.era === curKey.label);
       
       const arr1 = streamMatrix[idx-1];
       const arch1 = getArchetypeTitle(
           LABELS[[...arr1].map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0])[0][1]], 
           LABELS[[...arr1].map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0])[1][1]], 
           "None"
       );
       
       const arr2 = streamMatrix[idx];
       const arch2 = getArchetypeTitle(
           LABELS[[...arr2].map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0])[0][1]], 
           LABELS[[...arr2].map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0])[1][1]], 
           "None"
       );

       const driftTxt = await generateDriftInsightAction(
         prevKey.key, arch1, curKey.key, arch2,
         s1.map(s=>s.title + ": " + s.synopsis).join("\\n").slice(0, 3000),
         s2.map(s=>s.title + ": " + s.synopsis).join("\\n").slice(0, 3000)
       );
       setDriftInsight(driftTxt);
    } catch(e) {
       console.error("Drift map err");
    } finally {
       setIsGeneratingDrift(false);
    }
  }

  // Draw Splines
  const svgWidth = 800;
  const svgHeight = 350;
  const numSteps = RECOGNIZED_ERAS.length;
  const xStep = svgWidth / (numSteps - 1);
  const maxT = Math.max(...totalsMatrix, 0.1);
  const scale = (svgHeight * 0.75) / maxT;

  function generateCurve(pts: {x:number, y:number}[]) {
     if (pts.length === 0) return "";
     let d = \`M \${pts[0].x},\${pts[0].y}\`;
     for (let i = 0; i < pts.length - 1; i++) {
        const cpX = pts[i].x + (pts[i+1].x - pts[i].x) * 0.5;
        d += \` C \${cpX},\${pts[i].y} \${cpX},\${pts[i+1].y} \${pts[i+1].x},\${pts[i+1].y}\`;
     }
     return d;
  }

  const paths: string[] = [];
  const nodeCenters: Array<{x:number, y:number, valIdx:number}> = [];

  for (let k = 0; k < 6; k++) {
     const tPts = [];
     const bPts = [];
     for (let x = 0; x < numSteps; x++) {
        const eVals = streamMatrix[x] || [0.1,0.1,0.1,0.1,0.1,0.1];
        const tot = totalsMatrix[x] || 0.6;
        let lowerSum = 0;
        for (let j=0; j<k; j++) lowerSum += eVals[j];
        
        const yOffset = (svgHeight / 2) - ((tot * scale) / 2);
        const yBottom = yOffset + lowerSum * scale;
        const yTop = yBottom + eVals[k] * scale;
        
        tPts.push({ x: x * xStep, y: yTop });
        bPts.push({ x: x * xStep, y: yBottom });
        
        // Track geometric center for dropping pebbles
        if (x < numSteps) {
            nodeCenters.push({x: x * xStep, y: (yTop + yBottom)/2, valIdx: k});
        }
     }
     const tStr = generateCurve(tPts);
     const bStr = generateCurve([...bPts].reverse()).replace("M", "L");
     paths.push(tStr + " " + bStr + " Z");
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

        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-8 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest text-xs">
            <Waves size={14} /> River of Time
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
            Building Your Monument
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl">
            You aren't taking a test. You are mapping a life. Discover the areas of your narrative that shine the brightest along the flowing currents of your personal history.
          </p>
        </div>

        {/* Narrative Flow Grid */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-2 z-10 relative">
            <Compass size={20} className="text-emerald-500"/> The Legacy Stream
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 z-10 relative">
            Interact with your timeline. The thickness of each current represents the psychological impact of verified stories within that era. Glowing pebbles represent Core Memories. Click an era to unearth a Drift Insight.
          </p>

          <div className="overflow-x-auto w-full pb-4">
            <div className="min-w-[700px] relative">
              <svg width="100%" height={svgHeight} viewBox={\`0 0 \${svgWidth} \${svgHeight}\`} preserveAspectRatio="none" className="overflow-visible">
                 {paths.map((p, k) => (
                    <motion.path
                       key={k}
                       initial={{ opacity: 0, pathLength: 0 }}
                       animate={{ opacity: 1, pathLength: 1 }}
                       transition={{ duration: 1.5, delay: k*0.1 }}
                       d={p}
                       fill={COLORS[k]}
                       fillOpacity={0.15}
                       stroke={COLORS[k]}
                       strokeWidth={1.5}
                    />
                 ))}
                 
                 {/* Core Memories / Pebbles */}
                 {coreMemories.map((cm, idx) => {
                    const centerPt = nodeCenters.find(nc => nc.eraIdx === cm.eraIdx && nc.valIdx === cm.valIdx);
                    if (!centerPt) return null;
                    return (
                        <motion.circle 
                          key={idx}
                          initial={{ r: 0, opacity: 0 }}
                          animate={{ r: 6, opacity: 1 }}
                          transition={{ delay: 1.5 + idx*0.1, type: "spring" }}
                          cx={centerPt.x} cy={centerPt.y}
                          className="fill-amber-400 stroke-white dark:stroke-zinc-900 border-2"
                          strokeWidth={2}
                          style={{ filter: "drop-shadow(0px 0px 8px rgba(251, 191, 36, 0.8))" }}
                        />
                    );
                 })}
              </svg>

              {/* Era Clickable Chips */}
              <div className="flex justify-between items-center w-full mt-4 absolute left-0 right-0 px-2" style={{ top: \`\${svgHeight}px\`}}>
                 {RECOGNIZED_ERAS.map((era, idx) => (
                    <button 
                      key={era.key}
                      onClick={() => handleEraPivot(idx)}
                      className={\`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all \${activeEraIdx === idx ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 -translate-y-1' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}\`}
                      style={{ transform: \`translateX(-50%)\`, position: 'absolute', left: \`\${(idx * xStep / svgWidth) * 100}%\` }}
                    >
                      {era.key}
                    </button>
                 ))}
              </div>
            </div>
          </div>
          
          <div className="mt-16 w-full min-h-[4rem]">
             <AnimatePresence mode="wait">
               {activeEraIdx !== null && activeEraIdx > 0 && (
                 <motion.div 
                   key={activeEraIdx}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-inner block w-full"
                 >
                    <div className="flex items-center gap-2 mb-3">
                       <Waves size={16} className="text-indigo-500" />
                       <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                          Navigational Drift: Transitioning into your {RECOGNIZED_ERAS[activeEraIdx].key}
                       </h3>
                    </div>
                    {isGeneratingDrift ? (
                       <div className="text-sm text-indigo-500/80 dark:text-indigo-400 flex items-center gap-2 animate-pulse">
                         <Sparkles size={14} className="animate-spin text-amber-500"/>
                         The AI is scanning your verified stories to explain this temporal shift...
                       </div>
                    ) : driftInsight ? (
                       <p className="text-sm md:text-base leading-relaxed text-indigo-950 dark:text-indigo-100 font-serif border-l-2 border-indigo-400 pl-4">{driftInsight}</p>
                    ) : (
                       <p className="text-sm text-zinc-500">No pivot data detected.</p>
                    )}
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
        </div>

        {/* Narrative Archetype Descriptions */}
        {dominantArchetype && (
          <div className="w-full mt-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl p-6 md:p-8 border border-indigo-100 dark:border-indigo-800/30 shadow-md">
            <div className="flex items-center gap-2 bg-indigo-100 dark:bg-indigo-800/30 px-3 py-1 rounded-full text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-widest w-max mb-4">
              <Star size={12} className="text-amber-500" />
              All-Time Legacy Identity
            </div>
            
            <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 via-indigo-700 to-indigo-900 dark:from-indigo-200 dark:via-indigo-100 dark:to-indigo-300 mb-4 text-center md:text-left">
              {dominantArchetype.title}
            </h2>
            
            <div className="min-h-[4rem] mb-6">
              {isGeneratingContext ? (
                <div className="flex items-center gap-3 text-indigo-500/70 dark:text-indigo-400/70">
                  <Sparkles size={16} className="animate-spin text-amber-500" />
                  <span className="text-sm font-medium animate-pulse">Consulting the Oracle to synthesize your archetype...</span>
                </div>
              ) : (
                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium md:text-lg"
                >
                  "{dominantArchetype.context}"
                </motion.p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 bg-white dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 flex flex-col justify-center items-center text-center">
                 <span className="block text-xs uppercase font-bold text-zinc-500 tracking-widest mb-1 shadow-xs">Dominant Depth Flow</span>
                 <span className="font-black text-indigo-600 dark:text-indigo-400 text-xl md:text-2xl">{dominantArchetype.primaryRiasec}</span>
               </div>
               <div className="p-4 bg-white dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 flex flex-col justify-center items-center text-center">
                 <span className="block text-xs uppercase font-bold text-zinc-500 tracking-widest mb-1 shadow-xs">Supporting Current</span>
                 <span className="font-bold text-indigo-500/80 dark:text-indigo-300/80 text-xl md:text-2xl">{dominantArchetype.secondaryRiasec}</span>
               </div>
            </div>
          </div>
        )}

        {/* Link to Compiled Stories */}
        <div className="flex justify-center pt-8 border-t border-zinc-200 dark:border-zinc-800 mt-8">
          <Link href="/stories" className="group flex items-center justify-between gap-4 p-5 md:px-8 md:py-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-3xl w-full shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-1">
             <div>
               <h3 className="text-lg md:text-xl font-bold flex items-center gap-2">Deep Dive: High-Fidelity Stories</h3>
               <p className="text-indigo-100 text-sm mt-1">Review the AI timeline breakdowns and run the Compiler.</p>
             </div>
             <div className="w-12 h-12 rounded-full border border-indigo-400/50 flex items-center justify-center group-hover:bg-white/10 transition-colors flex-shrink-0">
               <ArrowRight size={24} />
             </div>
          </Link>
        </div>

      </div>
    </div>
  );
}
`

fs.writeFileSync('/Users/leiaway/Antigravity/Legacy Nexus/src/app/progress/page.tsx', code);
console.log("Successfully rebuilt page.tsx");
