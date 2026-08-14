"use client";

import { useState } from "react";
import Link from "next/link";
import SessionScreen from "@/components/SessionScreen";

type Mode = "drive" | "study" | "interview";

export default function Home() {
  const [mode, setMode] = useState<Mode>("drive");
  const [minutes, setMinutes] = useState(25);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState<{ sessionId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, plannedMinutes: minutes }),
      });
      if (!res.ok) throw new Error("could not create a session");
      const { sessionId } = await res.json();
      setActive({ sessionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to start");
    } finally {
      setStarting(false);
    }
  }

  if (active) {
    return (
      <main>
        <SessionScreen
          sessionId={active.sessionId}
          mode={mode}
          plannedMinutes={minutes}
          onDone={() => setActive(null)}
        />
      </main>
    );
  }

  return (
    <main>
      <div className="nav">
        <strong>QuantCoach</strong>
        <Link href="/dashboard">Dashboard</Link>
      </div>

      <h1>Ready when you are.</h1>
      <p className="muted">One tap, then just talk. Earbuds or car audio recommended.</p>

      <h2>Mode</h2>
      <div className="seg">
        {(["drive", "study", "interview"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
            {m === "drive" ? "🚗 Drive" : m === "study" ? "🧠 Study" : "⚡ Interview"}
          </button>
        ))}
      </div>

      <h2>Length</h2>
      <div className="seg">
        {[15, 25, 40].map((m) => (
          <button key={m} className={minutes === m ? "on" : ""} onClick={() => setMinutes(m)}>
            {m} min
          </button>
        ))}
      </div>

      <button className="big-start" onClick={start} disabled={starting}>
        {starting ? "Starting…" : "Start session"}
      </button>

      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}

      <p className="muted" style={{ marginTop: 24 }}>
        {mode === "drive" &&
          "Voice-only. Desk-heavy questions get deferred to your Study queue automatically."}
        {mode === "study" &&
          "Same coach, full question pool — keep the screen handy for solutions and deferred items."}
        {mode === "interview" &&
          "No hints, no confirmations. You get a scored debrief at the end."}
      </p>
    </main>
  );
}
