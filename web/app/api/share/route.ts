import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filePath, ttlHours, password } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: "filePath ist erforderlich" },
        { status: 400 }
      );
    }

    const shareId = crypto.randomBytes(12).toString("hex");
    const filename = filePath.split("/").pop() || "download";
    const expiresAt = ttlHours ? Date.now() + ttlHours * 3600 * 1000 : null;
    const passwordHash = password ? await hashPassword(password) : null;

    const db = await getDb();
    await db.run(
      `INSERT INTO share_links (id, file_path, filename, expires_at, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shareId, filePath, filename, expiresAt, passwordHash, Date.now()]
    );

    const origin = new URL(request.url).origin;
    const shareUrl = `${origin}/s/${shareId}`;

    return NextResponse.json({
      success: true,
      shareId,
      shareUrl,
      filePath,
      filename,
      expiresAt,
      requiresPassword: !!passwordHash,
    });
  } catch (err) {
    console.error("Error saving share link in SQLite", err);
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Freigabelinks in SQLite" },
      { status: 500 }
    );
  }
}
