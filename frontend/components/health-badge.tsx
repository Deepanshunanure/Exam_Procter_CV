"use client";

import { useEffect, useState } from "react";
import type { HealthStatus } from "@/lib/proctor-client";

const API_URL = "http://localhost:8765";

function StatusDot({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${
          active ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}

export function HealthBadge() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [apiOnline, setApiOnline] = useState(false);

  useEffect(() => {
    async function checkHealth() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
          const data: HealthStatus = await response.json();
          setHealth(data);
          setApiOnline(true);
        } else {
          setApiOnline(false);
          setHealth(null);
        }
      } catch {
        setApiOnline(false);
        setHealth(null);
      }
    }

    // Initial check
    checkHealth();

    // Poll every 10 seconds
    const interval = setInterval(checkHealth, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
      <StatusDot active={apiOnline} label="API" />
      <StatusDot active={health?.mediapipe ?? false} label="MediaPipe" />
      <StatusDot active={health?.yolo ?? false} label="YOLO" />
      {health && (
        <div className="flex items-center gap-1.5 pl-2 border-l border-gray-700">
          <span className="text-xs text-gray-400">Sessions:</span>
          <span className="text-xs font-medium text-white">
            {health.active_sessions}
          </span>
        </div>
      )}
    </div>
  );
}
