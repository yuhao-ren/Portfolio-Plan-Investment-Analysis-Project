"use client";

import { useEffect, useRef, useState } from "react";
import {
  RealtimeSession,
  type SessionStatus,
  type TranscriptLine,
} from "@/lib/realtime-client";

export default function SessionScreen(props: {
  sessionId: string;
  mode: string;
  plannedMinutes: number;
  onDone: () => void;
}) {
  const { sessionId, mode, plannedMinutes, onDone } = props;
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [detail, setDetail] = useState<string>("");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rt = new RealtimeSession(sessionId, mode, {
      onStatus: (s, d) => {
        setStatus(s);
        if (d) setDetail(d);
      },
      onTranscript: (line) => setLines((prev) => [...prev, line]),
      onSessionEnded: (s) => setSummary(s),
    });
    sessionRef.current = rt;
    rt.connect().catch((e) => {
      setStatus("error");
      setDetail(e instanceof Error ? e.message : "connection failed");
    });

    // Keep the screen awake during a session (design §6.1).
    try {
      navigator.wakeLock
        ?.request("screen")
        .then((lock) => (wakeLockRef.current = lock))
        .catch(() => {});
    } catch {
      /* wake lock unsupported */
    }

    return () => {
      rt.close();
      wakeLockRef.current?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [lines]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const overTime = elapsed >= plannedMinutes * 60;

  if (status === "ended") {
    return (
      <div>
        <h1>Session complete</h1>
        {summary ? (
          <div className="card">
            <pre className="summary">{summary}</pre>
          </div>
        ) : (
          <p className="muted">Session ended.</p>
        )}
        <button className="big-start" onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>
        <span className={`status-dot ${status}`} />
        {status === "connecting" && "Connecting…"}
        {status === "live" && `Live — ${mode} mode`}
        {status === "error" && `Error: ${detail}`}
        {status === "idle" && "Starting…"}
      </p>

      <div className="timer" style={overTime ? { color: "var(--warn)" } : undefined}>
        {mm}:{ss}
        <span className="muted" style={{ fontSize: "1rem" }}> / {plannedMinutes}:00</span>
      </div>

      <div className="card transcript" ref={transcriptRef}>
        {lines.length === 0 && (
          <p className="muted">
            Say hello — the coach will pull your first question. While driving, you can say:
            “give me a minute”, “repeat the question”, “give me a hint”, “skip this one”,
            “wrap it up”.
          </p>
        )}
        {lines.map((l, i) =>
          l.who === "tool" ? (
            <div key={i} className="line tool">{l.text}</div>
          ) : (
            <div key={i} className="line">
              <div className="who">{l.who === "you" ? "You" : "Coach"}</div>
              <div>{l.text}</div>
            </div>
          )
        )}
      </div>

      <button className="end-btn" onClick={() => sessionRef.current?.endNow()}>
        End session
      </button>
    </div>
  );
}
