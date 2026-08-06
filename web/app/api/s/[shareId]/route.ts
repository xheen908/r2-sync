import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  const { shareId } = params;

  if (!shareId || shareId.length < 8) {
    return NextResponse.json(
      { error: "Ungültiger Freigabelink" },
      { status: 404 }
    );
  }

  // Sample lookup (in production D1, runs `SELECT * FROM share_links WHERE id = ?`)
  const expiresAt = Date.now() + 3600 * 1000 * 24; // 24 hours sample expiry

  return NextResponse.json({
    shareId,
    filename: `Freigabe_${shareId.substring(0, 6)}.pdf`,
    expiresAt,
    requiresPassword: false,
    expired: false,
  });
}
