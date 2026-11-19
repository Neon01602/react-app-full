import { useEffect, useState } from "react";

const empty = { to: "", cc: "", bcc: "", subject: "", text: "" };
const split = value => value.split(",").map(v => v.trim()).filter(Boolean);

export default function MailWorkspace({ request, user }) {
  const [folder, setFolder] = useState("inbox");
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(nextFolder = folder) {
    setError("");
    try {
      const [box, account] = await Promise.all([
        request("/mail/messages?folder=" + nextFolder),
        request("/mail/account")
      ]);
      setMessages(box.messages || []);
      setAddress(account.email || "");
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(folder); }, [folder]);

  async function send(e) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request("/mail/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: split(draft.to), cc: split(draft.cc), bcc: split(draft.bcc),
          subject: draft.subject, text: draft.text
        })
      });
      setNotice("Email accepted by Amazon SES.");
      setDraft(empty); setCompose(false); setFolder("sent"); await load("sent");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    setBusy(true); setError(""); setNotice("");
    try {
      await request("/mail/drafts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: split(draft.to), cc: split(draft.cc), bcc: split(draft.bcc),
          subject: draft.subject, text: draft.text
        })
      });
      setNotice("Draft saved."); setCompose(false); setFolder("drafts"); await load("drafts");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function openMessage(id) {
    try {
      const data = await request("/mail/messages/" + id);
      setSelected(data.message);
      await load(folder);
    } catch (e) { setError(e.message); }
  }

  return <section className="mail-workspace">
    <div className="mail-heading">
      <div><p className="eyebrow">LUMA MAIL</p><h1>Mail</h1><p className="subtext">Your Luma mailbox: <strong>{address || "Setting up…"}</strong></p></div>
      <button className="primary mail-compose" onClick={() => { setSelected(null); setCompose(true); }}>＋ Compose</button>
    </div>
    {notice && <p className="notice success-notice">{notice}</p>}
    {error && <p className="notice error-notice">{error}</p>}
    <div className="mail-layout">
      <nav className="mail-folders">
        {["inbox", "sent", "drafts"].map(item => <button key={item} className={folder === item ? "active" : ""} onClick={() => { setSelected(null); setFolder(item); }}>{item === "inbox" ? "▣" : item === "sent" ? "➤" : "▤"} <span>{item[0].toUpperCase()+item.slice(1)}</span></button>)}
        <small>Signed in as {user.email}</small>
      </nav>
      <div className="mail-list">
        {messages.length === 0 ? <div className="mail-empty">No messages in {folder}.</div> : messages.map(message => <button key={message.id} className={"mail-row " + (message.isRead ? "" : "unread")} onClick={() => openMessage(message.id)}>
          <strong>{message.from}</strong><span>{message.subject || "(no subject)"}</span><small>{message.text || ""}</small>
        </button>)}
      </div>
      <article className="mail-reader">
        {compose ? <form onSubmit={send} className="mail-compose-form">
          <div className="mail-reader-head"><strong>New message</strong><button type="button" onClick={() => setCompose(false)}>×</button></div>
          {["to","cc","bcc","subject"].map(field => <label key={field}>{field.toUpperCase()}<input value={draft[field]} onChange={e => setDraft(v => ({...v,[field]:e.target.value}))} placeholder={field === "subject" ? "Subject" : "Separate addresses with commas"} /></label>)}
          <label>Message<textarea rows="9" value={draft.text} onChange={e => setDraft(v => ({...v,text:e.target.value}))} placeholder="Write your message…" /></label>
          <div className="mail-actions"><button type="button" className="danger-button" disabled={busy} onClick={saveDraft}>Save draft</button><button className="primary" disabled={busy}>{busy ? "Sending…" : "Send email →"}</button></div>
          <small>Attachments and rich-text formatting will be added in a later iteration.</small>
        </form> : selected ? <div className="mail-message">
          <h2>{selected.subject || "(no subject)"}</h2><p><strong>From:</strong> {selected.from}</p><p><strong>To:</strong> {(selected.to || []).join(", ")}</p>{selected.cc?.length > 0 && <p><strong>CC:</strong> {selected.cc.join(", ")}</p>}<hr/><div>{selected.text || "No plain-text body."}</div>
        </div> : <div className="mail-empty">Select a message or compose a new email.</div>}
      </article>
    </div>
  </section>;
}
