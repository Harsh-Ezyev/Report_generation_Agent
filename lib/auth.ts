import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { USERS, UserRole } from "@/lib/auth-config";

/**
 * NextAuth Configuration with Role-Based Access Control
 * 
 * Users:
 * - Super Admin (admin/admin123) - sees all batteries
 * - Client 1 (client1/client1) - sees assigned batteries
 * - Client 2 (client2/client2) - sees assigned batteries
 * - Client 3 (client3/client3) - sees assigned batteries
 * - Client 4 (client4/client4) - sees assigned batteries
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Username and password are required");
        }

        // Find user in USERS array
        const user = USERS.find(
          (u) => u.username === credentials.username && u.password === credentials.password
        );

        if (user) {
          return {
            id: user.id,
            name: user.name,
            email: `${user.username}@battery-monitoring.com`,
            role: user.role,
            clientId: user.clientId,
          };
        }

        throw new Error("Invalid username or password");
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.role = (user as any).role as UserRole;
        token.clientId = (user as any).clientId as string | undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        session.user.name = token.name as string;
        (session.user as any).role = token.role as UserRole;
        (session.user as any).clientId = token.clientId as string | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "your-secret-key-change-in-production-min-32-chars",
};
