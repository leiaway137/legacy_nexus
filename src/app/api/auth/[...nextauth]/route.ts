import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { getDb, initDb } from "@/lib/local-db/client"
import { seedUserOnboarding } from "@/lib/onboarding"
import { randomUUID } from "crypto"

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET || "legacy_nexus_default_fallback_secret_for_vercel",
  session: { strategy: "jwt" as const },
  
  providers: [
    CredentialsProvider({
      name: "Legacy Nexus Internal",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        action: { label: "Action", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        try {
           initDb();
           const db = getDb();
           
           const user = db.prepare('SELECT * FROM users WHERE email = ?').get(credentials.email.toLowerCase()) as any;
           
           if (!user) {
              if (credentials.action === "login") throw new Error("No account found! Please create an account first.");
              
              const newUserId = randomUUID();
              
              db.prepare('INSERT INTO users (id, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)').run(
                 newUserId,
                 credentials.email.toLowerCase(),
                 credentials.password,
                 new Date().toISOString()
              );
              
              // Seed the user with dummy onboarding transcripts
              await seedUserOnboarding(newUserId).catch(e => console.error(e));
              
              return { id: newUserId, email: credentials.email };
           }
           
           if (credentials.action === "signup") {
              throw new Error("An account with this email already exists!");
           }
           
           // Verify password
           if (user.passwordHash === credentials.password) {
              return { id: user.id, email: user.email };
           }
           
        } catch (error) {
           console.error("NextAuth SQLite Error", error);
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session?.user) {
        session.user.id = token.id;
      }
      return session;
    }
  },
  pages: {
     signIn: '/login', // Redirect to the legacy nexus login
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
