import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, "..", "..");
const RULES_PATH = path.join(BASE_DIR, "rules", "rules.md");
const EXAMPLES_DIR = path.join(BASE_DIR, "rules", "examples");
const CLIENTS_PATH = path.join(BASE_DIR, "context", "current_clients.md");

const router = Router();

router.get("/rules", (req, res) => {
  try {
    const content = fs.readFileSync(RULES_PATH, "utf-8");
    res.json({ content });
  } catch {
    res.json({ content: "" });
  }
});

router.post("/rules", (req, res) => {
  const content = req.body.content || "";
  fs.mkdirSync(path.dirname(RULES_PATH), { recursive: true });
  fs.writeFileSync(RULES_PATH, content, "utf-8");
  res.json({ ok: true });
});

router.get("/clients", (req, res) => {
  try {
    const content = fs.readFileSync(CLIENTS_PATH, "utf-8");
    res.json({ content });
  } catch {
    res.json({ content: "" });
  }
});

router.post("/clients", (req, res) => {
  const content = req.body.content || "";
  fs.mkdirSync(path.dirname(CLIENTS_PATH), { recursive: true });
  fs.writeFileSync(CLIENTS_PATH, content, "utf-8");
  res.json({ ok: true });
});

router.get("/examples", (req, res) => {
  fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
  const examples = fs.readdirSync(EXAMPLES_DIR)
    .filter(f => f.endsWith(".txt") || f.endsWith(".md"))
    .sort()
    .map(f => ({
      filename: f,
      content: fs.readFileSync(path.join(EXAMPLES_DIR, f), "utf-8"),
    }));
  res.json(examples);
});

router.post("/examples/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[\w\-. ]+\.(txt|md)$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const content = req.body.content || "";
  fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXAMPLES_DIR, filename), content, "utf-8");
  res.json({ ok: true });
});

router.delete("/examples/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[\w\-. ]+\.(txt|md)$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = path.join(EXAMPLES_DIR, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

export default router;
