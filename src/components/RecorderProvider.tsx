import React, { createContext, useContext, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface WorkflowEvent {
  id: string;
  type: string;
  targetId: string;
  targetTag: string;
  targetText: string;
  url: string;
  timestamp: string;
}

interface RecorderContextType {
  events: WorkflowEvent[];
  sessionId: string;
  clearEvents: () => void;
}

const RecorderContext = createContext<RecorderContextType | undefined>(undefined);

export function RecorderProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [sessionId] = useState(() => uuidv4());
  const [isTelemetryEnabled, setIsTelemetryEnabled] = useState(true);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only log meaningful clicks (buttons, links, inputs)
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.tagName === "INPUT" ||
        target.closest("button") ||
        target.closest("a")
      ) {
        const actualTarget = target.closest("button") || target.closest("a") || target;
        const newEvent: WorkflowEvent = {
          id: uuidv4(),
          type: "click",
          targetId: actualTarget.id || "unknown",
          targetTag: actualTarget.tagName.toLowerCase(),
          targetText: actualTarget.textContent?.trim().substring(0, 50) || "",
          url: window.location.pathname,
          timestamp: new Date().toISOString(),
        };

        setEvents((prev) => [...prev, newEvent]);
        
        // Send to our anonymous serverless function if enabled
        if (isTelemetryEnabled) {
          fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, event: newEvent }),
          })
          .then(res => {
            if (res.status === 404) {
              // Backend doesn't exist (e.g., GitHub Pages), disable telemetry to prevent network spam
              setIsTelemetryEnabled(false);
            }
          })
          .catch(console.error);
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [sessionId, isTelemetryEnabled]);

  return (
    <RecorderContext.Provider value={{ events, sessionId, clearEvents: () => setEvents([]) }}>
      {children}
    </RecorderContext.Provider>
  );
}

export function useRecorder() {
  const context = useContext(RecorderContext);
  if (!context) {
    throw new Error("useRecorder must be used within a RecorderProvider");
  }
  return context;
}
