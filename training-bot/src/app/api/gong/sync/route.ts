import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { syncGongCalls } from "@/lib/gong/sync";
import { isGongConfigured } from "@/lib/gong/client";

const SyncSchema = z.object({
  fromDateTime: z.string().optional(),
  toDateTime: z.string().optional(),
  maxCalls: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);

    if (!isGongConfigured()) {
      return NextResponse.json(
        {
          error:
            "Gong is not configured. Add GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET to .env",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const data = SyncSchema.parse(body);

    const result = await syncGongCalls(data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
