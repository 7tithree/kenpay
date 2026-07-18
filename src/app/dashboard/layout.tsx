"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { MeContext, type Me } from "./me-context";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/employees", label: "Employees" },
  { href: "/dashboard/deductions", label: "Deductions" },
  { href: "/dashboard/allowances", label: "Allowances" },
  { href: "/dashboard/benefits", label: "Benefits" },
  { href: "/dashboard/schemes", label: "Schemes" },
  { href: "/dashboard/payroll", label: "Payroll" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/audit", label: "Audit trail" },
  { href: "/dashboard/settings", label: "Company settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  const load = () => api<Me>("/api/auth/me").then(setMe).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const active = me?.companies.find((c) => c.id === me.activeCompanyId);
  const can = (p: string) => active?.permissions.includes(p) ?? false;

  async function switchCompany(companyId: string) {
    try {
      await api("/api/companies/switch", { method: "POST", jsonBody: { companyId } });
      await load();
      router.refresh();
    } catch (e: any) { setError(e.message); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <MeContext.Provider value={{ me, can, reload: load }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">Ken<span>Pay</span></div>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`nav ${pathname === n.href ? "active" : ""}`}>
              {n.label}
            </a>
          ))}
          <div style={{ marginTop: "auto", padding: "0 8px" }}>
            <div className="hint" style={{ color: "#9db5a3" }}>{me?.user.name}</div>
            <a href="#" className="nav" onClick={(e) => { e.preventDefault(); logout(); }}>Sign out</a>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <div className="switcher">
              <label style={{ margin: 0 }}>Company</label>
              <select
                value={me?.activeCompanyId ?? ""}
                onChange={(e) => switchCompany(e.target.value)}
              >
                <option value="" disabled>Select a company…</option>
                {me?.companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.role}</option>
                ))}
              </select>
            </div>
            <a href="/dashboard/settings">+ New company</a>
          </div>
          {error && <div className="error">{error}</div>}
          {me && !me.activeCompanyId && pathname !== "/dashboard/settings" ? (
            <div className="card">
              <h2>No company selected</h2>
              <p>Pick a company above, or <a href="/dashboard/settings">create your first company</a> to get started. New companies come pre-loaded with Kenyan statutory deductions (PAYE, NSSF, SHIF, Housing Levy) that you can edit any time.</p>
            </div>
          ) : children}
        </main>
      </div>
    </MeContext.Provider>
  );
}
