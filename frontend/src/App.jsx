import { useEffect, useState } from "react";

const API = "/api";
const blank = { name: "", email: "", phone: "", bio: "", password: "" };

export default function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(blank);
  const [edit, setEdit] = useState({ name: "", email: "", phone: "", bio: "" });
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      credentials: "include", ...options,
      headers: { ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Something went wrong.");
    return data;
  }
  function acceptUser(u) {
    setUser(u);
    setEdit({ name: u.name || "", email: u.email || "", phone: u.phone || "", bio: u.bio || "" });
  }
  useEffect(() => { request("/me").then(d => acceptUser(d.user)).catch(() => {}); }, []);
  function updateForm(e) { setForm(v => ({ ...v, [e.target.name]: e.target.value })); }

  async function submit(e) {
    e.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const data = await request(mode === "login" ? "/login" : "/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : form)
      });
      acceptUser(data.user); setMessage(data.message); setForm(blank);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  async function save(e) {
    e.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const d = await request("/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
      acceptUser(d.user); setMessage(d.message);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  async function avatar(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setError(""); setMessage(""); setLoading(true);
    try {
      const body = new FormData(); body.append("avatar", file);
      const d = await request("/me/avatar", { method: "POST", body });
      acceptUser(d.user); setMessage(d.message);
    } catch (err) { setError(err.message); } finally { setLoading(false); e.target.value = ""; }
  }
  async function logout() {
    try { const d = await request("/logout", { method: "POST" }); setUser(null); setMode("login"); setMessage(d.message); }
    catch (err) { setError(err.message); }
  }
  async function removeAccount() {
    if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
    setError(""); setMessage(""); setLoading(true);
    try { const d = await request("/me", { method: "DELETE" }); setUser(null); setForm(blank); setMode("login"); setMessage(d.message); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  if (user) return (
    <main className="page">
      <section className="panel dashboard">
        <div className="dashboard-head">
          <div><div className="brand-mark">L</div><p className="eyebrow">YOUR ACCOUNT</p><h1>Welcome, {user.name}.</h1><p className="subtext">Manage your profile and account details.</p></div>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
        <div className="profile">
          {user.profile_image_url ? <img className="avatar avatar-image" src={user.profile_image_url} alt="Profile" /> : <span className="avatar">{user.name?.charAt(0)?.toUpperCase()}</span>}
          <div><strong>{user.name}</strong><span>{user.email}</span></div>
        </div>
        <label className="upload-label">Profile picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={avatar} disabled={loading} /></label>
        <form onSubmit={save} className="edit-form">
          <h2>Edit your details</h2>
          <label>Full name<input name="name" value={edit.name} onChange={e => setEdit(v => ({ ...v, name: e.target.value }))} required minLength="2" maxLength="80" /></label>
          <label>Email address<input name="email" type="email" value={edit.email} onChange={e => setEdit(v => ({ ...v, email: e.target.value }))} required /></label>
          <label>Phone number<input name="phone" value={edit.phone} onChange={e => setEdit(v => ({ ...v, phone: e.target.value }))} maxLength="25" placeholder="Optional" /></label>
          <label>About you<textarea name="bio" value={edit.bio} onChange={e => setEdit(v => ({ ...v, bio: e.target.value }))} maxLength="500" rows="3" placeholder="Write a short bio (optional)" /></label>
          <button className="primary" type="submit" disabled={loading}>{loading ? "Saving..." : "Save changes"}<span>→</span></button>
        </form>
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="danger-zone"><div><strong>Delete account</strong><span>This permanently deletes your account and profile picture.</span></div><button className="danger" onClick={removeAccount} disabled={loading}>Delete my account</button></div>
      </section>
      <p className="copyright">Your data is stored securely.</p>
    </main>
  );

  return (
    <main className="page">
      <section className="panel">
        <div className="brand-mark">L</div><p className="eyebrow">YOUR SPACE. YOUR ACCOUNT.</p>
        <h1>{mode === "login" ? "Welcome back." : "Create account."}</h1>
        <p className="subtext">{mode === "login" ? "Sign in to continue to your account." : "A few details and you're all set."}</p>
        <div className="switcher">
          <button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Sign in</button>
          <button className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Create account</button>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && <label>Full name<input name="name" value={form.name} onChange={updateForm} placeholder="Your name" autoComplete="name" required minLength="2" maxLength="80" /></label>}
          <label>Email address<input name="email" type="email" value={form.email} onChange={updateForm} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" value={form.password} onChange={updateForm} placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength="8" /></label>
          {error && <p className="error" role="alert">{error}</p>}{message && <p className="success">{message}</p>}
          <button className="primary" type="submit" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}<span>→</span></button>
        </form>
        <p className="footnote">Passwords are securely hashed before they are stored.</p>
      </section>
      <p className="copyright">A simple, secure account manager</p>
    </main>
  );
}
