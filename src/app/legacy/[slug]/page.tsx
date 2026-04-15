"use client";

import { use, useEffect, useState } from "react";
import { type UserProfile, fetchProfileBySlug, fetchHighFidelityStories, fetchDashboardState, PersistentDashboardState } from "@/lib/firebase/db";
import { HighFidelityStory } from "@/lib/rag";
import { ShieldAlert, BookOpen, Quote, Shield, Menu, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { motion } from "framer-motion";

export default function PublicLegacyViewer({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  const { user, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileId, setProfileId] = useState<string>("");
  const [stories, setStories] = useState<HighFidelityStory[]>([]);
  const [dashboard, setDashboard] = useState<PersistentDashboardState | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const result = await fetchProfileBySlug(slug);
      if (!result) {
        setAccessDenied("Profile Not Found.");
        setLoading(false);
        return;
      }

      const pId = result.id;
      const p = result.profile;
      
      setProfile(p);
      setProfileId(pId);
      
      if (p.privacyLevel === 'private') {
        if (!user || user.uid !== pId) {
           setAccessDenied("This Legacy Profile is set to Private.");
           setLoading(false);
           return;
        }
      }

      if (p.privacyLevel === 'family') {
        if (!user || user.uid !== pId) {
           const email = user?.email || "";
           if (!p.familyAccessEmails?.includes(email)) {
             setAccessDenied("This Legacy Profile is restricted to Family Members. Please sign in with an authorized email address.");
             setLoading(false);
             return;
           }
        }
      }

      // If we get here, they either have access, or it's public!
      const fetchedStories = await fetchHighFidelityStories(pId);
      const fetchedDash = await fetchDashboardState(pId);
      
      // If Anonymized, we need to map the stories to their anonymized versions
      if (p.privacyLevel === 'public_anonymized') {
         const redactedStories = fetchedStories.map(s => ({
            ...s,
            synopsis: s.anonymizedSynopsis || "This event is currently being anonymized by the AI guardian.",
            detailedNarrative: s.anonymizedDetailedNarrative || s.detailedNarrative // Fallback if job isn't done
         }));
         setStories(redactedStories);
         
         // Redact dashboard names if necessary, or just hide specific stats
         if (fetchedDash) {
            fetchedDash.recentSummary = "(Anonymized Summary) " + fetchedDash.recentSummary;
         }
      } else {
         setStories(fetchedStories);
      }
      
      setDashboard(fetchedDash);
      setLoading(false);
    }

    if (!authLoading) {
      load();
    }
  }, [slug, user, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
         <div className="animate-pulse bg-zinc-200 dark:bg-zinc-800 h-16 w-16 rounded-full border-4 border-blue-500"></div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
         <ShieldAlert size={64} className="text-red-500 mb-6" />
         <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Access Restricted</h1>
         <p className="text-zinc-600 dark:text-zinc-400 max-w-md">{accessDenied}</p>
      </div>
    );
  }

  const isAnonymized = profile?.privacyLevel === 'public_anonymized';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-blue-200 dark:selection:bg-blue-900">
      
      {/* Public Navbar Element */}
      <div className="w-full h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg fixed top-0 z-50 flex items-center justify-between px-6">
         <div className="flex items-center gap-2 font-bold text-lg font-serif">
           <BookOpen className="text-blue-600 dark:text-blue-400" />
           Legacy Nexus
         </div>
         {isAnonymized ? (
           <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-bold font-mono border border-blue-200 dark:border-blue-800 tracking-wider uppercase">
             <Shield size={14} /> Anonymized Privacy Filter Active
           </div>
         ) : (
           <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-bold font-mono border border-emerald-200 dark:border-emerald-800 tracking-wider uppercase">
             <ShieldCheck size={14} /> Authorized Viewer
           </div>
         )}
      </div>

      <div className="max-w-4xl mx-auto pt-32 pb-24 px-6">
        
        {/* Header / Identity */}
        <div className="text-center mb-16">
           <h1 className="text-5xl md:text-6xl font-black font-serif tracking-tight mb-6">
             {isAnonymized ? "The Subject's Journey" : `${profile?.firstName || ""} ${profile?.lastName || ""}'s Legacy`}
           </h1>
           {dashboard?.legacyIdentityLabel && (
              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 leading-relaxed font-light font-serif">
                "{dashboard.legacyIdentityLabel}"
              </p>
           )}
        </div>

        {/* Stories Timeline */}
        <div className="flex flex-col gap-12 relative before:absolute before:inset-y-0 before:left-8 before:w-[2px] before:bg-gradient-to-b before:from-blue-500/50 before:to-transparent">
          {stories.map((story, i) => (
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true, margin: "-100px" }}
               key={story.id} 
               className="relative pl-16 md:pl-24"
             >
                <div className="absolute left-[31px] top-6 w-4 h-4 rounded-full bg-blue-500 border-4 border-zinc-50 dark:border-zinc-950" />
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 block font-mono">
                  {story.era}
                </span>
                <h2 className="text-2xl md:text-3xl font-bold mb-4">{story.title}</h2>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm">
                   
                   {story.extraction.present && (
                     <blockquote className="mb-8 border-l-4 border-blue-500 pl-4 py-1 italic text-zinc-600 dark:text-zinc-300 font-serif text-lg">
                       <Quote className="inline-block text-blue-300 dark:text-blue-800 mb-1 mr-2" size={20}/>
                       {story.extraction.legacyLesson}
                     </blockquote>
                   )}
                   
                   <p className="text-zinc-800 dark:text-zinc-200 text-lg leading-relaxed mb-6 whitespace-pre-wrap font-serif">
                     {story.synopsis}
                   </p>
                   
                   <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full my-6"/>
                   
                   <div className="prose prose-zinc dark:prose-invert max-w-none font-serif leading-loose text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                      {story.detailedNarrative}
                   </div>
                   
                   <div className="mt-8 flex flex-wrap gap-2">
                     {story.psychometrics.filter(p => p.val > 60).map(p => (
                       <span key={p.label} className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-full text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400">
                         #{p.label}
                       </span>
                     ))}
                   </div>
                </div>
             </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}
