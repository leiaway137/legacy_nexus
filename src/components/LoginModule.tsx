"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Loader2 } from "lucide-react";

export function LoginModule() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Failed to authenticate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-blue-600 font-bold text-white flex items-center justify-center">N</div>
            <span className="font-bold text-xl text-slate-800 tracking-tight">Narrative Nexus</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-800 text-center mb-6">
          {isSignUp ? "Create your Vault" : "Access your Vault"}
        </h2>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="archivist@family.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? "Create Account" : "Sign In")}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          {isSignUp ? "Already have an account?" : "Don't have a vault yet?"}{" "}
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-medium text-blue-600 hover:text-blue-800"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
