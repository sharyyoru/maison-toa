import { NextRequest, NextResponse } from "next/server";
import { generateContentWithFallback } from "@/lib/geminiWithFallback";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in environment variables");
}

type ExtractedTask = {
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  assignee: string;
  dueDate: string | null;
};

// ISO date (YYYY-MM-DD) validation
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key is not configured" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size (max 20MB to accommodate multi-page PDFs)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    // Validate file type. Gemini 2.x accepts PDFs natively as inline data and
    // processes every page, so we support multi-page documents too.
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an image (JPEG, PNG, WebP, GIF) or a PDF." },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type;

    // Today's date so the model can resolve relative due dates like "next week".
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const todayHuman = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const systemInstruction = `You are an expert project manager. Your job is to analyze the provided document (which may be an image or a multi-page PDF of notes, a whiteboard, a letter, or a form). Extract all actionable items across every page. For each item, generate a concise title, a brief description, assign a priority (High, Medium, Low), and extract a due date if one is mentioned or clearly implied. The default assignee for all tasks must be 'Alice'. You must return the output STRICTLY as a JSON array of objects with the keys: title, description, priority, assignee, and dueDate.`;

    const prompt = `Today's date is ${todayHuman} (${todayIso}). Analyze this document and extract all actionable tasks across all pages. Resolve any relative dates (e.g. "tomorrow", "next week", "by Friday", "in 3 days") into an absolute calendar date relative to today.

Return a JSON array with the following structure:
[
  {
    "title": "Task title (concise)",
    "description": "Brief description of what needs to be done",
    "priority": "High" | "Medium" | "Low",
    "assignee": "Alice",
    "dueDate": "YYYY-MM-DD or null"
  }
]

Rules for dueDate:
- Use the strict format YYYY-MM-DD.
- If no due date is mentioned or implied for a task, set dueDate to null.
- Never invent a date that is not supported by the document.

If no actionable items are found, return an empty array [].`;

    // Use the shared helper which handles model fallback (gemini-2.0-flash and
    // newer — 1.5 models are deprecated and 404), retries, and rate limits.
    const result = await generateContentWithFallback({
      apiKey: GEMINI_API_KEY,
      systemInstruction,
      generationConfig: { responseMimeType: "application/json" },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType } },
          ],
        },
      ],
    });
    const response = result.response;
    const text = response.text();

    // Clean the response - remove markdown code blocks if present
    const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();

    // Parse JSON safely
    let tasks: ExtractedTask[];
    try {
      tasks = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", cleanedText);
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 500 }
      );
    }

    // Validate the structure
    if (!Array.isArray(tasks)) {
      return NextResponse.json(
        { error: "Invalid response format from AI" },
        { status: 500 }
      );
    }

    // Validate each task has required fields and normalise the due date.
    const validTasks: ExtractedTask[] = tasks
      .filter(
        (task) =>
          typeof task.title === "string" &&
          typeof task.description === "string" &&
          ["High", "Medium", "Low"].includes(task.priority) &&
          typeof task.assignee === "string"
      )
      .map((task) => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        assignee: task.assignee,
        dueDate: isValidIsoDate(task.dueDate) ? task.dueDate : null,
      }));

    return NextResponse.json({ tasks: validTasks });
  } catch (error) {
    console.error("Error analyzing scan:", error);
    return NextResponse.json(
      { error: "Failed to analyze image. Please try again." },
      { status: 500 }
    );
  }
}
