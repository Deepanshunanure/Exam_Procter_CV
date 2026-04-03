"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SessionReport, ViolationEvent } from "@/lib/proctor-client";

const API_URL = "http://localhost:8765";

type SortKey = "timestamp" | "type" | "severity";
type SortOrder = "asc" | "desc";

const severityOrder: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const severityColors: Record<string, string> = {
  critical: "bg-red-500 hover:bg-red-500 text-white",
  high: "bg-orange-500 hover:bg-orange-500 text-white",
  medium: "bg-yellow-500 hover:bg-yellow-500 text-black",
  low: "bg-blue-500 hover:bg-blue-500 text-white",
};

const chartColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge className={severityColors[severity] || "bg-gray-500 text-white"}>
      {severity}
    </Badge>
  );
}

function RiskScoreDisplay({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 70) return "text-red-500";
    if (s >= 40) return "text-orange-500";
    return "text-green-500";
  };

  const getBgColor = (s: number) => {
    if (s >= 70) return "bg-red-500/10 border-red-500/30";
    if (s >= 40) return "bg-orange-500/10 border-orange-500/30";
    return "bg-green-500/10 border-green-500/30";
  };

  const getLabel = (s: number) => {
    if (s >= 70) return "High Risk";
    if (s >= 40) return "Moderate Risk";
    return "Low Risk";
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 rounded-xl border ${getBgColor(
        score
      )}`}
    >
      <span className={`text-6xl font-bold ${getColor(score)}`}>{score}</span>
      <span className="text-gray-400 text-lg mt-2">{getLabel(score)}</span>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch(
          `${API_URL}/session/${sessionId}/report`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch report");
        }
        const data: SessionReport = await response.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, [sessionId]);

  const chartData = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.violation_summary).map(([type, count]) => ({
      type,
      count,
      color: chartColors[type] || "#6b7280",
    }));
  }, [report]);

  const sortedViolations = useMemo(() => {
    if (!report) return [];

    return [...report.violations].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "timestamp":
          comparison =
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case "type":
          comparison = a.type.localeCompare(b.type);
          break;
        case "severity":
          comparison =
            (severityOrder[a.severity] || 0) -
            (severityOrder[b.severity] || 0);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [report, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const handleDownloadJSON = () => {
    if (!report) return;

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proctoring-report-${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-400">Loading report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <Card className="bg-gray-900 border-gray-800 max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-400 mb-4">{error || "Report not found"}</p>
            <Button
              variant="outline"
              className="border-gray-700"
              onClick={() => router.push("/")}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Session Report</h1>
            <p className="text-gray-400 font-mono text-sm mt-1">
              {report.session_id}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-gray-700"
              onClick={() => router.push("/")}
            >
              Back to Home
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleDownloadJSON}
            >
              Download JSON
            </Button>
          </div>
        </div>

        {/* Top row - Metadata and Risk Score */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Session Metadata */}
          <Card className="bg-gray-900 border-gray-800 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Session Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <span className="text-gray-400 text-sm">Started</span>
                  <p className="font-medium mt-1">
                    {formatDate(report.started_at)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Ended</span>
                  <p className="font-medium mt-1">
                    {formatDate(report.ended_at)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Duration</span>
                  <p className="font-medium mt-1">
                    {formatDuration(report.duration_seconds)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Total Frames</span>
                  <p className="font-medium mt-1">
                    {report.total_frames.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Score */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg">Risk Score</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <RiskScoreDisplay score={report.risk_score} />
            </CardContent>
          </Card>
        </div>

        {/* Violation Summary Chart */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg">Violation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" />
                  <YAxis
                    dataKey="type"
                    type="category"
                    stroke="#9ca3af"
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No violations recorded
              </div>
            )}
          </CardContent>
        </Card>

        {/* Violations Table */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg">
              All Violations ({report.violations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th
                      className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("timestamp")}
                    >
                      Time{" "}
                      {sortKey === "timestamp" &&
                        (sortOrder === "asc" ? "^" : "v")}
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("type")}
                    >
                      Type{" "}
                      {sortKey === "type" && (sortOrder === "asc" ? "^" : "v")}
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("severity")}
                    >
                      Severity{" "}
                      {sortKey === "severity" &&
                        (sortOrder === "asc" ? "^" : "v")}
                    </th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedViolations.length > 0 ? (
                    sortedViolations.map((violation) => (
                      <tr
                        key={violation.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30"
                      >
                        <td className="py-3 px-4 font-mono text-sm">
                          {formatDate(violation.timestamp)}
                        </td>
                        <td className="py-3 px-4">{violation.type}</td>
                        <td className="py-3 px-4">
                          <SeverityBadge severity={violation.severity} />
                        </td>
                        <td className="py-3 px-4 text-gray-300">
                          {violation.message}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-gray-500"
                      >
                        No violations recorded during this session
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
