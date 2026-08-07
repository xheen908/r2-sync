import { NextResponse } from "next/server";
import crypto from "crypto";
import { getR2Config } from "@/lib/r2";

export const dynamic = "force-dynamic";

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

    // 1. Check SQLite database first
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
      if (user && user.password_hash === inputHash) {
        isMatch = true;
      }
    } catch (dbErr) {
      console.error("DB auth lookup error:", dbErr);
    }

    // 2. Fallback default admin credentials
    if (!isMatch && username === "admin" && password === "adminpassword") {
      isMatch = true;
    }

    if (!isMatch) {
      return NextResponse.json(
        { error: "Ungültige Anmeldedaten (Benutzername oder Passwort falsch)" },
        { status: 401 }
      );
    }

    // Retrieve active Cloudflare R2 credentials from DB / .env
    const config = await getR2Config();

    return NextResponse.json({
      success: true,
      config: {
        accountId: config.accountId,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        bucketName: config.bucketName,
        publicDomainUrl: config.publicDomainUrl || "https://drive.ocpp-labs.com",
      },
    });
  } catch (err: any) {
    console.error("Sync config route error:", err);
    return NextResponse.json(
      { error: `Serverfehler: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
