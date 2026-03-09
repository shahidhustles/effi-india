import { useState, useCallback } from "react";
import { AGENT_API_URL, type DepartmentId } from "../constants/config";

export interface ConnectionDetails {
  token: string;
  serverUrl: string;
  roomName: string;
  department: DepartmentId;
  language: string;
}

export type ConnectionState = "idle" | "fetching" | "ready" | "error";

export function useConnection() {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(
    async (department: DepartmentId, language: string = "en"): Promise<ConnectionDetails | null> => {
      setState("fetching");
      setError(null);

      try {
        const response = await fetch(`${AGENT_API_URL}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department, language }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Token server error ${response.status}: ${body}`);
        }

        const data = (await response.json()) as ConnectionDetails;
        setConnectionDetails(data);
        setState("ready");
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setState("error");
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setConnectionDetails(null);
    setState("idle");
    setError(null);
  }, []);

  return { connectionDetails, state, error, connect, reset };
}
