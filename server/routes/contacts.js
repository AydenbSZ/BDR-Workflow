import { Router } from "express";
import { searchContacts, getContactBasic, getPortalId } from "../services/hubspot.js";

const router = Router();

router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const results = await searchContacts(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal-id", async (req, res) => {
  const pid = await getPortalId();
  res.json({ portal_id: pid });
});

// Chrome extension push
const pushedContacts = [];

router.post("/push", async (req, res) => {
  const contactId = String(req.body.contact_id || "").trim();
  if (!contactId) return res.status(400).json({ error: "No contact_id" });
  const contact = await getContactBasic(contactId);
  pushedContacts.push(contact);
  res.json({ ok: true, contact });
});

router.get("/pushed", (req, res) => {
  const contacts = [...pushedContacts];
  pushedContacts.length = 0;
  res.json(contacts);
});

export default router;
