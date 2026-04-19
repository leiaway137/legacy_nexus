"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, FileText, Trash2, Database, Clock, Bot } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchUserSources, deleteNotebookSource, NotebookSource, saveHighFidelityStories, saveChatHistory, deleteAllUserContacts, saveDashboardState } from "@/lib/mongo/db";
import { deleteAllPineconeResourcesAction, embedStoriesToPineconeAction, extractHighFidelityStoriesAction } from "@/app/actions";

export default function SourcesPage() {
  const { user, loading } = useAuth();
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserSources(user.uid).then(setSources);
    }
  }, [user]);

  const removeSource = async (targetSource: NotebookSource) => {
    if (!user || !targetSource.id) return;
    if (!confirm(`Are you sure you want to completely delete "${targetSource.fileName}"? This will trigger a recompile of all associated Timeline Facts.`)) return;
    
    setIsDeleting(targetSource.id);
    
    try {
        const newSources = sources.filter(s => s.id !== targetSource.id);
        setSources(newSources);

        await saveChatHistory(user.uid, []);

        await deleteNotebookSource(targetSource.id);

        if (newSources.length > 0) {
            const vaultContext = newSources.map(s => `[Source: ${s.fileName}]\n${s.textContent}`).join("\n\n");
            const recompiled = await extractHighFidelityStoriesAction(vaultContext);
            await saveHighFidelityStories(user.uid, recompiled);

            await deleteAllPineconeResourcesAction(user.uid);
            await embedStoriesToPineconeAction(user.uid, "nexus-vault", recompiled);
        } else {
            await saveHighFidelityStories(user.uid, []);
            await deleteAllUserContacts(user.uid);
            await saveDashboardState(user.uid, null);
            await saveChatHistory(user.uid, []);
            await deleteAllPineconeResourcesAction(user.uid);
        }
    } catch (e) {
        console.error("Failed to delete source:", e);
        alert("An error occurred while deleting the source.");
    } finally {
        setIsDeleting(null);
    }
  };

  const formatDate = (timestamp: any) => {
      if (!timestamp) return "Unknown date";
      try {
          const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
          return new Intl.DateTimeFormat('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit'
          }).format(date);
      } catch (e) {
          return "Unknown date";
      }
  };

  const formatSize = (bytes: number) => {
      if (!bytes) return "Unknown size";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
     return <div className="flex items-center justify-center h-screen bg-zinc-50 dark:bg-zinc-950"><Loader2 className="animate-spin text-zinc-400 w-8 h-8" /></div>;
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <header className="flex-shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition text-zinc-500">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 border-l border-zinc-200 dark:border-zinc-800 pl-4 flex items-center justify-between">
              <div>
                  <h1 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                      Primary Sources
                  </h1>
                  <span className="text-xs text-zinc-500 font-medium">{sources.length} active documents mapped</span>
              </div>
          </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
         {/* Instruction Box */}
         <div className="mb-6 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-4">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex-shrink-0 mt-0.5">
               <Bot size={18} />
            </div>
            <div>
                <h3 className="font-semibold text-sm text-indigo-900 dark:text-indigo-100 mb-1">On-Demand Chat Reconstruction</h3>
                <p className="text-[13px] text-indigo-800/80 dark:text-indigo-300/80 leading-relaxed max-w-3xl">
                   Reading a document for the very first time will dynamically task the AI to rebuild raw, unformatted text blocks natively back into an interactive conversational dialogue. This "on-demand" extraction prevents severe computation delays during initial file uploads and automatically caches the formatted script back to your cloud vault permanently.
                </p>
            </div>
         </div>

         <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
               <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                     <th className="px-6 py-4">Resource Name</th>
                     <th className="px-6 py-4"><div className="flex items-center gap-1.5"><Database size={12}/> Size</div></th>
                     <th className="px-6 py-4"><div className="flex items-center gap-1.5"><Clock size={12}/> Uploaded At</div></th>
                     <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {sources.length === 0 ? (
                     <tr>
                        <td colSpan={4} className="px-6 py-16 text-center text-zinc-500 font-medium bg-zinc-50/50 dark:bg-zinc-900/10">
                           No primary sources uploaded yet. Return to the dashboard to begin archiving.
                        </td>
                     </tr>
                  ) : sources.map(src => (
                     <tr key={src.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition group">
                        <td className="px-6 py-4">
                           <Link href={`/sources/${src.id}`} className="flex items-center gap-4 hover:opacity-80 transition inline-flex">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                                 <FileText size={18}/>
                              </div>
                              <div className="flex flex-col">
                                 <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{src.fileName}</span>
                                 {src.parsedContent && (
                                   <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded inline-block mt-1 w-max">
                                     Reconstructed
                                   </span>
                                 )}
                              </div>
                           </Link>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-zinc-500">
                           {formatSize(src.fileSize)}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-zinc-500">
                           {formatDate(src.uploadedAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-2">
                              <Link 
                                href={`/sources/${src.id}`}
                                title="Read Transcript"
                                className="p-2.5 text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 rounded-xl transition font-semibold text-[11px] uppercase tracking-wide flex items-center gap-1.5"
                              >
                                 Read Script
                              </Link>
                              <button 
                                title="Delete Source"
                                onClick={() => removeSource(src)}
                                disabled={isDeleting === src.id}
                                className="p-2.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition disabled:opacity-50"
                              >
                                 {isDeleting === src.id ? <Loader2 size={16} className="animate-spin text-red-500"/> : <Trash2 size={16}/>}
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </main>
    </div>
  );
}
