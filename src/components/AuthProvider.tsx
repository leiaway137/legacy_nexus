"use client";

import { SessionProvider, useSession } from "next-auth/react";
import React, { createContext, useContext } from "react";

// We create a lightweight legacy wrapper wrapper here so we don't have to rewrite 
// the `const { user } = useAuth()` hook across all 30 of your frontend components!
const AuthCompatContext = createContext<any>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthCompatBridge>{children}</AuthCompatBridge>
    </SessionProvider>
  );
}

// A bridge component that reads NextAuth session and mimics the exact shape of your old Firebase `useAuth()` hook
function AuthCompatBridge({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  
  // Format the NextAuth session into the exact shape the components expect (user.uid instead of user.id)
  const user = session?.user ? { 
    ...session.user, 
    uid: session.user.id || session.user.email 
  } : null;

  return (
    <AuthCompatContext.Provider value={{ user, loading: status === "loading" }}>
      {children}
    </AuthCompatContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCompatContext);
}
