import mammoth from "mammoth";

export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function parsePdf(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = (mod as any).default || mod;
  const result = await pdfParse(buffer);
  return result.text;
}

export function parseTxt(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

export async function parseDocument(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "docx":
      return parseDocx(buffer);
    case "pdf":
      return parsePdf(buffer);
    case "txt":
    case "md":
      return parseTxt(buffer);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

export function chunkText(
  text: string,
  maxChunkSize = 1000,
  overlap = 200
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      const words = current.split(" ");
      const overlapWords = words.slice(
        Math.max(0, words.length - Math.ceil(overlap / 5))
      );
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
