import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const { currentUsername, newUsername, newPassword } = await request.json();

    if (!newUsername && !newPassword) {
      return NextResponse.json({ error: "Keine Änderungen angegeben" }, { status: 400 });
    }

    const db = await getDb();
    const user = await db.get("SELECT * FROM users WHERE username = ?", [currentUsername || "admin"]);

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    let updatedUsername = user.username;
    let updatedHash = user.password_hash;

    if (newUsername && newUsername.trim()) {
      updatedUsername = newUsername.trim();
    }

    if (newPassword && newPassword.trim()) {
      updatedHash = await hashPassword(newPassword.trim());
    }

    await db.run(
      "UPDATE users SET username = ?, password_hash = ? WHERE id = ?",
      [updatedUsername, updatedHash, user.id]
    );

    return NextResponse.json({ success: true, updatedUsername });
  } catch (err: any) {
    console.error("Account update error:", err);
    return NextResponse.json({ error: "Fehler beim Aktualisieren des Kontos" }, { status: 500 });
  }
}
