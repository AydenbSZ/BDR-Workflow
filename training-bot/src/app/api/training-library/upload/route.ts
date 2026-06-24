import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDocument, chunkText } from "@/lib/documents/parser";
import { embedText } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const persona = formData.get("persona") as string | null;
    const tagsStr = formData.get("tags") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const content = await parseDocument(buffer, file.name);

    if (!content || content.trim().length < 10) {
      return NextResponse.json(
        { error: "File appears empty or could not be parsed" },
        { status: 400 }
      );
    }

    const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()) : [];

    const doc = await db.knowledgeDocument.create({
      data: {
        sourceType: "UPLOADED_DOC",
        title: title || file.name,
        content,
        persona: persona as "CHIEF_DEVELOPMENT_OFFICER" | "DIRECTOR_OF_REAL_ESTATE" | "DIRECTOR_OF_FRANCHISE_DEVELOPMENT" | "OTHER" | null,
        tags,
      },
    });

    const chunks = chunkText(content);

    for (const chunkContent of chunks) {
      const embedding = await embedText(chunkContent);

      await db.knowledgeChunk.create({
        data: {
          documentId: doc.id,
          content: chunkContent,
          persona: doc.persona,
          tags: doc.tags,
        },
      });

      if (embedding) {
        await db.$executeRawUnsafe(
          `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = (SELECT id FROM "KnowledgeChunk" WHERE "documentId" = $2 ORDER BY "createdAt" DESC LIMIT 1)`,
          `[${embedding.join(",")}]`,
          doc.id
        );
      }
    }

    return NextResponse.json({
      document: doc,
      chunksCreated: chunks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
