import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Benutzername und Passwort sind erforderlich" },
        { status: 400 }
      );
    }

    const inputHash = await hashPassword(password);
    const db = await getDb();
    const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);

    if (user && user.password_hash === inputHash) {
      const response = NextResponse.json({ success: true });
      response.cookies.set("r2sync_session", "admin_authenticated_session", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    return NextResponse.json(
      { error: "Ungültige Anmeldedaten" },
      { status: 401 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Serverfehler beim Login" },
      { status: 500 }
    );
  }
}
