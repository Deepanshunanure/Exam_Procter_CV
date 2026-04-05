"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProctor, type ViolationEvent, type FrameData } from "@/lib/proctor-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8765";

function MetricPill({
  label,
  value,
  isAlert,
}: {
  label: string;
  value: number;
  isAlert: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
        isAlert
          ? "bg-red-500/20 text-red-400 border border-red-500/30"
          : "bg-green-500/20 text-green-400 border border-green-500/30"
      }`}
    >
      <span className="text-gray-400">{label}:</span>
      <span>{value.toFixed(2)}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500 hover:bg-red-500 text-white",
    high: "bg-orange-500 hover:bg-orange-500 text-white",
    medium: "bg-yellow-500 hover:bg-yellow-500 text-black",
    low: "bg-blue-500 hover:bg-blue-500 text-white",
  };

  return (
    <Badge className={colors[severity] || "bg-gray-500 text-white"}>
      {severity}
    </Badge>
  );
}

function RiskGauge({ score }: { score: number }) {
  const radius = 60;
  const strokeWidth = 12;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 70) return "#ef4444";
    if (s >= 40) return "#f97316";
    return "#22c55e";
  };

  return (
    <div className="flex flex-col items-center">
      <svg width="150" height="90" viewBox="0 0 150 90">
        {/* Background arc */}
        <path
          d={`M 15 75 A ${radius} ${radius} 0 0 1 135 75`}
          fill="none"
          stroke="#374151"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M 15 75 A ${radius} ${radius} 0 0 1 135 75`}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
        />
        {/* Score text */}
        <text
          x="75"
          y="70"
          textAnchor="middle"
          fill={getColor(score)}
          fontSize="28"
          fontWeight="bold"
        >
          {score}
        </text>
      </svg>
      <span className="text-sm text-gray-400 mt-1">Risk Score</span>
    </div>
  );
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diff = Math.floor((now.getTime() - time.getTime()) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function ExamPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [duration, setDuration] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);

  const {
    frame,
    violations,
    report,
    active,
    sessionId,
    startTime,
    begin,
    start,
    endSession,
  } = useProctor(API_URL);

  // Duration timer
  useEffect(() => {
    if (!active || !startTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setDuration(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [active, startTime]);

  const handleStartExam = useCallback(async () => {
    try {
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Start session
      const session = await begin();
      if (session && videoRef.current) {
        start(videoRef.current);
      }
    } catch (error) {
      console.error("Failed to start exam:", error);
    }
  }, [begin, start]);

  const handleEndExam = useCallback(async () => {
    const finalReport = await endSession();

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (finalReport) {
      setShowReportModal(true);
    }

    setDuration(0);
  }, [endSession]);

  const metrics = frame?.metrics;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT PANEL - Webcam */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {/* Live video feed */}
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Annotated frame overlay */}
                  {frame?.annotated_frame && (
                    <img
                      src={`data:image/jpeg;base64,${frame.annotated_frame}`}
                      alt="Annotated frame"
                      className="absolute inset-0 w-full h-full object-cover opacity-85"
                    />
                  )}
                  {/* Idle state */}
                  {!active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                      <span className="text-gray-400 text-lg">
                        Camera feed will appear here
                      </span>
                    </div>
                  )}
                </div>

                {/* Metrics row */}
                {metrics && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <MetricPill
                      label="EAR"
                      value={metrics.ear}
                      isAlert={metrics.ear < 0.22}
                    />
                    <MetricPill
                      label="MAR"
                      value={metrics.mar}
                      isAlert={metrics.mar > 0.6}
                    />
                    <MetricPill
                      label="Yaw"
                      value={metrics.yaw}
                      isAlert={Math.abs(metrics.yaw) > 30}
                    />
                    <MetricPill
                      label="Pitch"
                      value={metrics.pitch}
                      isAlert={Math.abs(metrics.pitch) > 20}
                    />
                    <MetricPill
                      label="Roll"
                      value={metrics.roll}
                      isAlert={Math.abs(metrics.roll) > 30}
                    />
                  </div>
                )}

                {/* Control buttons */}
                <div className="flex gap-3 mt-4">
                  <Button
                    onClick={handleStartExam}
                    disabled={active}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Start Exam
                  </Button>
                  <Button
                    onClick={handleEndExam}
                    disabled={!active}
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700"
                  >
                    End Exam
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT PANEL - Sidebar */}
          <div className="space-y-4">
            {/* Status Card */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Session Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Session ID</span>
                  <span className="font-mono text-sm">
                    {sessionId ? `${sessionId.slice(0, 8)}...` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Duration</span>
                  <span className="font-mono text-lg">
                    {formatDuration(duration)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Status</span>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        active ? "bg-green-500" : "bg-gray-500"
                      }`}
                    />
                    <span className="text-sm">
                      {active ? "Active" : "Idle"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Alerts */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {frame?.alerts && frame.alerts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {frame.alerts.map((alert, index) => (
                      <SeverityBadge key={index} severity={alert.severity} />
                    ))}
                  </div>
                ) : (
                  <div className="text-green-500 text-sm flex items-center gap-1">
                    No active alerts
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Violation Log */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Violation Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  {violations.length > 0 ? (
                    <div className="space-y-2">
                      {violations.map((violation) => (
                        <div
                          key={violation.id}
                          className="flex items-start gap-2 p-2 rounded bg-gray-800/50"
                        >
                          <SeverityBadge severity={violation.severity} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {violation.type}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {violation.message}
                            </div>
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {formatTimeAgo(violation.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm text-center py-4">
                      No violations recorded
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Risk Score Gauge - shown after session ends */}
            {report && (
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">
                    Final Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center">
                  <RiskGauge score={report.risk_score} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && report && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="bg-gray-900 border-gray-800 max-w-md w-full">
            <CardHeader>
              <CardTitle>Exam Completed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <RiskGauge score={report.risk_score} />
              </div>
              <Separator className="bg-gray-700" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Duration</span>
                  <p className="font-medium">
                    {Math.floor(report.duration_seconds / 60)}m{" "}
                    {report.duration_seconds % 60}s
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Violations</span>
                  <p className="font-medium">{report.violations.length}</p>
                </div>
                <div>
                  <span className="text-gray-400">Frames Analyzed</span>
                  <p className="font-medium">{report.total_frames}</p>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-700"
                  onClick={() => setShowReportModal(false)}
                >
                  Close
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() =>
                    router.push(`/report/${report.session_id}`)
                  }
                >
                  View Full Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
