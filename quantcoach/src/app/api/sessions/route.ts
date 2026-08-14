import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = ["drive", "study", "interview"].includes(body.mode) ? body.mode : "drive";
  const plannedMinutes = Number.isFinite(body.plannedMinutes)
    ? Math.max(5, Math.min(120, Math.round(body.plannedMinutes)))
    : 25;

  const session = await prisma.session.create({
    data: { mode, plannedMinutes },
  });
  return NextResponse.json({ sessionId: session.id, mode, plannedMinutes });
}

export async function GET() {
  const sessions = await prisma.session.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      mode: true,
      startedAt: true,
      endedAt: true,
      plannedMinutes: true,
      summaryText: true,
      deferredQuestionIds: true,
    },
  });
  return NextResponse.json({ sessions });
}
