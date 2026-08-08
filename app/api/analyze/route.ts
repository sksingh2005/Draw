import { NextRequest, NextResponse } from "next/server";
import {
  analyzeCanvasContent,
  streamAnalyzeCanvasContent,
  type AnalyzeStreamEvent,
  type AnalyzeParams,
} from "@/lib/ai";
import type { CanvasCoordinates } from "@/lib/math-parser";
import type { AnalysisMode } from "@/lib/prompts/whiteboard-professor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsStream(req: NextRequest, body: Record<string, unknown>): boolean {
  if (body.stream === true || body.stream === "true") return true;
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("stream") === "1") return true;
  return false;
}

function encodeSse(event: AnalyzeStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readCoordinates(
  value: unknown,
  fallback: CanvasCoordinates = { x: 150, y: 150, width: 300, height: 200 }
): CanvasCoordinates {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)
    ? { x, y, width, height }
    : fallback;
}

function readMode(value: unknown): AnalysisMode | undefined {
  return value === "full" || value === "followup" || value === "selection" ? value : undefined;
}

function parseBody(body: Record<string, unknown>): AnalyzeParams {
  const defaultCoords = { x: 150, y: 150, width: 300, height: 200 };

  return {
    imageBase64: readString(body.imageBase64),
    coordinates: readCoordinates(body.coordinates, defaultCoords),
    promptText: readString(body.promptText),
    existingElementsSummary: readString(body.existingElementsSummary),
    freeSpaceHints: readString(body.freeSpaceHints),
    selectionSummary: readString(body.selectionSummary),
    suggestedPlacement: body.suggestedPlacement ? readCoordinates(body.suggestedPlacement) : undefined,
    conversationSnippet: readString(body.conversationSnippet),
    mode: readMode(body.mode),
    diagramId: readString(body.diagramId),
    diagramTitle: readString(body.diagramTitle),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const params = parseBody(body);

    // ── Realtime SSE path: stream draw events as OpenAI generates JSON ──
    if (wantsStream(req, body)) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: AnalyzeStreamEvent) => {
            controller.enqueue(encoder.encode(encodeSse(event)));
          };

          try {
            for await (const event of streamAnalyzeCanvasContent(params)) {
              send(event);
            }
          } catch (error: any) {
            send({
              type: "error",
              message: error?.message || "Stream analysis failed",
            });
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── Legacy non-streaming JSON path ──
    const result = await analyzeCanvasContent(params);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("API /api/analyze error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to analyze canvas" },
      { status: 400 }
    );
  }
}
