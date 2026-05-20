import { auth } from "@/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(session.user.id) });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user._id.toString(),
      name: user.name || "",
      email: user.email || "",
      image: user.image || null,
      bio: user.bio || "",
      publicProfile: user.publicProfile ?? false,
      website: user.website || "",
      location: user.location || "",
      preferences: user.preferences || {
        emailNotifications: true,
        marketingEmails: false,
        theme: "auto",
      },
      createdAt: user.createdAt || new Date(),
    });
  } catch (error) {
    console.error("GET /api/profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, bio, website, location, publicProfile, preferences } = body;

    const db = await getDb();
    const updateData: Record<string, any> = {};

    if (name) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (website !== undefined) updateData.website = website;
    if (location !== undefined) updateData.location = location;
    if (publicProfile !== undefined) updateData.publicProfile = publicProfile;
    if (preferences) updateData.preferences = preferences;

    updateData.updatedAt = new Date();

    const user = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(session.user.id) },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user._id.toString(),
      name: user.name || "",
      email: user.email || "",
      image: user.image || null,
      bio: user.bio || "",
      publicProfile: user.publicProfile ?? false,
      website: user.website || "",
      location: user.location || "",
      preferences: user.preferences || {
        emailNotifications: true,
        marketingEmails: false,
        theme: "auto",
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("PUT /api/profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
