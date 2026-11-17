import { useEffect, useState } from "react";

const API = "/api";

export default function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Something went wrong.");
    return data;
  }

  useEffect(() => {
    request("/me").then(data => setUser(data.user)).catch(() => {});
  }, []);

  function update(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/login" : "/register";
      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : form;
      const data = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setUser(data.user);
      setMessage(data.message);
      setForm({ name: "", email: "", password: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      const data = await request("/logout", { method: "POST", body: "{}" });
      setUser(null);
      setMessage(data.message);
      setMode("login");
    } catch (err) {
      setError(err.message);
    }
  }

  if (user) {
    return (
      <main className="page">
        <section className="panel welcome">
          <div className="brand-mark">L</div>
          <p className="eyebrow">AUTHENTICATED SESSION</p>
          <h1>Welcome, {user.name}.</h1>
          <p className="subtext">You are successfully logged in.</p>
          <div className="profile">
            <span className="avatar">{user.name?.charAt(0)?.toUpperCase()}</span>
            <div><strong>{user.name}</strong><span>{user.email}</span></div>
          </div>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={logout}>Log out</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="brand-mark">L</div>
        <p className="eyebrow">YOUR SPACE. YOUR ACCOUNT.</p>
        <h1>{mode === "login" ? "Welcome back." : "Create account."}</h1>
        <p className="subtext">
          {mode === "login" ? "Sign in to continue to your account." : "A few details and you're all set."}
        </p>

        <div className="switcher">
          <button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Sign in</button>
          <button className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Create account</button>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Full name
              <input name="name" value={form.name} onChange={update} placeholder="Your name" autoComplete="name" required minLength="2" maxLength="80" />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" value={form.password} onChange={update} placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength="8" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="footnote">Passwords are securely hashed before they are stored.</p>
      </section>
      <p className="copyright">A simple, secure login starter</p>
    </main>
  );
}