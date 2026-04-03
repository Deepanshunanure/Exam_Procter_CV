"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types  (kept in sync with backend Pydantic models)
// ─────────────────────────────────────────────────────────────────────────────

export interface Alert {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
}

export interface FrameMetrics {
  ear: number;
  mar: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface ViolationEvent {
  id: string;          // synthesised on client: "{type}-{timestamp}"
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  timestamp: string;   // ISO-8601 string
}

export interface FrameData {
  annotated_frame: string;   // base64 JPEG
  metrics: FrameMetrics;
  alerts: Alert[];
}

export interface SessionReport {
  session_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  total_frames: number;
  risk_score: number;
  violation_summary: Record<string, number>;
  violations: ViolationEvent[];
}

export interface SessionStartResponse {
  session_id: string;
  started_at: string;
}

export interface HealthStatus {
  status: string;
  mediapipe: boolean;
  yolo: boolean;
  active_sessions: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw backend shape — what the WebSocket actually sends back
// (ViolationFrame from proctor_detector.py — flat object, not a typed envelope)
// ─────────────────────────────────────────────────────────────────────────────

interface BackendViolationFrame {
  session_id: string;
  frame_number: number;
  timestamp: number;       // unix float
  ear: number;
  mar: number;
  yaw: number;
  pitch: number;
  roll: number;
  num_faces: number;
  num_hands: number;
  objects_detected: string[];
  alerts: string[];        // list of string tags e.g. "drowsy", "phone_detected"
  new_violations: Array<{
    id: string;
    type: string;
    severity: string;
    timestamp: string;     // ISO string (fixed in backend)
    message: string;
  }>;
  annotated_frame: string | null;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity map (same as backend SEVERITY dict)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, Alert["severity"]> = {
  drowsy: "high",
  yawn: "low",
  look_away: "medium",
  no_face: "high",
  multiple_faces: "critical",
  phone_detected: "critical",
  unknown_object: "high",
  hand_raised: "medium",
  face_covered: "high",
  whisper: "medium",
};

function tagToAlert(tag: string): Alert {
  return {
    type: tag,
    severity: SEVERITY_MAP[tag] ?? "medium",
    message: tag.replace(/_/g, " "),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ProctoringClient
// ─────────────────────────────────────────────────────────────────────────────

export class ProctoringClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;

  private onFrame: ((frame: FrameData) => void) | null = null;
  private onViolation: ((violation: ViolationEvent) => void) | null = null;
  private onReport: ((report: SessionReport) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;
  private onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Convert http(s):// → ws(s)://
    this.wsUrl = baseUrl.replace(/^http/, "ws");
  }

  setCallbacks(callbacks: {
    onFrame?: (frame: FrameData) => void;
    onViolation?: (violation: ViolationEvent) => void;
    onReport?: (report: SessionReport) => void;
    onError?: (error: Error) => void;
    onConnectionChange?: (connected: boolean) => void;
  }) {
    this.onFrame = callbacks.onFrame ?? null;
    this.onViolation = callbacks.onViolation ?? null;
    this.onReport = callbacks.onReport ?? null;
    this.onError = callbacks.onError ?? null;
    this.onConnectionChange = callbacks.onConnectionChange ?? null;
  }

  async checkHealth(): Promise<HealthStatus> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) throw new Error("Health check failed");
    return response.json();
  }

