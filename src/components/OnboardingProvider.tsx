"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { fetchUserProfile, updateUserProfile } from '@/lib/firebase/db';

export interface TourStep {
  targetId: string;
  title: string;
  content: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  disableSkip?: boolean; // If true, must click "Finish" or interact
}

interface OnboardingContextType {
  startTour: (tourId: string, steps: TourStep[]) => void;
  endTour: () => void;
  checkTourReady: (tourId: string) => Promise<boolean>;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used within OnboardingProvider");
  return context;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Measure the target DOM element
  const updateRect = useCallback(() => {
    if (!steps[currentStepIdx]) return;
    const el = document.getElementById(steps[currentStepIdx].targetId);
    if (el) {
       // Scroll into view if needed
       el.scrollIntoView({ behavior: 'smooth', block: 'center' });
       setTimeout(() => {
           const finalEl = document.getElementById(steps[currentStepIdx].targetId);
           if (finalEl) setTargetRect(finalEl.getBoundingClientRect());
       }, 300);
    } else {
       setTargetRect(null);
    }
  }, [currentStepIdx, steps]);

  useEffect(() => {
    if (activeTourId) {
      updateRect();
      window.addEventListener('resize', updateRect);
      window.addEventListener('scroll', updateRect);
      return () => {
        window.removeEventListener('resize', updateRect);
        window.removeEventListener('scroll', updateRect);
      };
    }
  }, [activeTourId, currentStepIdx, updateRect]);

  const checkTourReady = async (tourId: string) => {
    if (!user) return false;
    const profile = await fetchUserProfile(user.uid);
    if (!profile) return false;
    
    // Check if the tour has been completed
    if (profile.completedTours && profile.completedTours.includes(tourId)) {
        return false;
    }
    return true; // Tour should run
  };

  const startTour = (tourId: string, tourSteps: TourStep[]) => {
    if (tourSteps.length === 0) return;
    setSteps(tourSteps);
    setCurrentStepIdx(0);
    setActiveTourId(tourId);
  };

  const endTour = async () => {
    if (user && activeTourId) {
       const profile = await fetchUserProfile(user.uid);
       if (profile) {
           const existing = profile.completedTours || [];
           if (!existing.includes(activeTourId)) {
               await updateUserProfile(user.uid, { completedTours: [...existing, activeTourId] });
           }
       }
    }
    setActiveTourId(null);
    setSteps([]);
    setTargetRect(null);
  };

  const nextStep = () => {
    if (currentStepIdx < steps.length - 1) {
       setCurrentStepIdx(prev => prev + 1);
    } else {
       endTour();
    }
  };

  const prevStep = () => {
    if (currentStepIdx > 0) {
       setCurrentStepIdx(prev => prev - 1);
    }
  };

  const currentStep = steps[currentStepIdx];

  // Tooltip positioning math
  let tooltipStyle: React.CSSProperties = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  if (targetRect && currentStep) {
     const padding = 16;
     const tooltipWidth = 320;
     switch (currentStep.placement) {
         case 'bottom':
             tooltipStyle = { top: targetRect.bottom + padding, left: targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2) };
             break;
         case 'top':
             tooltipStyle = { top: targetRect.top - padding, left: targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2), transform: 'translateY(-100%)' };
             break;
         case 'right':
             tooltipStyle = { top: targetRect.top + (targetRect.height / 2), left: targetRect.right + padding, transform: 'translateY(-50%)' };
             break;
         case 'left':
             tooltipStyle = { top: targetRect.top + (targetRect.height / 2), left: targetRect.left - padding - tooltipWidth, transform: 'translateY(-50%)' };
             break;
         default:
             tooltipStyle = { top: targetRect.bottom + padding, left: targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2) };
     }
  }

  return (
    <OnboardingContext.Provider value={{ startTour, endTour, checkTourReady }}>
      {children}
      
      <AnimatePresence>
         {activeTourId && currentStep && (
           <motion.div 
             initial={{ opacity: 0 }} 
             animate={{ opacity: 1 }} 
             exit={{ opacity: 0 }} 
             className="fixed inset-0 z-[200] overflow-hidden pointer-events-auto"
           >
              {/* Dark Overlay Background */}
              <div 
                className="absolute inset-0 bg-zinc-950/70 backdrop-blur-[2px]" 
                onClick={() => !currentStep.disableSkip && endTour()} 
              />
              
              {/* Highlight Cutout using SVG Mask */}
              {targetRect && (
                 <svg className="absolute inset-0 w-full h-full pointer-events-none z-[201]">
                    <defs>
                      <mask id="hole-mask">
                         <rect width="100%" height="100%" fill="white" />
                         <rect 
                           x={targetRect.left - 8} 
                           y={targetRect.top - 8} 
                           width={targetRect.width + 16} 
                           height={targetRect.height + 16} 
                           rx="12" 
                           fill="black" 
                         />
                      </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.4)" mask="url(#hole-mask)" />
                    {/* Glowing Border around target */}
                    <rect 
                       x={targetRect.left - 8} 
                       y={targetRect.top - 8} 
                       width={targetRect.width + 16} 
                       height={targetRect.height + 16} 
                       rx="12" 
                       fill="none"
                       stroke="#6366f1"
                       strokeWidth="2"
                       className="shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                    />
                 </svg>
              )}

              {/* Tooltip Content Card */}
              <motion.div 
                 layoutId="onboarding-tooltip"
                 className="absolute z-[202] w-[320px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-5 flex flex-col"
                 style={tooltipStyle}
              >
                 {!currentStep.disableSkip && (
                    <button onClick={endTour} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 transition">
                      <X size={16}/>
                    </button>
                 )}
                 <h3 className="text-base font-bold text-indigo-600 dark:text-indigo-400 mb-2">{currentStep.title}</h3>
                 <div className="text-sm text-zinc-600 dark:text-zinc-300 mb-6 leading-relaxed">
                    {currentStep.content}
                 </div>
                 
                 <div className="flex items-center justify-between mt-auto">
                    <span className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase">
                       Step {currentStepIdx + 1} of {steps.length}
                    </span>
                    <div className="flex items-center gap-2">
                       {currentStepIdx > 0 && (
                          <button onClick={prevStep} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-800 transition">
                             <ChevronLeft size={16}/>
                          </button>
                       )}
                       <button onClick={nextStep} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg flex items-center gap-1 transition">
                          {currentStepIdx === steps.length - 1 ? 'Finish' : 'Next'}
                          {currentStepIdx < steps.length - 1 && <ChevronRight size={14}/>}
                       </button>
                    </div>
                 </div>
              </motion.div>
           </motion.div>
         )}
      </AnimatePresence>
    </OnboardingContext.Provider>
  );
}
