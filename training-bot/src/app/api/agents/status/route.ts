import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAllAgentStatuses } from "@/lib/agents/runner";

export async function GET() {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const statuses = await getAllAgentStatuses();
    return NextResponse.json({ agents: statuses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
