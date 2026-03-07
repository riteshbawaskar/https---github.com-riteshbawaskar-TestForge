/**
 * Subscribe to a generation job's Server-Sent Events stream.
 * Falls back to polling every 2 s if SSE is unavailable.
 */
import { useEffect, useRef, useState } from "react";
import { jobsApi } from "../api/testcases";

export interface JobEvent {
  id?: string;
  status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
  progress?: string;
  error?: string;
}

export function useJobStream(
  jobId: string | null,
  onComplete: () => void,
  onFail?: (msg: string) => void
) {
  const [event, setEvent] = useState<JobEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Prefer SSE stream
    const es = new EventSource(`/api/v1/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data: JobEvent = JSON.parse(e.data);
        setEvent(data);
        if (data.status === "COMPLETE") {
          es.close();
          onComplete();
        } else if (data.status === "FAILED") {
          es.close();
          onFail?.(data.error ?? "Generation failed");
        }
      } catch { /* ignore parse errors */ }
    };

    // If SSE fails (e.g. nginx not configured), fall back to polling
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    es.onerror = () => {
      es.close();
      pollInterval = setInterval(async () => {
        try {
          const job = await jobsApi.get(jobId);
          setEvent({
            id: job.id,
            status: job.status,
            progress: job.progress_message,
            error: job.error_message,
          });
          if (job.status === "COMPLETE") {
            clearInterval(pollInterval!);
            onComplete();
          } else if (job.status === "FAILED") {
            clearInterval(pollInterval!);
            onFail?.(job.error_message ?? "Generation failed");
          }
        } catch { /* ignore */ }
      }, 2000);
    };

    // Close on "done" SSE event
    es.addEventListener("done", () => es.close());

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId]);

  const cancel = () => {
    esRef.current?.close();
    esRef.current = null;
  };

  return { event, cancel };
}
