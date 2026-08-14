// Browser-side OpenAI Realtime connection (WebRTC) with tool-call relaying
// to the QuantCoach backend. Runs only in the browser.

export type SessionStatus = "idle" | "connecting" | "live" | "ended" | "error";

export interface TranscriptLine {
  who: "you" | "coach" | "tool";
  text: string;
}

export interface RealtimeHandlers {
  onStatus: (s: SessionStatus, detail?: string) => void;
  onTranscript: (line: TranscriptLine) => void;
  onSessionEnded: (summary: string | null) => void;
}

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement;
  private ended = false;

  constructor(
    private sessionId: string,
    private mode: string,
    private handlers: RealtimeHandlers
  ) {
    this.audioEl = new Audio();
    this.audioEl.autoplay = true;
  }

  async connect(): Promise<void> {
    this.handlers.onStatus("connecting");

    const tokenRes = await fetch("/api/realtime/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: this.mode }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      this.handlers.onStatus("error", err.error ?? "Could not get a session token");
      return;
    }
    const { clientSecret, model } = await tokenRes.json();

    const pc = new RTCPeerConnection();
    this.pc = pc;

    pc.ontrack = (e) => {
      this.audioEl.srcObject = e.streams[0];
    };

    this.mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.mic.getTracks()) pc.addTrack(track, this.mic);

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onmessage = (e) => this.handleEvent(JSON.parse(e.data));
    dc.onopen = () => {
      this.handlers.onStatus("live");
      // Kick off: the tutor greets and pulls the first question.
      this.send({ type: "response.create" });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      }
    );
    if (!sdpRes.ok) {
      this.handlers.onStatus("error", `Realtime handshake failed (${sdpRes.status})`);
      this.close();
      return;
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
  }

  private send(event: Record<string, unknown>) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  private async handleEvent(event: { type: string; [k: string]: unknown }) {
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = (event as { transcript?: string }).transcript;
        if (transcript?.trim()) this.handlers.onTranscript({ who: "you", text: transcript.trim() });
        break;
      }
      case "response.output_audio_transcript.done": {
        const transcript = (event as { transcript?: string }).transcript;
        if (transcript?.trim()) this.handlers.onTranscript({ who: "coach", text: transcript.trim() });
        break;
      }
      case "response.output_item.done": {
        const item = (event as { item?: { type?: string; name?: string; call_id?: string; arguments?: string } }).item;
        if (item?.type === "function_call" && item.name && item.call_id) {
          await this.runTool(item.name, item.call_id, item.arguments ?? "{}");
        }
        break;
      }
      case "error": {
        const err = (event as { error?: { message?: string } }).error;
        console.error("realtime error event:", err);
        break;
      }
    }
  }

  private async runTool(name: string, callId: string, rawArgs: string) {
    this.handlers.onTranscript({ who: "tool", text: `→ ${name}` });
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(rawArgs);
    } catch {
      /* tolerate malformed args */
    }

    let output: unknown;
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, name, args }),
      });
      const data = await res.json();
      output = res.ok ? data.result : { error: data.error ?? "tool failed" };
    } catch (e) {
      output = { error: e instanceof Error ? e.message : "network error" };
    }

    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.send({ type: "response.create" });

    if (name === "end_session") {
      const summary =
        output && typeof output === "object" && "summary" in output
          ? String((output as { summary: unknown }).summary)
          : null;
      // Let the model speak its recap, then wind down.
      setTimeout(() => this.finish(summary), 25000);
    }
  }

  /** User tapped "End session": end via the backend, then close. */
  async endNow(): Promise<void> {
    let summary: string | null = null;
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, name: "end_session", args: {} }),
      });
      const data = await res.json();
      if (res.ok && data.result?.summary) summary = String(data.result.summary);
    } catch {
      /* best-effort */
    }
    this.finish(summary);
  }

  private finish(summary: string | null) {
    if (this.ended) return;
    this.ended = true;
    this.close();
    this.handlers.onStatus("ended");
    this.handlers.onSessionEnded(summary);
  }

  close() {
    this.dc?.close();
    this.pc?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.dc = null;
    this.pc = null;
    this.mic = null;
  }
}
