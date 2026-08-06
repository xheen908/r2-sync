import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("r2sync_session");
  return response;
}
