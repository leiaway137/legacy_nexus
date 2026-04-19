"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

export function LoginModule() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Clickwrap Agreement State
  const [agreed, setAgreed] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = Math.abs(e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight) < 20;
    if (bottom) {
      setHasScrolledToBottom(true);
    }
  };

  // Auto-unlock if the screen is large enough that scrolling isn't needed
  useEffect(() => {
    if (isSignUp && scrollRef.current) {
      const el = scrollRef.current;
      if (el.scrollHeight <= el.clientHeight) {
        setHasScrolledToBottom(true);
      }
      setAgreed(false);
    }
  }, [isSignUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp && !agreed) return;

    setLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        action: isSignUp ? "signup" : "login"
      });
      
      if (res?.error) {
         setError(res.error);
      } else {
         window.location.reload();
      }
    } catch (err: any) {
      setError("Failed to route authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-8">
      <div className={`w-full ${isSignUp ? 'max-w-3xl' : 'max-w-md'} p-8 bg-white border border-slate-200 rounded-2xl shadow-sm transition-all duration-300`}>
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
          <div className={`${isSignUp ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-4'}`}>
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
          </div>
          
          {isSignUp && (
            <div className="mt-6 flex flex-col space-y-4">
              <div className="font-bold text-[13px] text-red-600 uppercase bg-red-50 p-3 rounded-lg text-center border border-red-100">
                Please Read This Agreement Carefully. By clicking &apos;I Agree&apos; or creating an account, you are entering into a binding legal contract with The Global Fold LLC regarding your access to the Legacy Nexus Platform.
              </div>
              
              <div 
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-64 overflow-y-auto p-4 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-700 space-y-4"
              >
                <h3 className="font-bold text-base text-slate-900 border-b pb-2">NON-DISCLOSURE AND PROPRIETARY RIGHTS AGREEMENT</h3>
                
                <p>This Agreement is made effective as of the date of electronic acceptance by and between <strong>The Global Fold LLC</strong> (&quot;Company&quot;), the developer and owner of the software platform known as <strong>Legacy Nexus</strong>, and the individual or entity accessing the platform (&quot;Recipient&quot;).</p>

                <div>
                  <h4 className="font-bold mb-1">1. Purpose of Disclosure</h4>
                  <p>The Company is providing the Recipient with temporary, non-exclusive access to the Legacy Nexus platform (the &quot;Platform&quot;) for the sole purpose of evaluation and demonstration of its functionality.</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">2. Definition of Confidential Information</h4>
                  <p>&quot;CONFIDENTIAL INFORMATION&quot; includes, but is not limited to, the Legacy Nexus concept, design, business plans, financial information, marketing plans, customer lists, and supplier information. Furthermore, it includes all software code, algorithms, data models, API documentation, neural network architectures, and any other non-public technical specifications relating to Legacy Nexus.</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">3. Protection of Proprietary Information</h4>
                  <p>The Recipient shall hold all CONFIDENTIAL INFORMATION in strict confidence.</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>The Recipient will not disclose any such information to any third party without prior written authorization from The Global Fold LLC.</li>
                    <li>The Recipient will not use any such information for any commercial purpose or for the benefit of any party other than The Global Fold LLC.</li>
                    <li>The secrecy and confidentiality obligations shall not apply to information that is demonstrably part of the public domain prior to disclosure.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold mb-1">4. Reverse Engineering and Access</h4>
                  <p>To protect the integrity of the Platform, the Recipient expressly agrees to the following:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>No Reverse Engineering:</strong> The Recipient shall not, and shall not permit any third party to, copy, modify, decompile, disassemble, or reverse engineer any software code, algorithms, or technical processes of the Legacy Nexus platform.</li>
                    <li><strong>Scope of Use:</strong> Access is granted strictly for evaluation purposes. Any attempt to extract data, scrape the platform, or analyze the underlying architecture is strictly prohibited.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold mb-1">5. Intellectual Property Rights</h4>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Ownership:</strong> The Legacy Nexus platform and all associated intellectual property rights—including but not limited to patents, trademarks, and copyrights—remain the sole and exclusive property of The Global Fold LLC.</li>
                    <li><strong>Assignment of Feedback:</strong> Any suggestions, bug reports, feature requests, or improvements created by the Recipient, whether individually or jointly with The Global Fold LLC, shall immediately become the property of The Global Fold LLC. The Recipient hereby assigns all rights, titles, and interests in such feedback to The Global Fold LLC.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold mb-1">6. Non-Solicitation</h4>
                  <p>During the period of access and for a period of two (2) years thereafter, the Recipient shall not, directly or indirectly, hire, solicit, or attempt to induce any employees, contractors, or customers of The Global Fold LLC to terminate their relationship with the Company.</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">7. Return of Materials</h4>
                  <p>All materials, data, or documents exhibited to the Recipient pursuant to this Agreement shall be returned to or deleted by the Recipient upon demand by The Global Fold LLC.</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">8. Term and Survival</h4>
                  <p>The obligations regarding confidentiality, intellectual property, and the prohibition on reverse engineering shall continue indefinitely. Obligations pertaining to non-solicitation shall survive for the period specified in Section 6.</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">9. Enforcement and Governing Law</h4>
                  <p>The Global Fold LLC may enforce the restrictions provided in this agreement through an action at law or in equity, including injunctive relief. If any provision of this Agreement is held invalid or unenforceable, such portion shall be severed, and the remaining portions shall remain fully valid and enforceable. This Agreement shall be governed by the laws of the jurisdiction in which The Global Fold LLC is headquartered.</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs text-blue-800 mb-3 font-medium">By checking the box below and clicking &quot;Create Account & Accept Agreement&quot;, I acknowledge that I have read and agree to be bound by the terms and conditions of this Non-Disclosure and Proprietary Rights Agreement.</p>
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    disabled={!hasScrolledToBottom}
                    className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className={`text-sm font-medium ${!hasScrolledToBottom ? 'text-slate-400' : 'text-slate-800'}`}>
                    I agree to the terms and conditions. { !hasScrolledToBottom && <span className="text-red-500 text-xs ml-1">(Scroll to bottom to agree)</span> }
                  </span>
                </label>
              </div>
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading || (isSignUp && !agreed)}
            className="w-full flex items-center justify-center mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? "Create Account & Accept Agreement" : "Sign In")}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500 border-t pt-6">
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