  async begin(): Promise<SessionStartResponse> {
    const response = await fetch(`${this.baseUrl}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error("Failed to start session");
    const data: SessionStartResponse = await response.json();
    this.sessionId = data.session_id;
    this.connectWebSocket();
    return data;
  }

  // ── FIX 1: correct WebSocket path (/ws/proctor/{id} not /session/{id}/ws) ──
  private connectWebSocket() {
    if (!this.sessionId) return;

    const url = `${this.wsUrl}/ws/proctor/${this.sessionId}`;
    console.log("[ProctorClient] Connecting WS →", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[ProctorClient] WS open");
      this.onConnectionChange?.(true);
    };

    // ── FIX 3: parse flat ViolationFrame, not {type, data} envelope ──────────
    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const vf: BackendViolationFrame = JSON.parse(event.data as string);

        // Surface backend errors
        if (vf.error) {
          console.warn("[ProctorClient] Backend frame error:", vf.error);
          this.onError?.(new Error(vf.error));
          return;
        }

        // Build FrameData from the flat ViolationFrame
        const frameData: FrameData = {
          annotated_frame: vf.annotated_frame ?? "",
          metrics: {
            ear: vf.ear,
            mar: vf.mar,
            yaw: vf.yaw,
            pitch: vf.pitch,
            roll: vf.roll,
          },
          alerts: (vf.alerts ?? []).map(tagToAlert),
        };
        this.onFrame?.(frameData);

        // Fire a ViolationEvent callback for each new violation
        for (const v of vf.new_violations ?? []) {
          const violation: ViolationEvent = {
            // id comes from backend (uuid); fall back to synthetic id if absent
            id: v.id || `${v.type}-${v.timestamp}`,
            type: v.type,
            severity: (v.severity as ViolationEvent["severity"]) ?? "medium",
            message: v.message,
            // timestamp is ISO string from the fixed backend; guard for old unix float
            timestamp:
              typeof v.timestamp === "string"
                ? v.timestamp
                : new Date((v.timestamp as unknown as number) * 1000).toISOString(),
          };
          this.onViolation?.(violation);
        }
      } catch (err) {
        console.error("[ProctorClient] Failed to parse WS message:", err);
        this.onError?.(err as Error);
      }
    };

    this.ws.onerror = (e) => {
      console.error("[ProctorClient] WS error", e);
      this.onError?.(new Error("WebSocket error"));
    };

    this.ws.onclose = (e) => {
      console.log("[ProctorClient] WS closed", e.code, e.reason);
      this.onConnectionChange?.(false);
    };
  }

  start(videoEl: HTMLVideoElement) {
    if (!this.sessionId || !this.ws) return;

    if (this.frameInterval) clearInterval(this.frameInterval);

    // Send frames at 10 fps (100 ms)
    this.frameInterval = setInterval(() => {
      this.sendFrame(videoEl);
    }, 100);
  }

  // ── FIX 2: send plain base64 string, not JSON wrapper ────────────────────
  sendFrame(videoEl: HTMLVideoElement) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    // Backend calls receive_text() and decodes it directly as base64 —
    // do NOT wrap in JSON. Just send the raw base64 string.
    const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    this.ws.send(base64);
  }

  // ── FIX 4: call /end then fetch /report (end only returns partial data) ───
  async endSession(): Promise<SessionReport | null> {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (!this.sessionId) return null;

    const sid = this.sessionId;

    try {
      // Step 1: signal the backend that the session is over
      const endRes = await fetch(`${this.baseUrl}/session/${sid}/end`, {
        method: "POST",
      });
      if (!endRes.ok) throw new Error(`Failed to end session (${endRes.status})`);

      // Step 2: fetch the full report (includes risk_score, violations list, etc.)
      const reportRes = await fetch(`${this.baseUrl}/session/${sid}/report`);
      if (!reportRes.ok)
        throw new Error(`Failed to fetch report (${reportRes.status})`);

      const raw = await reportRes.json();

      // Normalise field names: backend uses duration_seconds (fixed) or duration_s (old)
      const report: SessionReport = {
        session_id: raw.session_id,
        started_at: raw.started_at,
        ended_at: raw.ended_at ?? new Date().toISOString(),
        duration_seconds: raw.duration_seconds ?? raw.duration_s ?? 0,
        total_frames: raw.total_frames ?? 0,
        risk_score: Math.round(raw.risk_score ?? 0),
        violation_summary: raw.violation_summary ?? {},
        violations: (raw.violations ?? []).map(
          (v: {
            id?: string;
            type: string;
            severity: string;
            message: string;
            timestamp: string | number;
          }) => ({
            id: v.id || `${v.type}-${v.timestamp}`,
            type: v.type,
            severity: v.severity,
            message: v.message,
            timestamp:
              typeof v.timestamp === "string"
                ? v.timestamp
                : new Date((v.timestamp as number) * 1000).toISOString(),
          })
        ),
      };

      // Close the WebSocket after collecting the report
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.sessionId = null;

      return report;
    } catch (error) {
      console.error("[ProctorClient] endSession error:", error);
      this.onError?.(error as Error);
      return null;
    }
  }

  async getReport(sessionId: string): Promise<SessionReport> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/report`);
    if (!response.ok) throw new Error("Failed to fetch report");
    return response.json();
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook  (unchanged API surface — pages don't need to change)
// ─────────────────────────────────────────────────────────────────────────────

export function useProctor(baseUrl: string) {
  const clientRef = useRef<ProctoringClient | null>(null);
  const [frame, setFrame] = useState<FrameData | null>(null);
  const [violations, setViolations] = useState<ViolationEvent[]>([]);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = new ProctoringClient(baseUrl);
    clientRef.current = client;

    client.setCallbacks({
      onFrame: (frameData) => setFrame(frameData),
      onViolation: (violation) =>
        setViolations((prev) => [violation, ...prev]),
      onReport: (reportData) => setReport(reportData),
      onError: (err) => setError(err),
      onConnectionChange: (isConnected) => setConnected(isConnected),
    });

    return () => {
      client.disconnect();
    };
  }, [baseUrl]);

  const begin = useCallback(async () => {
    if (!clientRef.current) return null;
    try {
      setError(null);
      setViolations([]);
      setReport(null);
      setFrame(null);
      const session = await clientRef.current.begin();
      setSessionId(session.session_id);
      setStartTime(new Date(session.started_at));
      setActive(true);
      return session;
    } catch (err) {
      setError(err as Error);
      return null;
    }
  }, []);

  const start = useCallback((videoEl: HTMLVideoElement) => {
    if (!clientRef.current) return;
    clientRef.current.start(videoEl);
  }, []);

  const endSession = useCallback(async () => {
    if (!clientRef.current) return null;
    try {
      const finalReport = await clientRef.current.endSession();
      setActive(false);
      if (finalReport) setReport(finalReport);
      return finalReport;
    } catch (err) {
      setError(err as Error);
      return null;
    }
  }, []);

  const checkHealth = useCallback(async () => {
    if (!clientRef.current) return null;
    try {
      return await clientRef.current.checkHealth();
    } catch (err) {
      setError(err as Error);
      return null;
    }
  }, []);

  const getReport = useCallback(async (sid: string) => {
    if (!clientRef.current) return null;
    try {
      return await clientRef.current.getReport(sid);
    } catch (err) {
      setError(err as Error);
      return null;
    }
  }, []);

  return {
    client: clientRef.current,
    frame,
    violations,
    report,
    active,
    sessionId,
    startTime,
    error,
    connected,
    begin,
    start,
    endSession,
    checkHealth,
    getReport,
  };
}