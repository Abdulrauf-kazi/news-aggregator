import NextAuth from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "./lib/mongodb";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getDb } from "./lib/mongodb";

const nextAuthResult = NextAuth({
  trustHost: true, // Included from incoming changes for deployment stability
  adapter: MongoDBAdapter(clientPromise),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || "fallback-secret-for-dev-only-change-in-prod",
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "mock-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock-client-secret",
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }
        const db = await getDb();
        const user = await db.collection("users").findOne({ email: credentials.email });
        if (!user || !user.password) {
          throw new Error("Invalid credentials");
        }
        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }
        return { id: user._id.toString(), name: user.name, email: user.email };
      },
    }),
    CredentialsProvider({
      id: "wallet",
      name: "Wallet Signature",
      credentials: {
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
        address: { label: "Address", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.signature || !credentials?.address) {
          throw new Error("Missing signature or address");
        }
        const db = await getDb();
        let user = await db.collection("users").findOne({ address: credentials.address });
        if (!user) {
          const result = await db.collection("users").insertOne({
            address: credentials.address,
            name: `${(credentials.address as string).slice(0, 6)}...${(credentials.address as string).slice(-4)}`,
            email: `${credentials.address}@wallet.local`,
            createdAt: new Date(),
          });
          user = {
            _id: result.insertedId,
            address: credentials.address,
            name: `${(credentials.address as string).slice(0, 6)}...${(credentials.address as string).slice(-4)}`,
            email: `${credentials.address}@wallet.local`,
          };
        }
        return { id: user._id.toString(), name: user.name, email: user.email };
      },
    }),
  ],
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  events: {
    async signIn({ user, account }) {
      try {
        const db = await getDb();
        await db.collection("login_events").insertOne({
          userId: user?.id,
          email: user?.email ?? null,
          provider: account?.provider ?? "unknown",
          loggedInAt: new Date(),
        });
      } catch (error) {
        console.error("Login event logging failed:", error);
      }
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

// FIXED: Exporting individually to avoid portability inference errors
export const handlers = nextAuthResult.handlers;
export const auth = nextAuthResult.auth;
export const signIn = nextAuthResult.signIn;
export const signOut = nextAuthResult.signOut;
