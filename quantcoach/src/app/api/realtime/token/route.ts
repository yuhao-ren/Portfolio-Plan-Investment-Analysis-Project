// Mints an ephemeral OpenAI Realtime client secret so the OPENAI_API_KEY
// never ships to the browser. The session config (instructions, tools,
// turn detection) is fixed server-side per mode.

import { NextRequest, NextResponse } from "next/server";
import { TUTOR_INSTRUCTIONS, INTERVIEWER_INSTRUCTIONS } from "@/lib/prompts";
import { TUTOR_TOOLS, INTERVIEWER_TOOLS } from "@/lib/realtime-tools";

// Mini tier per the design's cost budget (§7); override for quality tests.
const REALTIME_MODEL = process.env.REALTIME_MODEL ?? "gpt-realtime-mini";
const REALTIME_VOICE = process.env.REALTIME_VOICE ?? "marin";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const mode = ["drive", "study", "interview"].includes(body.mode) ? body.mode : "drive";
  const interview = mode === "interview";

  const sessionConfig = {
    session: {
      type: "realtime",
      model: REALTIME_MODEL,
      instructions: interview ? INTERVIEWER_INSTRUCTIONS : TUTOR_INSTRUCTIONS,
      tools: interview ? INTERVIEWER_TOOLS : TUTOR_TOOLS,
      tool_choice: "auto",
      audio: {
        input: {
          // Long-silence tolerance for thinking (design §2.2): semantic VAD at
          // low eagerness waits for genuine end-of-thought instead of barging in.
          turn_detection: { type: "semantic_vad", eagerness: "low" },
          // User-speech transcription so the client can render the transcript.
          transcription: { model: "gpt-4o-mini-transcribe" },
        },
        output: { voice: REALTIME_VOICE },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionConfig),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("client_secrets failed:", res.status, detail);
    return NextResponse.json(
      { error: `OpenAI client_secrets failed (${res.status})`, detail },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({
    clientSecret: data.value,
    expiresAt: data.expires_at,
    model: REALTIME_MODEL,
  });
}
