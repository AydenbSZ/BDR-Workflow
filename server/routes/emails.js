import { Router } from "express";
import { processSingleContact } from "../services/emailGenerator.js";

const router = Router();

const jobs = new Map();

router.post("/generate", async (req, res) => {
  const contactIds = req.body.contact_ids || [];
  if (!contactIds.length) return res.status(400).json({ error: "No contact_ids provided" });
  if (contactIds.length > 20) return res.status(400).json({ error: "Maximum 20 contacts per batch" });

  const jobId = crypto.randomUUID();
  const events = [];
  let done = false;

  jobs.set(jobId, { events, done: false });

  (async () => {
    const concurrency = 4;
    let i = 0;

    async function processNext() {
      while (i < contactIds.length) {
        const cid = contactIds[i++];
        const result = await processSingleContact(cid, {
          onProgress: (contactId, step) => {
            events.push({ type: "progress", contact_id: contactId, step });
          },
        });
        events.push({ type: "result", contact_id: cid, result });
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(concurrency, contactIds.length); w++) {
      workers.push(processNext());
    }
    await Promise.all(workers);
    events.push({ type: "done" });
    const job = jobs.get(jobId);
    if (job) job.done = true;
  })();

  res.json({ job_id: jobId });
});

router.get("/stream/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let cursor = 0;

  const interval = setInterval(() => {
    while (cursor < job.events.length) {
      const event = job.events[cursor++];
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === "done") {
        clearInterval(interval);
        jobs.delete(req.params.jobId);
        res.end();
        return;
      }
    }
  }, 200);

  const timeout = setTimeout(() => {
    clearInterval(interval);
    res.write('data: {"type": "done"}\n\n');
    jobs.delete(req.params.jobId);
    res.end();
  }, 120000);

  req.on("close", () => {
    clearInterval(interval);
    clearTimeout(timeout);
    jobs.delete(req.params.jobId);
  });
});

router.post("/regenerate", async (req, res) => {
  const contactId = (req.body.contact_id || "").trim();
  if (!contactId) return res.status(400).json({ error: "No contact_id provided" });
  const extraContext = (req.body.extra_context || "").trim();
  try {
    const result = await processSingleContact(contactId, { extraContext });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
