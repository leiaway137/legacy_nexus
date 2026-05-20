"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Image as ImageIcon, X, Loader2, Save, Download, Play, Square } from "lucide-react";
import { conductActiveInterviewAction, extractDemographicsAction, generateElevenLabsAudioAction } from "@/app/actions";
import { ELEVENLABS_VOICES } from "@/lib/elevenlabs/voices";
import { fetchPendingBankQuestions, markQuestionsAnswered, fetchUserProfile, incrementUserTrustScore, updateUserProfile } from "@/lib/local-db/db";

interface InterviewerModalProps {
  userId: string;
  onClose: () => void;
  onSave: (transcript: string) => Promise<void>;
  initialPrompt?: string;
}

export function InterviewerModal({ userId, onClose, onSave, initialPrompt }: InterviewerModalProps) {
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const historyRef = useRef<{ role: string; text: string }[]>([]);
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string>("Warm & Reflective");
  const [selectedVoice, setSelectedVoice] = useState<string>(ELEVENLABS_VOICES[0].id);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [pendingQuestions, setPendingQuestions] = useState<{id: string, text: string}[]>([]);
  const [trustScore, setTrustScore] = useState<number>(0);

  useEffect(() => {
    fetchPendingBankQuestions(userId, 5).then((items) => {
       setPendingQuestions(items.map(item => ({id: item.id!, text: item.text})));
    });
    fetchUserProfile(userId).then(profile => {
       if (profile && profile.trustScore) {
          setTrustScore(profile.trustScore);
       }
    });
  }, [userId]);

  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Audio blob storage
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Pure Voice Isolation (for Cloning)
  const isolatedMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isolatedAudioChunksRef = useRef<Blob[]>([]);
  const [isolatedAudioUrl, setIsolatedAudioUrl] = useState<string | null>(null);
  const [isolatedDurationSecs, setIsolatedDurationSecs] = useState<number>(0);
  const isolatedRecordingStartRef = useRef<number>(0);

  // Speech Recognition
  const [liveTranscript, setLiveTranscript] = useState("");
  const transcriptBufferRef = useRef<string>("");
  const isProcessingTurnRef = useRef<boolean>(false);
  const currentTurnIdRef = useRef<number>(0);
  const isAiSpeakingRef = useRef<boolean>(false);

  // Whisper Web Worker STT
  const workerRef = useRef<Worker | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelProgress, setModelProgress] = useState<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioBufferRef = useRef<Float32Array>(new Float32Array(0));
  const silenceCounterRef = useRef<number>(0);

  useEffect(() => {
    // Initialize Whisper Web Worker
    workerRef.current = new Worker(new URL('../lib/whisper.worker.ts', import.meta.url));
    
    workerRef.current.addEventListener('message', (e) => {
      const { status, data, text, error, isFinal } = e.data;
      if (status === 'progress') {
         setModelProgress(data);
      } else if (status === 'ready') {
         setIsModelLoading(false);
      } else if (status === 'complete') {
         if (text && text.trim()) {
             setLiveTranscript(text.trim());
             if (isFinal && !isProcessingTurnRef.current) {
                 transcriptBufferRef.current = text.trim();
                 handleUserSilenceDetected();
             }
         }
      } else if (status === 'error') {
         console.error("Whisper Error:", error);
         setMicError("Speech recognition model failed to run.");
      }
    });

    workerRef.current.postMessage({ type: 'init' });

    // Cleanup
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      if (audioContextRef.current) audioContextRef.current.close();
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (isolatedMediaRecorderRef.current && isolatedMediaRecorderRef.current.state !== "inactive") {
        if (isolatedMediaRecorderRef.current.state === "recording") {
           setIsolatedDurationSecs(prev => prev + (Date.now() - isolatedRecordingStartRef.current) / 1000);
        }
        isolatedMediaRecorderRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleUserSilenceDetected = () => {
    if (!transcriptBufferRef.current.trim() || isProcessingTurnRef.current) return;
    isProcessingTurnRef.current = true;
    currentTurnIdRef.current += 1;
    const thisTurnId = currentTurnIdRef.current;
    
    const finalizedText = transcriptBufferRef.current.trim();
    setLiveTranscript("");
    transcriptBufferRef.current = "";
    
    setHistory(prev => {
        const newH = [...prev];
        const lastMsg = newH[newH.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
            lastMsg.text += " ... " + finalizedText;
        } else {
            newH.push({ role: "user", text: finalizedText });
        }
        return newH;
    });
    
    const lastRefMsg = historyRef.current[historyRef.current.length - 1];
    if (lastRefMsg && lastRefMsg.role === 'user') {
        lastRefMsg.text += " ... " + finalizedText;
    } else {
        historyRef.current = [...historyRef.current, { role: "user", text: finalizedText }];
    }
    
    triggerAiTurn(historyRef.current, thisTurnId);
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

      isolatedMediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      isolatedAudioChunksRef.current = [];
      isolatedMediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) isolatedAudioChunksRef.current.push(e.data);
      };
      isolatedMediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(isolatedAudioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setIsolatedAudioUrl(url);
      };

      // --- NEW WHISPER AUDIO PROCESSING ---
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current || isAiSpeakingRef.current || isProcessingTurnRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS to detect silence
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);

        // Append to buffer
        const newBuffer = new Float32Array(audioBufferRef.current.length + inputData.length);
        newBuffer.set(audioBufferRef.current);
        newBuffer.set(inputData, audioBufferRef.current.length);
        audioBufferRef.current = newBuffer;

        if (rms < 0.01) {
           silenceCounterRef.current += 1;
        } else {
           silenceCounterRef.current = 0;
        }

        // Send to Whisper every ~1.5 seconds for interim results
        // 4096 samples at 16000Hz is ~0.256s per frame. 6 frames = 1.5s
        if (newBuffer.length > 0 && silenceCounterRef.current % 6 === 0 && silenceCounterRef.current < 12) {
            workerRef.current?.postMessage({ type: 'transcribe', audio: newBuffer, isFinal: false });
        }

        // ~3 seconds of silence = 12 frames
        if (silenceCounterRef.current >= 12 && audioBufferRef.current.length > 16000) {
           workerRef.current?.postMessage({ type: 'transcribe', audio: audioBufferRef.current, isFinal: true });
           audioBufferRef.current = new Float32Array(0);
           silenceCounterRef.current = 0;
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      mediaRecorderRef.current.start();
      isolatedMediaRecorderRef.current.start();
      isolatedRecordingStartRef.current = Date.now();
      setHasStarted(true);
      setIsRecording(true);
      isRecordingRef.current = true;
      
      if (initialPrompt && historyRef.current.length === 0) {
          // Immediately set AI's first turn to the initial prompt (typically a gap prompt)
          const newMsg = { role: "assistant", text: initialPrompt };
          setHistory([newMsg]);
          historyRef.current = [newMsg];
          speakUtterance(initialPrompt);
      } else {
          // AI initiates conversation completely dynamically via LLM
          currentTurnIdRef.current += 1;
          triggerAiTurn(historyRef.current, currentTurnIdRef.current);
      }
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (isolatedMediaRecorderRef.current && isolatedMediaRecorderRef.current.state !== "inactive") {
      if (isolatedMediaRecorderRef.current.state === "recording") {
         setIsolatedDurationSecs(prev => prev + (Date.now() - isolatedRecordingStartRef.current) / 1000);
      }
      isolatedMediaRecorderRef.current.stop();
    }
    window.speechSynthesis.cancel();
  };

  const toggleMic = () => {
    if (isRecordingRef.current) {
      setIsRecording(false);
      isRecordingRef.current = false;
      
      if (liveTranscript.trim()) {
        const newHistory = [...history, { role: "user", text: liveTranscript.trim() }];
        setHistory(newHistory);
        setLiveTranscript("");
        currentTurnIdRef.current += 1;
        triggerAiTurn(newHistory, currentTurnIdRef.current);
      }
    } else {
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
      }
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
      setLiveTranscript("");
      audioBufferRef.current = new Float32Array(0);
      silenceCounterRef.current = 0;
      setIsRecording(true);
      isRecordingRef.current = true;
    }
  };

  const triggerAiTurn = async (currentHistory: { role: string; text: string }[], turnId: number) => {
    setIsAiThinking(true);
    const questionStrings = pendingQuestions.map(q => q.text);
    const { response, trustScoreDelta, sentiment, vulnerability, wisdomDensity } = await conductActiveInterviewAction(currentHistory, currentHistory.length === 0 ? imageBase64 : undefined, selectedPersona, questionStrings, trustScore);
    
    if (currentTurnIdRef.current !== turnId) {
        return; // We were interrupted
    }
    
    setIsAiThinking(false);
    
    // Maintain recording state through AI turn so the microphone safely auto-restarts and stays visibly active
    isProcessingTurnRef.current = false;
    isAiSpeakingRef.current = true;
    
    let appliedDelta = trustScoreDelta;
    
    if (wisdomDensity === "High") {
       appliedDelta += 10;
       
       setHistory(prev => {
          const newH = [...prev];
          if (newH.length > 0) {
             const lastUser = newH[newH.length - 1];
             if (lastUser.role === 'user' && !lastUser.text.includes('#LifeLesson')) {
                lastUser.text += "\n\n[#LifeLesson]";
             }
          }
          return newH;
       });
       
       if (historyRef.current.length > 0) {
          const lastUserRef = historyRef.current[historyRef.current.length - 1];
          if (lastUserRef.role === 'user' && !lastUserRef.text.includes('#LifeLesson')) {
             lastUserRef.text += "\n\n[#LifeLesson]";
          }
       }
    }
    
    if (appliedDelta > 0) {
       setTrustScore(prev => prev + appliedDelta);
       incrementUserTrustScore(userId, appliedDelta).catch(e => console.error(e));
    }
    
    // Add to history
    const aiResponseText = response;
    setHistory(prev => [...prev, { role: "assistant", text: aiResponseText }]);
    historyRef.current = [...historyRef.current, { role: "assistant", text: aiResponseText }];
    
    speakUtterance(aiResponseText);
  };

  const speakUtterance = async (textToSpeak: string) => {
    setIsAiSpeaking(true);
    isAiSpeakingRef.current = true;

    // Immediately pause pure voice recorder to entirely filter out the AI's acoustic echo
    if (isolatedMediaRecorderRef.current && isolatedMediaRecorderRef.current.state === 'recording') {
       setIsolatedDurationSecs(prev => prev + (Date.now() - isolatedRecordingStartRef.current) / 1000);
       isolatedMediaRecorderRef.current.pause();
    }
    
    // Attempt to fetch ultra-realistic ElevenLabs TTS
    try {
        const base64Audio = await generateElevenLabsAudioAction(userId, textToSpeak, selectedVoice);
        
        if (base64Audio) {
            const dataUrl = `data:audio/mp3;base64,${base64Audio}`;
            
            if (audioRef.current) {
                audioRef.current.pause();
            }
            
            const audio = new Audio(dataUrl);
            audioRef.current = audio;
            
            audio.onended = () => {
                setIsAiSpeaking(false);
                isAiSpeakingRef.current = false;
                
                // Keep the delay to let acoustic echo fade out before enabling mic
                setTimeout(() => {
                  if (isolatedMediaRecorderRef.current && isolatedMediaRecorderRef.current.state === 'paused') {
                      isolatedRecordingStartRef.current = Date.now();
                      isolatedMediaRecorderRef.current.resume();
                  }
                  if (isRecordingRef.current) {
                      setLiveTranscript("");
                      transcriptBufferRef.current = "";
                      audioBufferRef.current = new Float32Array(0);
                      silenceCounterRef.current = 0;
                  }
                }, 500);
            };
            
            audio.play().catch(e => {
                console.error("Audio playback prevented by browser:", e);
                setIsAiSpeaking(false);
                isAiSpeakingRef.current = false;
            });
            
            return;
        }
    } catch (e) {
        console.error("ElevenLabs fallback failed:", e);
    }
    
    // If TTS completely failed or didn't return audio, gracefully restart the microphone anyway
    // but utilize Browser TTS as a fallback so the AI isn't entirely silent
    console.warn("ElevenLabs TTS failed; falling back to browser SpeechSynthesis.");
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => {
       setIsAiSpeaking(false);
       isAiSpeakingRef.current = false;
       setTimeout(() => {
          if (isolatedMediaRecorderRef.current && isolatedMediaRecorderRef.current.state === 'paused') {
              isolatedRecordingStartRef.current = Date.now();
              isolatedMediaRecorderRef.current.resume();
          }
          if (!isRecording) {
             setLiveTranscript("");
             transcriptBufferRef.current = "";
             audioBufferRef.current = new Float32Array(0);
             silenceCounterRef.current = 0;
             setIsRecording(true);
          }
       }, 500);
    };
    window.speechSynthesis.speak(utterance);
    
  };


  const handleEndAndSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    stopSessionRecording();
    
    // Compile history into a markdown-like transcript
    let transcriptData = "# Legacy Nexus AI Interview Transcript\n\n";
    if (imageBase64) transcriptData += "[User provided a visual cue at the start of the interview]\n\n";
    
    for (const msg of historyRef.current) {
      transcriptData += `**${msg.role === 'user' ? 'LegacyKeeper' : 'AI Interviewer'}:**\n${msg.text}\n\n`;
    }
    
    // Trigger Identity Harvester in the background
    extractDemographicsAction(transcriptData).then((profileUpdates) => {
       if (Object.keys(profileUpdates).length > 0) {
          updateUserProfile(userId, profileUpdates).catch(e => console.error("Identity Harvester Failed:", e));
       }
    }).catch(e => console.error(e));
    
    // Mark pending questions as answered so they rotate out of the queue
    if (pendingQuestions.length > 0) {
       await markQuestionsAnswered(userId, pendingQuestions.map(q => q.id!));
    }
    
    try {
       await onSave(transcriptData);
    } finally {
       setIsSaving(false);
       onClose();
    }
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

              <div className="w-full max-w-sm mt-4">
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Interviewer Style</label>
                <select
                  value={selectedPersona}
                  onChange={(e) => setSelectedPersona(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500 transition-colors cursor-pointer text-zinc-900 dark:text-zinc-100"
                >
                  <option value="Warm & Reflective">Warm & Reflective (Default)</option>
                  <option value="Analytical & Probing">Analytical & Probing</option>
                  <option value="Playful & Creative">Playful & Creative</option>
                </select>
              </div>

              <div className="w-full max-w-sm mt-4">
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Interviewer Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500 transition-colors cursor-pointer text-zinc-900 dark:text-zinc-100"
                >
                  {ELEVENLABS_VOICES.map(voice => (
                      <option key={voice.id} value={voice.id}>{voice.name}</option>
                  ))}
                </select>
              </div>
              
              {micError && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium w-full max-w-sm text-center">
                  {micError}
                </div>
              )}

              <button 
                onClick={startSessionRecording}
                disabled={isModelLoading}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isModelLoading ? <><Loader2 className="animate-spin" size={16}/> Loading AI Model...</> : <><Play fill="currentColor" size={16}/> Start Interview</>}
              </button>
              
              {isModelLoading && modelProgress && (
                <div className="w-full max-w-sm">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>Downloading local AI components...</span>
                    <span>{Math.round(modelProgress.progress || 0)}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-purple-500 h-full transition-all" style={{width: `${modelProgress.progress || 0}%`}} />
                  </div>
                </div>
              )}
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
                    download={`Legacy_Audio_${new Date().toISOString().split('T')[0]}.webm`}
                    className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                  >
                    <Download size={16}/> Full Session
                  </a>
                )}
                {isolatedAudioUrl && (
                  <a 
                    href={isolatedAudioUrl} 
                    download={`Pure_Voice_${new Date().toISOString().split('T')[0]}_${Math.round(isolatedDurationSecs)}s.webm`}
                    className="px-4 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                  >
                    <Download size={16}/> Pure Voice
                  </a>
                )}
                <button 
                  onClick={handleEndAndSave}
                  disabled={historyRef.current.length === 0 || isSaving}
                  className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 rounded-xl text-sm font-bold transition flex items-center gap-2 disabled:opacity-50 w-[140px] justify-center"
                >
                  {isSaving ? <><Loader2 size={16} className="animate-spin"/> Saving...</> : <><Save size={16}/> Save to Vault</>}
                </button>
              </div>

            </div>
          </div>
        )}

      </motion.div>
    </div>
  );
}
