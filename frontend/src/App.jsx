import { useEffect, useRef, useState } from "react";

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
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const fileInput = useRef(null);

  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      credentials: "include",
      ...options,
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

  useEffect(() => {
    request("/me").then(d => acceptUser(d.user)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!avatarFile) { setAvatarPreview(""); return; }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function updateForm(e) {
    setForm(v => ({ ...v, [e.target.name]: e.target.value }));
  }

  function chooseAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Choose a JPG, PNG, or WEBP image.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile pictures must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    setError("");
    setAvatarFile(file);
  }

  async function submit(e) {
    e.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      let options;
      if (mode === "login") {
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password })
        };
      } else {
        const body = new FormData();
        Object.entries(form).forEach(([key, value]) => {
          if (key !== "password" || value) body.append(key, value);
        });
        if (avatarFile) body.append("avatar", avatarFile);
        options = { method: "POST", body };
      }
      const data = await request(mode === "login" ? "/login" : "/register", options);
      acceptUser(data.user);
      setMessage(data.message);
      setForm(blank);
      setAvatarFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function save(e) {
    e.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const d = await request("/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit)
      });
      acceptUser(d.user); setMessage(d.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function avatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WEBP image up to 5 MB.");
      e.target.value = "";
      return;
    }
    setError(""); setMessage(""); setLoading(true);
    try {
      const body = new FormData(); body.append("avatar", file);
      const d = await request("/me/avatar", { method: "POST", body });
      acceptUser(d.user); setMessage(d.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); e.target.value = ""; }
  }

  async function logout() {
    try {
      const d = await request("/logout", { method: "POST" });
      setUser(null); setMode("login"); setMessage(d.message);
    } catch (err) { setError(err.message); }
  }

  async function removeAccount() {
    if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
    setError(""); setMessage(""); setLoading(true);
    try {
      const d = await request("/me", { method: "DELETE" });
      setUser(null); setForm(blank); setMode("login"); setMessage(d.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const initials = (user?.name || "U").trim().charAt(0).toUpperCase();

  if (user) return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark">L</span><span>luma<span className="brand-dot">.</span></span></a>
        <p className="nav-caption">WORKSPACE</p>
        <div className="nav-item active"><span className="nav-icon">⌂</span> Overview</div>
        <div className="nav-item"><span className="nav-icon">◎</span> My profile</div>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><span className="help-icon">?</span><div><strong>Need a hand?</strong><small>Your account, your control.</small></div></div>
          <button className="sidebar-logout" onClick={logout}>↪ <span>Sign out</span></button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div><span className="breadcrumb-muted">Workspace</span><span className="breadcrumb-sep">/</span><strong>Overview</strong></div>
          <div className="topbar-user">
            {user.profile_image_url ? <img src={user.profile_image_url} alt="" /> : <span>{initials}</span>}
            <div><strong>{user.name}</strong><small>Personal account</small></div>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="welcome-row">
            <div><p className="eyebrow">YOUR PERSONAL SPACE</p><h1>Good to see you, {user.name.split(" ")[0]}.</h1><p className="subtext">Your profile and account details, all in one place.</p></div>
            <span className="status-pill"><i /> Account active</span>
          </div>

          {(message || error) && <div className={error ? "notice error-notice" : "notice success-notice"} role={error ? "alert" : "status"}>{error || message}</div>}

          <div className="dashboard-grid">
            <section className="content-card profile-card">
              <div className="card-heading"><div><p className="eyebrow">PROFILE</p><h2>Your profile</h2></div><span className="card-kicker">01</span></div>
              <div className="profile-hero">
                <div className="large-avatar-wrap">
                  {user.profile_image_url ? <img className="large-avatar" src={user.profile_image_url} alt="Your profile" /> : <span className="large-avatar avatar-fallback">{initials}</span>}
                  <span className="online-dot" />
                </div>
                <div className="profile-identity"><h3>{user.name}</h3><p>{user.email}</p><span className="member-label">MEMBER ACCOUNT</span></div>
              </div>
              <label className="upload-zone">
                <span className="upload-symbol">↑</span>
                <span><strong>{loading ? "Please wait..." : "Change profile photo"}</strong><small>JPG, PNG or WEBP · Max 5 MB</small></span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={avatar} disabled={loading} />
              </label>
              <div className="profile-footnote"><span className="secure-icon">✓</span> Your profile picture is stored privately in Amazon S3.</div>
            </section>

            <section className="content-card details-card">
              <div className="card-heading"><div><p className="eyebrow">PERSONAL INFORMATION</p><h2>Account details</h2></div><span className="card-kicker">02</span></div>
              <form onSubmit={save} className="edit-form">
                <label>Full name<input name="name" value={edit.name} onChange={e => setEdit(v => ({ ...v, name: e.target.value }))} required minLength="2" maxLength="80" /></label>
                <label>Email address<input name="email" type="email" value={edit.email} onChange={e => setEdit(v => ({ ...v, email: e.target.value }))} required /></label>
                <label>Phone number<input name="phone" value={edit.phone} onChange={e => setEdit(v => ({ ...v, phone: e.target.value }))} maxLength="25" placeholder="Add your phone number" /></label>
                <label>About you<textarea name="bio" value={edit.bio} onChange={e => setEdit(v => ({ ...v, bio: e.target.value }))} maxLength="500" rows="3" placeholder="Tell us a little about yourself..." /></label>
                <button className="primary save-button" type="submit" disabled={loading}>{loading ? "Saving changes..." : "Save changes"} <span>→</span></button>
              </form>
            </section>
          </div>

          <section className="content-card security-card">
            <div className="security-copy"><span className="security-shield">⌑</span><div><h3>Account security</h3><p>Your password is hashed before it is stored. Your session is protected with an HTTP-only cookie.</p></div></div>
            <button className="danger-button" onClick={removeAccount} disabled={loading}>Delete account</button>
          </section>
          <footer className="dashboard-footer"><span>© {new Date().getFullYear()} Luma Account</span><span>Built with care · Your data stays yours</span></footer>
        </div>
      </section>
    </main>
  );

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" /><div className="auth-decoration auth-decoration-two" />
      <section className="auth-layout">
        <div className="auth-intro">
          <a className="brand auth-brand" href="#"><span className="brand-mark">L</span><span>luma<span className="brand-dot">.</span></span></a>
          <div className="intro-copy"><p className="eyebrow">A SPACE THAT'S YOURS</p><h1>Make yourself<br /><span>at home.</span></h1><p>One simple place to manage your profile, your details, and your digital identity.</p></div>
          <div className="intro-bottom"><span className="intro-line" /> A simpler way to manage your account.</div>
        </div>

        <section className="auth-card">
          <div className="mobile-brand"><span className="brand-mark">L</span><strong>luma<span className="brand-dot">.</span></strong></div>
          <p className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</p>
          <h2>{mode === "login" ? "Sign in to Luma" : "Create your account"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Enter your details to access your personal space." : "Set up your profile in just a few steps."}</p>
          <div className="switcher">
            <button type="button" className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Sign in</button>
            <button type="button" className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Create account</button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && <>
              <label>Full name<input name="name" value={form.name} onChange={updateForm} placeholder="Your full name" autoComplete="name" required minLength="2" maxLength="80" /></label>
              <label className="avatar-picker-label">Profile picture <span className="optional-label">OPTIONAL</span>
                <div className="avatar-picker">
                  {avatarPreview ? <img src={avatarPreview} alt="Selected profile preview" /> : <span className="picker-placeholder">↑</span>}
                  <span><strong>{avatarFile ? avatarFile.name : "Choose a profile photo"}</strong><small>JPG, PNG or WEBP · Up to 5 MB</small></span>
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} />
                </div>
              </label>
            </>}
            <label>Email address<input name="email" type="email" value={form.email} onChange={updateForm} placeholder="you@example.com" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" value={form.password} onChange={updateForm} placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength="8" /></label>
            {error && <p className="notice error-notice" role="alert">{error}</p>}
            {message && <p className="notice success-notice" role="status">{message}</p>}
            <button className="primary auth-submit" type="submit" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign in to your account" : "Create my account"} <span>→</span></button>
          </form>
          <p className="auth-footnote"><span>✓</span> Your password is securely hashed. Your photo is stored in private cloud storage.</p>
        </section>
      </section>
      <footer className="auth-footer">© {new Date().getFullYear()} Luma Account <span>Secure · Simple · Personal</span></footer>
    </main>
  );
}
