import type { MathAnalysisResult, AiCanvasElement, CanvasCoordinates } from "./math-parser";

export type ClientStreamEvent =
  | { type: "status"; message: string }
  | { type: "draw"; element: AiCanvasElement; index: number }
  | { type: "result"; data: MathAnalysisResult }
  | { type: "error"; message: string };

export interface AnalyzeStreamParams {
  imageBase64?: string;
  coordinates?: CanvasCoordinates;
  promptText?: string;
  userApiKey?: string;
  existingElementsSummary?: string;
  signal?: AbortSignal;
  onEvent: (event: ClientStreamEvent) => void | Promise<void>;
}

/**
 * Call /api/analyze with SSE streaming. Invokes onEvent for each server event.
 * Falls back to non-streaming JSON if the response is not event-stream.
 */
export async function streamAnalyze(
  params: AnalyzeStreamParams
): Promise<MathAnalysisResult | null> {
  const res = await fetch("/api/analyze?stream=1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-gemini-api-key": params.userApiKey || "",
    },
    body: JSON.stringify({
      imageBase64: params.imageBase64,
      coordinates: params.coordinates || { x: 100, y: 100, width: 400, height: 300 },
      promptText: params.promptText,
      userApiKey: params.userApiKey,
      existingElementsSummary: params.existingElementsSummary,
      stream: true,
    }),
    signal: params.signal,
  });

  const contentType = res.headers.get("content-type") || "";

  // Fallback: classic JSON response
  if (!contentType.includes("text/event-stream")) {
    const json = await res.json();
    if (json.success && json.data) {
      const data = json.data as MathAnalysisResult;
      // Emit drawings sequentially for progressive UX even on fallback
      if (data.canvasDrawings) {
        for (let i = 0; i < data.canvasDrawings.length; i++) {
          await params.onEvent({
            type: "draw",
            element: data.canvasDrawings[i],
            index: i,
          });
        }
      }
      await params.onEvent({ type: "result", data });
      return data;
    }
    const msg = json.error || "Analysis failed";
    await params.onEvent({ type: "error", message: msg });
    throw new Error(msg);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    const msg = text || `Stream request failed (${res.status})`;
    await params.onEvent({ type: "error", message: msg });
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: MathAnalysisResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;

      const payload = line.replace(/^data:\s*/, "");
      if (!payload || payload === "[DONE]") continue;

      try {
        const event = JSON.parse(payload) as ClientStreamEvent;
        await params.onEvent(event);
        if (event.type === "result") finalResult = event.data;
        if (event.type === "error") throw new Error(event.message);
      } catch (err: any) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }

  return finalResult;
}
