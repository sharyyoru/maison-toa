import { NextResponse } from "next/server";
import { processWorkflowJobs } from "@/lib/workflows/engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await processWorkflowJobs(50));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow worker failed" }, { status: 500 }); }
}

export async function POST(request: Request) { return GET(request); }
