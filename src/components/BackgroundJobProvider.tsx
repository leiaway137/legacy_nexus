"use client";

import React, { createContext, useContext, useState, useRef, ReactNode } from "react";

export interface JobState {
  id: string;
  title: string;
  message: string;
  progress: number;
  total: number;
  status: 'running' | 'completed' | 'error';
}

interface BackgroundJobContextType {
  jobs: JobState[];
  startJob: (title: string, taskFn: (updateProgress: (message: string, current: number, total: number) => void) => Promise<void>) => void;
  clearJob: (id: string) => void;
}

const BackgroundJobContext = createContext<BackgroundJobContextType | undefined>(undefined);

export function BackgroundJobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<JobState[]>([]);
  const runningJobsRef = useRef<Set<string>>(new Set());

  const startJob = async (title: string, taskFn: (updateProgress: (message: string, current: number, total: number) => void) => Promise<void>) => {
    if (runningJobsRef.current.has(title)) return; // Prevent duplicates
    runningJobsRef.current.add(title);

    const jobId = Math.random().toString(36).substring(7);
    
    setJobs(prev => [...prev, {
      id: jobId,
      title,
      message: "Processing...",
      progress: 0,
      total: 100,
      status: 'running'
    }]);

    const updateProgress = (message: string, progress: number, total: number) => {
      const cappedProgress = Math.min(progress, total);
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, message, progress: cappedProgress, total } : job
      ));
    };

    try {
      await taskFn(updateProgress);
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'completed', message: "Done." } : job
      ));

      // Auto-clear after 8 seconds if successfully completed
      setTimeout(() => {
        setJobs(current => current.filter(job => job.id !== jobId));
      }, 8000);

    } catch (e: any) {
      console.error(`Background Job [${title}] failed:`, e);
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'error', message: e.message || "Operation failed." } : job
      ));
    } finally {
      runningJobsRef.current.delete(title);
    }
  };

  const clearJob = (id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
  };

  return (
    <BackgroundJobContext.Provider value={{ jobs, startJob, clearJob }}>
      {children}
    </BackgroundJobContext.Provider>
  );
}

export function useBackgroundJobs() {
  const context = useContext(BackgroundJobContext);
  if (context === undefined) {
    throw new Error("useBackgroundJobs must be used within a BackgroundJobProvider");
  }
  return context;
}
