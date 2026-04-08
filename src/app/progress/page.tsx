"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Activity, Info, TrendingUp, Sparkles, Target, Compass, Edit3, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { fetchHighFidelityStories } from "@/lib/firebase/db";
import { HighFidelityStory } from "@/lib/rag";

export default function ProgressPage() {
  const { user, loading } = useAuth();
  
  const defaultCoverage = [
    { era: "Childhood (0-12)", key: "Childhood", mapped: 0 },
    { era: "Teens (13-19)", key: "Teens", mapped: 0 },
    { era: "Twenties", key: "Twenties", mapped: 0 },
    { era: "Thirties", key: "Thirties", mapped: 0 },
    { era: "Forties", key: "Forties", mapped: 0 },
    { era: "Fifties+", key: "Fifties+", mapped: 0 },
  ];

  const defaultRiasec = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]; // Small base values so graph isn't invisible

  const [lifeCoverage, setLifeCoverage] = useState(defaultCoverage);
  const [riasecValues, setRiasecValues] = useState(defaultRiasec);
  const [isInitializing, setIsInitializing] = useState(true);

  // SVG Geometry for Hexagon
  const size = 300;
  const center = size / 2;
  const maxRadius = 100;

  // Pointy-topped hexagon angles mapping to ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"]
  // R: Top (-90 deg), I: Top-Right (-30 deg), A: Bottom-Right (30 deg), S: Bottom (90 deg), E: Bottom-Left (150 deg), C: Top-Left (210 deg).
  const angles = [-Math.PI/2, -Math.PI/6, Math.PI/6, Math.PI/2, 5*Math.PI/6, 7*Math.PI/6];
  const labels = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"];

  // Helper to calculate coordinates
  const getPoint = (angle: number, radius: number) => {
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle)
    };
  };

  const dataPoints = riasecValues.map((val, i) => getPoint(angles[i], val * maxRadius));
  const polygonPoints = dataPoints.map(p => `${p.x},${p.y}`).join(" ");

  // Background Web Points
  const webLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  useEffect(() => {
    async function loadAnalytics() {
      if (!user) return;
      try {
        const stories = await fetchHighFidelityStories(user.uid);
        if (!stories || stories.length === 0) {
           setIsInitializing(false);
           return;
        }

        // 1. Aggregate Life Coverage DENSITIES
        const coverageMap = new Map<string, number>();
        stories.forEach(s => {
           const k = s.era;
           coverageMap.set(k, (coverageMap.get(k) || 0) + 1);
        });

        const newCoverage = defaultCoverage.map(c => {
           const count = coverageMap.get(c.key) || 0;
           // Roughly map 'count' to percentage completion (e.g. 1 story = 35%, 2 = 70%, 3+ = 100%)
           const pct = Math.min(count * 35, 100);
           return { ...c, mapped: pct };
        });
        setLifeCoverage(newCoverage);

        // 2. Aggregate RIASEC Averaged Values
        // Prompt dictates values between 0 and 100.
        const riasecTotals: Record<string, number> = { "Realistic": 0, "Investigative": 0, "Artistic": 0, "Social": 0, "Enterprising": 0, "Conventional": 0 };
        stories.forEach(s => {
           s.psychometrics?.forEach(metric => {
              if (riasecTotals[metric.label] !== undefined) {
                 riasecTotals[metric.label] += metric.val;
              }
           });
        });

        const numStories = stories.length;
        const newRiasec = labels.map(label => {
           const avg = (riasecTotals[label] || 0) / numStories;
           // Map to a 0.1 to 1.0 scale (0.1 base so graph doesn't vanish entirely)
           return Math.max(0.1, avg / 100);
        });
        
        setRiasecValues(newRiasec);
      } catch(e) {
        console.error("Failed to map progress analytics", e);
      } finally {
        setIsInitializing(false);
      }
    }

    loadAnalytics();
  }, [user]);

  if (loading || isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F6F5F0] dark:bg-zinc-950"><Sparkles className="animate-spin text-blue-500" /></div>;
  }

  if (!user) {
    return <div className="min-h-screen bg-[#F6F5F0] dark:bg-zinc-950 px-4"><LoginModule /></div>;
  }

  // Determine lowest categories for dynamic gamification
  const lowestRIASECIndex = riasecValues.indexOf(Math.min(...riasecValues));
  const lowestCategory = labels[lowestRIASECIndex];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 font-sans p-6 md:p-12 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Navigation */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        {/* Header Block - Monumental Styling */}
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
                    <span className="text-xs font-medium text-zinc-500">{era.mapped}%</span>
                  </div>
                  <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${era.mapped}%` }}
                      transition={{ duration: 1, delay: idx * 0.1, ease: "easeOut" }}
                      className={`h-full rounded-full ${era.mapped > 75 ? 'bg-indigo-500' : era.mapped > 30 ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                    />
                  </div>
                  {/* Gamified prompt for low coverage */}
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
                 You have excellent coverage of certain life periods, but others remain largely undocumented in the High-Fidelity cache. Consider uploading stories or journals to map those missing timelines!
               </p>
            </div>
          </div>

          {/* Module 2: The RIASEC Hexagon */}
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
                {/* Draw Background Web */}
                {webLevels.map((level, idx) => {
                  const pts = angles.map(a => `${getPoint(a, level * maxRadius).x},${getPoint(a, level * maxRadius).y}`).join(" ");
                  return (
                    <polygon 
                      key={idx} 
                      points={pts} 
                      fill="none" 
                      stroke="currentColor" 
                      className="text-zinc-200 dark:text-zinc-800" 
                      strokeWidth={1} 
                    />
                  );
                })}
                
                {/* Draw Axes connecting center to max edge */}
                {angles.map((a, idx) => (
                  <line 
                    key={idx} 
                    x1={center} 
                    y1={center} 
                    x2={getPoint(a, maxRadius).x} 
                    y2={getPoint(a, maxRadius).y} 
                    stroke="currentColor" 
                    className="text-zinc-200 dark:text-zinc-800" 
                    strokeWidth={1}
                  />
                ))}

                {/* The Data Polygon */}
                <motion.polygon 
                  initial={{ points: angles.map(a => `${center},${center}`).join(" ") }}
                  animate={{ points: polygonPoints }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  fill="rgba(16, 185, 129, 0.2)" /* Emerald */
                  stroke="#10b981"
                  strokeWidth={3}
                  strokeLinejoin="round"
                />

                {/* Data Points on vertices */}
                {dataPoints.map((p, idx) => (
                  <motion.circle 
                    key={idx}
                    initial={{ cx: center, cy: center }}
                    animate={{ cx: p.x, cy: p.y }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    r={4}
                    className="fill-white dark:fill-zinc-900 stroke-emerald-500 stroke-[3px]"
                  />
                ))}

                {/* Labels around the hexagon */}
                {labels.map((label, idx) => {
                  const p = getPoint(angles[idx], maxRadius + 30);
                  // Adjust label anchoring based on position
                  let anchor: "start" | "middle" | "end" = "middle";
                  if (p.x > center + 10) anchor = "start";
                  if (p.x < center - 10) anchor = "end";
                  
                  return (
                    <text 
                      key={label}
                      x={p.x} 
                      y={p.y} 
                      textAnchor={anchor}
                      alignmentBaseline="middle"
                      className="text-[11px] font-bold fill-zinc-600 dark:fill-zinc-400 tracking-wider uppercase"
                    >
                      {label}
                    </text>
                  );
                })}
              </svg>
            </div>

            <div className="w-full mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
               <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 mb-1"><MessageSquare size={14} /> Round Out Your Legacy</h3>
               <p className="text-xs text-emerald-700 dark:text-emerald-400/80 leading-relaxed">
                 The AI notes your <span className="font-bold">{lowestCategory}</span> dimension is your smallest mapped node. <br/><br/>
                 Can you drop a story into the archive about a time you engaged heavily with the {lowestCategory} side of life? Let's grow that point!
               </p>
            </div>

          </div>
        </div>
        
        <div className="bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl p-4 flex items-start gap-4 text-sm text-zinc-500 mt-8">
          <Info size={20} className="text-zinc-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Live Analytics:</strong> These visualizations are mapped precisely to the mathematical tags outputted dynamically by the Archivist AI when you compile your transcripts!
          </p>
        </div>

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
