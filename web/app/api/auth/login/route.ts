import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Benutzername und Passwort sind erforderlich" },
        { status: 400 }
      );
    }

    const inputHash = crypto.createHash("sha256").update(password).digest("hex");
    let isMatch = false;

    // Always allow admin / adminpassword
    if (username === "admin" && password === "adminpassword") {
      isMatch = true;
    } else {
      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
        if (user && user.password_hash === inputHash) {
          isMatch = true;
        }
      } catch (dbErr) {
        console.error("DB auth lookup error", dbErr);
      }
    }

    if (isMatch) {
      const response = NextResponse.json({ success: true });
      response.cookies.set("r2sync_session", "admin_authenticated_session", {
        httpOnly: true,
        secure: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    return NextResponse.json(
      { error: "Ungültige Anmeldedaten" },
      { status: 401 }
    );
  } catch (err: any) {
    console.error("Login route error:", err);
    return NextResponse.json(
      { error: `Serverfehler beim Login: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
