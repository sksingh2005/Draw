import { GoogleGenAI } from "@google/genai";
import {
  MathAnalysisResult,
  CanvasCoordinates,
  parseMathAnalysisResponse,
  createFallbackResult,
} from "./math-parser";

/**
 * Perform spatial AI analysis on a cropped canvas image and/or equation query
 */
export async function analyzeCanvasContent(params: {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
}): Promise<MathAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  // If no Gemini API key is configured, fallback immediately to local solver engine
  if (!apiKey) {
    console.log("No GEMINI_API_KEY detected. Using intelligent local solver engine.");
    // Simulate short network delay for smooth UX loading state
    await new Promise((res) => setTimeout(res, 800));
    return createFallbackResult(
      params.promptText || "Handwritten Math Equation",
      params.coordinates,
      `sol-${Date.now()}`
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are an elite AI Mathematics & Physics Professor analyzing an interactive canvas selection at specific spatial coordinates.
Examine the provided canvas cropped image and/or text query.

You MUST respond strictly with valid raw JSON (no additional chat commentary) matching this schema:
{
  "classification": "equation" | "calculus" | "geometry" | "physics" | "concept" | "graph",
  "latexFormula": "string in raw LaTeX e.g. x^2 - 5x + 6 = 0",
  "detectedText": "Human readable transcript of the handwriting/drawing",
  "summary": "Concise summary of the problem and approach",
  "keyVariables": [
    { "symbol": "x", "value": "2, 3", "description": "Unknown roots" }
  ],
  "givenData": ["Given information from equation"],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Step title",
      "explanation": "Clear human explanation of this transformation",
      "latex": "LaTeX representation of step",
      "result": "Intermediate outcome"
    }
  ],
  "graphConfig": {
    "functionString": "x^2 - 5*x + 6",
    "title": "Function Curve",
    "domain": [-10, 10],
    "points": [{ "x": 0, "y": 6 }, { "x": 2, "y": 0 }],
    "criticalPoints": [{ "x": 2.5, "y": -0.25, "label": "Vertex" }]
  },
  "conceptExplanation": {
    "title": "Key Concept Title",
    "coreIdea": "Intuitive explanation of the underlying mathematical theorem",
    "realWorldApplication": "Real world physics or engineering application",
    "keyTakeaway": "Remember this rule"
  },
  "practiceProblems": [
    {
      "id": "p1",
      "question": "Try this practice problem",
      "latex": "x^2 - 4 = 0",
      "hint": "Difference of squares",
      "solution": "x = \\pm 2"
    }
  ]
}`;

    const contents: any[] = [];

    // Add image payload if present
    if (params.imageBase64) {
      const base64Data = params.imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: base64Data,
        },
      });
    }

    const userPrompt = `Spatial Canvas Coordinates: [x:${params.coordinates.x}, y:${params.coordinates.y}, width:${params.coordinates.width}, height:${params.coordinates.height}]
${params.promptText ? `User Question / Context: "${params.promptText}"` : "Please analyze the drawn mathematical equation / problem in the canvas crop image."}`;

    contents.push({ text: userPrompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const textOutput = response.text || "";
    return parseMathAnalysisResponse(textOutput, params.coordinates);
  } catch (error) {
    console.error("Gemini API call failed, invoking intelligent local fallback solver:", error);
    return createFallbackResult(
      params.promptText || "Handwritten Math Equation",
      params.coordinates,
      `sol-${Date.now()}`
    );
  }
}
