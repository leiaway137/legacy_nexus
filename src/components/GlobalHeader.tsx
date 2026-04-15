"use client";

import Link from "next/link";
import { Share2, Settings, User, Network, Activity, BookOpen, LogOut, Home, Library, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { useBackgroundJobs } from "@/components/BackgroundJobProvider";
import { ShareModal } from "./ShareModal";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";

export function GlobalHeader() {
  const { user } = useAuth();
  const { jobs } = useBackgroundJobs();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // If there's no authenticated user, the layout is handled by individual page login gates, 
  // but we should avoid rendering the internal workspace tools.
  if (!user) return null;

  const activeJobs = jobs.filter(j => j.status === 'running');

  return (
    <>
    <AnimatePresence>
      {isShareModalOpen && user && (
         <ShareModal userId={user.uid} onClose={() => setIsShareModalOpen(false)} />
      )}
    </AnimatePresence>
    <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-[90] relative">
      <div className="flex items-center gap-4">
        <div className="bg-slate-900 dark:bg-white text-white dark:text-zinc-900 w-8 h-8 rounded-full flex items-center justify-center font-bold font-serif shadow-sm">
          N
        </div>
        <span className="font-semibold text-lg flex items-center gap-2">
          Legacy Nexus 
          <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-xs rounded-full font-medium text-zinc-500">
            Workspace
          </span>
          {activeJobs.length > 0 && (
             <div className="flex items-center gap-1.5 ml-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full shadow-sm border border-indigo-100 dark:border-indigo-800 uppercase tracking-widest hidden lg:flex">
                <Loader2 size={12} className="animate-spin" />
                {activeJobs[0].title} ({activeJobs[0].progress}%)
                {activeJobs.length > 1 && ` +${activeJobs.length - 1}`}
             </div>
          )}
        </span>
      </div>
      
      <div className="flex items-center gap-4">
        <button onClick={() => setIsShareModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition">
          <Share2 size={16}/> Share
        </button>
        <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition">
          <Settings size={16}/> Settings
        </button>
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer relative group z-[999]">
          {user.email?.[0].toUpperCase()}
          <div className="absolute top-full right-0 pt-2 w-52 hidden group-hover:block cursor-default">
             <div className="absolute center -inset-x-8 -inset-y-6 -top-10 z-0 bg-transparent" />
             <div className="bg-white dark:bg-zinc-950 shadow-2xl border border-slate-200 dark:border-zinc-800 rounded-xl p-2 flex flex-col gap-1 relative z-10">
               <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-zinc-400 truncate">{user.email}</div>
               
               <Link href="/" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer">
                 <Home size={16}/> Dashboard
               </Link>
               <Link href="/profile" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer">
                 <User size={16}/> Profile
               </Link>
               <Link href="/contacts" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer">
                 <Network size={16}/> Address Book
               </Link>
               <Link href="/stories" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer">
                 <Library size={16}/> Timeline
               </Link>
               <Link href="/progress" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer">
                 <Activity size={16}/> Legacy Progress
               </Link>
               <Link href="/my-stories" className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer">
                 <BookOpen size={16}/> My Stories
               </Link>
               
               <button onClick={() => auth.signOut()} className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg flex items-center gap-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 pt-3 cursor-pointer transition">
                 <LogOut size={16}/> Sign Out
               </button>
             </div>
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
