import { NextRequest, NextResponse } from "next/server";
import {
  analyzeCanvasContent,
  streamAnalyzeCanvasContent,
  type AnalyzeStreamEvent,
} from "@/lib/ai";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageBase64,
      coordinates,
      promptText,
      userApiKey: bodyKey,
      existingElementsSummary,
    } = body;
    const headerKey = req.headers.get("x-gemini-api-key");
    const userApiKey = bodyKey || headerKey || undefined;

    const defaultCoords = { x: 150, y: 150, width: 300, height: 200 };
    const targetCoordinates = coordinates || defaultCoords;

    const params = {
      imageBase64,
      coordinates: targetCoordinates,
      promptText,
      userApiKey,
      existingElementsSummary,
    };

    // ── Realtime SSE path: stream draw events as Gemini generates JSON ──
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
