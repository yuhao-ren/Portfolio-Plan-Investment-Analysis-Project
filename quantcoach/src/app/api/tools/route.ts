import { NextRequest, NextResponse } from "next/server";
import { dispatchTool } from "@/lib/tools-service";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, name, args } = await req.json();
    if (!sessionId || !name) {
      return NextResponse.json({ error: "sessionId and name are required" }, { status: 400 });
    }
    const result = await dispatchTool(String(sessionId), String(name), args ?? {});
    return NextResponse.json({ result });
  } catch (e) {
    console.error("tool dispatch failed:", e);
    const message = e instanceof Error ? e.message : "tool dispatch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
