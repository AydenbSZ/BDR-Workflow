import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

import contactsRouter from "./routes/contacts.js";
import emailsRouter from "./routes/emails.js";
import enrollmentRouter from "./routes/enrollment.js";
import triggersRouter from "./routes/triggers.js";
import configRouter from "./routes/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ["http://localhost:5173", "https://app.hubspot.com"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

app.use("/api/contacts", contactsRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/enrollment", enrollmentRouter);
app.use("/api/triggers", triggersRouter);
app.use("/api/config", configRouter);

// Serve built frontend in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`\nSiteZeus Outreach Platform API running at:`);
  console.log(`→ http://localhost:${PORT}\n`);
});
