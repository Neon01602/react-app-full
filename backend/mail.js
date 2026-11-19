const express = require("express");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const router = express.Router();
const ses = new SESv2Client({ region: process.env.AWS_REGION || "eu-north-1" });
const DOMAIN = String(process.env.LUMA_MAIL_DOMAIN || "").toLowerCase();

function addresses(value) {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v || "").trim().toLowerCase()).filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}
function jsonArray(value) {
  if (!value) return [];
  try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return []; }
}
function publicMessage(row) {
  return {
    id: row.id, direction: row.direction, folder: row.folder,
    from: row.from_address, to: jsonArray(row.to_json), cc: jsonArray(row.cc_json),
    subject: row.subject, text: row.text_body, html: row.html_body,
    status: row.status, isRead: Boolean(row.is_read),
    sentAt: row.sent_at, receivedAt: row.received_at, createdAt: row.created_at
  };
}

module.exports = function registerMailRoutes(app, { pool, authRequired }) {
  router.use(authRequired);

  router.get("/account", async (req, res) => {
    try {
      if (!DOMAIN || !/^[a-z0-9.-]+$/.test(DOMAIN)) return res.status(503).json({ message: "Set LUMA_MAIL_DOMAIN to your verified email domain." });
      const address = String(req.user.id) + "@" + DOMAIN;
      await pool.execute("UPDATE users SET luma_email = COALESCE(luma_email, ?) WHERE id = ?", [address, req.user.id]);
      const [rows] = await pool.execute("SELECT luma_email FROM users WHERE id = ?", [req.user.id]);
      res.json({ email: rows[0].luma_email });
    } catch (e) { console.error("Mailbox account:", e); res.status(500).json({ message: "Could not load Luma address." }); }
  });

  router.get("/messages", async (req, res) => {
    try {
      const folder = ["inbox", "sent", "drafts"].includes(req.query.folder) ? req.query.folder : "inbox";
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      const [rows] = await pool.execute(
        "SELECT id,direction,folder,from_address,to_json,cc_json,subject,text_body,html_body,status,is_read,sent_at,received_at,created_at FROM mail_messages WHERE user_id=? AND folder=? ORDER BY COALESCE(sent_at,received_at,created_at) DESC LIMIT ?",
        [req.user.id, folder, limit]
      );
      res.json({ messages: rows.map(publicMessage) });
    } catch (e) { console.error("Mailbox list:", e); res.status(500).json({ message: "Could not load mailbox." }); }
  });

  router.get("/messages/:id", async (req, res) => {
    try {
      const [rows] = await pool.execute("SELECT * FROM mail_messages WHERE id=? AND user_id=?", [req.params.id, req.user.id]);
      if (!rows.length) return res.status(404).json({ message: "Message not found." });
      await pool.execute("UPDATE mail_messages SET is_read=TRUE WHERE id=? AND user_id=?", [req.params.id, req.user.id]);
      res.json({ message: publicMessage(rows[0]) });
    } catch (e) { console.error("Message read:", e); res.status(500).json({ message: "Could not load message." }); }
  });

  router.post("/send", async (req, res) => {
    try {
      if (!DOMAIN || !/^[a-z0-9.-]+$/.test(DOMAIN)) return res.status(503).json({ message: "Set LUMA_MAIL_DOMAIN to your verified email domain." });
      const [users] = await pool.execute("SELECT id,luma_email FROM users WHERE id=?", [req.user.id]);
      if (!users.length || !users[0].luma_email) return res.status(409).json({ message: "Your Luma email address has not been provisioned yet." });
      const to = addresses(req.body.to), cc = addresses(req.body.cc), bcc = addresses(req.body.bcc);
      const subject = String(req.body.subject || "").trim();
      const text = String(req.body.text || "");
      const html = String(req.body.html || "");
      if (!to.length && !cc.length && !bcc.length) return res.status(400).json({ message: "Add at least one recipient." });
      if (subject.length > 998 || text.length > 100000 || html.length > 100000) return res.status(400).json({ message: "Message is too large." });
      const from = users[0].luma_email;
      const destination = [...new Set([...to, ...cc, ...bcc])];
      const command = new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: to, CcAddresses: cc, BccAddresses: bcc },
        Content: { Simple: { Subject: { Data: subject || "(no subject)", Charset: "UTF-8" }, Body: {
          ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
          ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {})
        } } }
      });
      const sent = await ses.send(command);
      const [result] = await pool.execute(
        "INSERT INTO mail_messages (user_id,provider_message_id,direction,folder,from_address,to_json,cc_json,bcc_json,subject,text_body,html_body,status,sent_at) VALUES (?,?,'outbound','sent',?,?,?,?,?,?,?,'sent',NOW())",
        [req.user.id, sent.MessageId || null, from, JSON.stringify(to), JSON.stringify(cc), JSON.stringify(bcc), subject, text, html]
      );
      res.status(202).json({ message: "Email accepted by Amazon SES.", id: result.insertId, providerMessageId: sent.MessageId });
    } catch (e) {
      console.error("SES send error:", e);
      res.status(502).json({ message: "Email could not be sent. Check SES identity, production access, and IAM permissions." });
    }
  });

  router.post("/drafts", async (req, res) => {
    try {
      const [users] = await pool.execute("SELECT luma_email FROM users WHERE id=?", [req.user.id]);
      if (!users.length || !users[0].luma_email) return res.status(409).json({ message: "Luma email address is not provisioned." });
      const to = addresses(req.body.to), cc = addresses(req.body.cc), bcc = addresses(req.body.bcc);
      const [result] = await pool.execute(
        "INSERT INTO mail_messages (user_id,direction,folder,from_address,to_json,cc_json,bcc_json,subject,text_body,html_body,status) VALUES (?,'outbound','drafts',?,?,?,?,?,?,?,'draft')",
        [req.user.id, users[0].luma_email, JSON.stringify(to), JSON.stringify(cc), JSON.stringify(bcc), String(req.body.subject || "").slice(0,998), String(req.body.text || ""), String(req.body.html || "")]
      );
      res.status(201).json({ id: result.insertId, message: "Draft saved." });
    } catch (e) { console.error("Draft save:", e); res.status(500).json({ message: "Could not save draft." }); }
  });

  router.patch("/messages/:id/read", async (req, res) => {
    try {
      await pool.execute("UPDATE mail_messages SET is_read=? WHERE id=? AND user_id=?", [Boolean(req.body.isRead), req.params.id, req.user.id]);
      res.json({ message: "Read status updated." });
    } catch (e) { res.status(500).json({ message: "Could not update message." }); }
  });

  app.use("/api/mail", router);
};
