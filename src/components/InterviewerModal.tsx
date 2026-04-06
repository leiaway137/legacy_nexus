"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Image as ImageIcon, X, Loader2, Save, Download, Play, Square } from "lucide-react";
import { conductActiveInterviewAction } from "@/app/actions";

interface InterviewerModalProps {
  onClose: () => void;
  onSave: (transcript: string) => Promise<void>;
}

export function InterviewerModal({ onClose, onSave }: InterviewerModalProps) {
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const historyRef = useRef<{ role: string; text: string }[]>([]);
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Audio blob storage
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Speech Recognition
  const recognitionRef = useRef<any>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>("");
  const isProcessingTurnRef = useRef<boolean>(false);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        if (isProcessingTurnRef.current) return;
        
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setLiveTranscript(currentTranscript);
        transcriptBufferRef.current = currentTranscript;

        // Silence detection to trigger AI Turn automatically
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          handleUserSilenceDetected();
        }, 2000); // 2 seconds of silence = turn over
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
      };
    }
    
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleUserSilenceDetected = () => {
    if (!transcriptBufferRef.current.trim() || isProcessingTurnRef.current) return;
    isProcessingTurnRef.current = true;
    
    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
    }
    setIsRecording(false);
    
    const finalizedText = transcriptBufferRef.current.trim();
    setLiveTranscript("");
    transcriptBufferRef.current = "";
    
    setHistory(prev => [...prev, { role: "user", text: finalizedText }]);
    historyRef.current = [...historyRef.current, { role: "user", text: finalizedText }];
    
    triggerAiTurn(historyRef.current);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startSessionRecording = async () => {
    setMicError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support audio recording.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };
      mediaRecorderRef.current.start();
      setHasStarted(true);
      
      // AI initiates conversation
      triggerAiTurn(historyRef.current);
    } catch (err: any) {
      console.error("Microphone access denied or not found:", err);
      if (err.name === 'NotFoundError' || err.message.includes('Requested device not found')) {
        setMicError("No microphone found. Please connect a microphone and ensure your browser has permission to access it.");
      } else if (err.name === 'NotAllowedError') {
        setMicError("Microphone permission was denied. Please allow microphone access in your browser settings to continue.");
      } else {
        setMicError(`Microphone error: ${err.message || 'Unknown error occurred.'}`);
      }
    }
  };

  const stopSessionRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const toggleMic = () => {
    if (!recognitionRef.current) return alert("Speech recognition not supported in this browser.");

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      
      if (liveTranscript.trim()) {
        const newHistory = [...history, { role: "user", text: liveTranscript.trim() }];
        setHistory(newHistory);
        setLiveTranscript("");
        triggerAiTurn(newHistory);
      }
    } else {
      window.speechSynthesis.cancel(); // stop AI if talking
      setLiveTranscript("");
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const triggerAiTurn = async (currentHistory: { role: string; text: string }[]) => {
    setIsAiThinking(true);
    const aiResponseText = await conductActiveInterviewAction(currentHistory, currentHistory.length === 0 ? imageBase64 : undefined);
    setIsAiThinking(false);
    
    // Add to history
    setHistory(prev => [...prev, { role: "assistant", text: aiResponseText }]);
    historyRef.current = [...historyRef.current, { role: "assistant", text: aiResponseText }];
    
    // Speak response natively
    const utterance = new SpeechSynthesisUtterance(aiResponseText);
    utterance.rate = 0.95; // Slightly slower
    utterance.pitch = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes("en") && (v.name.includes("Google") || v.name.includes("Premium") || v.name.includes("Natural")));
    if (preferredVoice) utterance.voice = preferredVoice;

    setIsAiSpeaking(true);

    utterance.onend = () => {
      setIsAiSpeaking(false);
      // Auto-hot-mic for hands-free Gemini Live interaction loop
      // Provide a slight delay to avoid capturing the tail end of the AI's own voice echo if using speakers
      setTimeout(() => {
        if (recognitionRef.current) {
          try {
            setLiveTranscript("");
            transcriptBufferRef.current = "";
            isProcessingTurnRef.current = false; // unlock after AI finishes speaking
            recognitionRef.current.start();
            setIsRecording(true);
          } catch(e) {
            console.error("Failed to restart mic", e);
          }
        }
      }, 500);
    };
    
    window.speechSynthesis.speak(utterance);
  };


  const handleEndAndSave = async () => {
    stopSessionRecording();
    
    // Compile history into a markdown-like transcript
    let transcriptData = "# Legacy Nexus AI Interview Transcript\n\n";
    if (imageBase64) transcriptData += "[User provided a visual cue at the start of the interview]\n\n";
    
    for (const msg of historyRef.current) {
      transcriptData += `**${msg.role === 'user' ? 'LegacyKeeper' : 'AI Interviewer'}:**\n${msg.text}\n\n`;
    }
    
    await onSave(transcriptData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden h-[85vh] border border-zinc-200 dark:border-zinc-800"
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex flex-shrink-0 items-center justify-center">
              <Mic className="text-purple-600 dark:text-purple-400" size={16}/>
            </div>
            <h2 className="font-bold text-zinc-800 dark:text-zinc-200">Active AI Interviewer</h2>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-red-500 transition rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={20}/>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!hasStarted ? (
            <div className="flex flex-col items-center justify-center text-center space-y-6 py-10 h-full">
              <div className="w-20 h-20 bg-purple-50 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                <Mic size={32} className="text-purple-500" />
              </div>
              <div className="max-w-md">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Start the Conversation</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                  The AI is trained in narrative extraction. It will listen to your stories, echo your details, and guide you through a deep, personal reflection.
                </p>
              </div>

              {/* Visual Cue Injection */}
              <div className="w-full max-w-sm border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 transition-colors hover:border-purple-400 cursor-pointer relative overflow-hidden group">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  {imageBase64 ? (
                     <div className="w-full p-2">
                       <img src={imageBase64} alt="Visual cue" className="w-full h-32 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm" />
                       <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-2 text-center">Visual cue attached</p>
                     </div>
                  ) : (
                    <>
                      <ImageIcon size={24} className="group-hover:text-purple-500 transition-colors" />
                      <span className="text-sm font-medium">Add a Visual Memory Cue (Optional)</span>
                      <span className="text-xs text-zinc-400 text-center px-4">Upload a photo of an heirloom, childhood home, or person to initiate the memory.</span>
                    </>
                  )}
                </div>
              </div>
              
              {micError && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium w-full max-w-sm text-center">
                  {micError}
                </div>
              )}

              <button 
                onClick={startSessionRecording}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-2"
              >
                <Play fill="currentColor" size={16}/> Start Interview
              </button>
            </div>
          ) : (
            <div className="space-y-6 pb-20">
              {history.map((msg, idx) => (
                 <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-br-none' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 rounded-bl-none border border-purple-200 dark:border-purple-800/50'}`}>
                     {msg.text}
                   </div>
                 </div>
              ))}
              
              {isAiThinking && (
                 <div className="flex justify-start">
                   <div className="bg-purple-100 dark:bg-purple-900/30 rounded-2xl rounded-bl-none p-4 flex items-center gap-2 text-purple-600">
                      <Loader2 size={16} className="animate-spin" /> <span className="text-xs font-semibold">Synthesizing...</span>
                   </div>
                 </div>
              )}

              {liveTranscript && isRecording && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-br-none p-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-400 italic">
                    {liveTranscript}...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls Footer */}
        {hasStarted && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              
              <div className="flex items-center gap-3">
                 <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecording ? 'bg-red-500 animate-pulse' : isAiSpeaking ? 'bg-purple-600 animate-bounce' : 'bg-zinc-800'}`}>
                   {isAiSpeaking ? <Loader2 className="text-white animate-spin" size={24}/> : <Mic className="text-white" size={24}/>}
                 </div>
                 <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {isAiThinking ? "Synthesizing..." : isAiSpeaking ? "AI is Speaking..." : isRecording ? "Listening..." : "Paused"}
                    </span>
                    <span className="text-xs text-zinc-500 line-clamp-1">
                       {isAiThinking ? "Processing your story..." : isAiSpeaking ? "Wait for AI to finish." : isRecording ? "Speak naturally. It will auto-detect when you pause." : "Session paused."}
                    </span>
                 </div>
              </div>

              <div className="flex gap-2">
                {audioUrl && (
                  <a 
                    href={audioUrl} 
                    download={`Legacy_Audio_${new Date().getTime()}.webm`}
                    className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                  >
                    <Download size={16}/> Audio
                  </a>
                )}
                <button 
                  onClick={handleEndAndSave}
                  disabled={historyRef.current.length === 0}
                  className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 rounded-xl text-sm font-bold transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Save size={16}/> Save to Vault
                </button>
              </div>

            </div>
          </div>
        )}

      </motion.div>
    </div>
  );
}
