"use server";

import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";

export async function registerUser(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "Missing fields" };
  }

  try {
    const db = await getDb();
    
    // Check if user exists
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return { error: "Email already in use" };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    await db.collection("users").insertOne({
      name,
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });

    return { success: true };
  } catch (error: any) {
    console.error("Registration error:", error);
    return { error: "Failed to create account" };
  }
}
