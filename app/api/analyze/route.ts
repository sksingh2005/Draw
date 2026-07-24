import { NextRequest, NextResponse } from "next/server";
import { analyzeCanvasContent } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, coordinates, promptText, userApiKey: bodyKey } = body;
    const headerKey = req.headers.get("x-gemini-api-key");
    const userApiKey = bodyKey || headerKey || undefined;

    const defaultCoords = { x: 150, y: 150, width: 300, height: 200 };
    const targetCoordinates = coordinates || defaultCoords;

    const result = await analyzeCanvasContent({
      imageBase64,
      coordinates: targetCoordinates,
      promptText,
      userApiKey,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("API /api/analyze error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to analyze canvas" },
      { status: 400 }
    );
  }
}
