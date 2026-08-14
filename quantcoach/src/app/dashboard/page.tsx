"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MasteryRow {
  patternId: string;
  name: string;
  domain: string;
  masteryPct: number;
  recognition: number;
  setup: number;
  calculation: number;
  explanation: number;
  confidence: string;
  streak: number;
  nextReviewAt: string | null;
}

interface DashboardData {
  questionCount: number;
  mastery: MasteryRow[];
  recentSessions: {
    id: string;
    mode: string;
    startedAt: string;
    endedAt: string | null;
    summaryText: string | null;
  }[];
  deferredQueue: { id: string; statement: string; topic: string; difficulty: number }[];
}

function barColor(pct: number) {
  if (pct >= 75) return "var(--good)";
  if (pct >= 55) return "var(--warn)";
  return "var(--bad)";
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed to load"))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main>
      <div className="nav">
        <Link href="/">← QuantCoach</Link>
        <strong>Dashboard</strong>
      </div>

      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}

      {data && (
        <>
          <p className="muted">{data.questionCount} questions in your library.</p>

          <h2>Thinking-pattern mastery</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th style={{ width: "30%" }}>Mastery</th>
                  <th>R / S / C / E</th>
                </tr>
              </thead>
              <tbody>
                {data.mastery.map((m) => (
                  <tr key={m.patternId}>
                    <td>
                      {m.name}
                      <div className="muted" style={{ fontSize: "0.75rem" }}>{m.domain}</div>
                    </td>
                    <td>
                      <div className="bar">
                        <div
                          style={{ width: `${m.masteryPct}%`, background: barColor(m.masteryPct) }}
                        />
                      </div>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>
                        {m.masteryPct}% · {m.confidence}
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: "0.8rem" }}>
                      {m.recognition} / {m.setup} / {m.calculation} / {m.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.deferredQueue.length > 0 && (
            <>
              <h2>Desk queue (deferred from drives)</h2>
              <div className="card">
                {data.deferredQueue.map((q) => (
                  <p key={q.id} style={{ margin: "8px 0" }}>
                    <span className="muted">[{q.topic} · d{q.difficulty}]</span> {q.statement}
                  </p>
                ))}
              </div>
            </>
          )}

          <h2>Recent sessions</h2>
          {data.recentSessions.filter((s) => s.summaryText).map((s) => (
            <div key={s.id} className="card">
              <p className="muted" style={{ margin: "0 0 8px" }}>
                {new Date(s.startedAt).toLocaleString()} · {s.mode}
              </p>
              <pre className="summary">{s.summaryText}</pre>
            </div>
          ))}
          {data.recentSessions.filter((s) => s.summaryText).length === 0 && (
            <p className="muted">No completed sessions yet — go do a drive.</p>
          )}
        </>
      )}
    </main>
  );
}
