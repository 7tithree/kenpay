"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(""); setBusy(true);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", jsonBody: form });
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-mark">Ken<span style={{ color: "var(--brass)" }}>Pay</span></div>
        <h1>{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <p className="hint">Multi-company payroll for Kenyan teams.</p>
        {error && <div className="error">{error}</div>}
        {mode === "register" && (
          <div style={{ marginBottom: 10 }}>
            <label>Full name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Password</label>
          <input type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          {mode === "register" && <span className="hint">At least 8 characters.</span>}
        </div>
        <button onClick={submit} disabled={busy} style={{ width: "100%" }}>
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
          {mode === "login" ? "New here? " : "Already registered? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </a>
        </p>
      </div>
    </div>
  );
}
