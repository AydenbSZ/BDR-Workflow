import { describe, it, expect } from "vitest";
import { chunkText, parseTxt } from "@/lib/documents/parser";

describe("parseTxt", () => {
  it("parses a text buffer", () => {
    const buf = Buffer.from("Hello world. This is a test document.");
    const result = parseTxt(buf);
    expect(result).toBe("Hello world. This is a test document.");
  });
});

describe("chunkText", () => {
  it("splits text into chunks", () => {
    const text =
      "First sentence here. Second sentence here. Third sentence here. Fourth sentence here. Fifth sentence here.";
    const chunks = chunkText(text, 60, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("returns single chunk for short text", () => {
    const text = "Short text.";
    const chunks = chunkText(text, 1000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Short text.");
  });

  it("handles empty text", () => {
    const chunks = chunkText("", 1000, 200);
    expect(chunks).toHaveLength(0);
  });
});
