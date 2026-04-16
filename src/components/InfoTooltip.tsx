"use client";

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InfoTooltipProps {
  content: string | React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function InfoTooltip({ content, position = 'top', className = '' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Determine positioning classes
  let positionClasses = "bottom-full left-1/2 -translate-x-1/2 mb-2"; // default top
  switch (position) {
    case 'bottom':
      positionClasses = "top-full left-1/2 -translate-x-1/2 mt-2";
      break;
    case 'left':
      positionClasses = "right-full top-1/2 -translate-y-1/2 mr-2";
      break;
    case 'right':
      positionClasses = "left-full top-1/2 -translate-y-1/2 ml-2";
      break;
  }

  return (
    <div 
      className={`relative inline-flex items-center space-x-1 group ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={() => setIsVisible(!isVisible)}
    >
      <Info size={16} className="text-zinc-400 hover:text-indigo-500 transition-colors cursor-help" />
      
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-[100] w-48 md:w-64 p-3 bg-zinc-900 border border-zinc-700/50 shadow-xl rounded-xl text-xs font-medium text-zinc-200 leading-relaxed pointer-events-none ${positionClasses}`}
          >
            {content}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-xl pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
