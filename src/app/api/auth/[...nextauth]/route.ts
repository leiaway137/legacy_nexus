import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import clientPromise from "@/lib/mongo/client"
import { seedUserOnboarding } from "@/lib/onboarding"


export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET || "legacy_nexus_default_fallback_secret_for_vercel",
  // We use JWT for simple secure stateless sessions that easily proxy over Vercel Edge
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
           const client = await clientPromise;
           const db = client.db("legacy_nexus");
           const user = await db.collection("users").findOne({ email: credentials.email.toLowerCase() });
           
           if (!user) {
              if (credentials.action === "login") throw new Error("No account found! Please create an account first.");
              
              // explicitly handle Registration pathway
              const res = await db.collection("users").insertOne({
                 email: credentials.email.toLowerCase(),
                 passwordHash: credentials.password, // TODO: bcrypt hash in production
                 createdAt: new Date()
              });
              
              const newUserId = res.insertedId.toString();
              
              // Seed the user with dummy onboarding transcripts dynamically without blocking the auth return
              seedUserOnboarding(newUserId).catch(e => console.error(e));
              
              return { id: newUserId, email: credentials.email };
           }
           
           if (credentials.action === "signup") {
              throw new Error("An account with this email already exists!");
           }
           
           // Verify password
           if (user.passwordHash === credentials.password) {
              return { id: user._id.toString(), email: user.email };
           }
           
        } catch (error) {
           console.error("NextAuth MongoDB Error", error);
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
