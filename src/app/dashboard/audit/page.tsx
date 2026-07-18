"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useMe } from "../me-context";

export default function AuditPage() {
  const { me } = useMe();
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (me?.activeCompanyId)
      api<any[]>("/api/audit").then(setLogs).catch((e) => setError(e.message));
  }, [me?.activeCompanyId]);

  return (
    <>
      <h1>Audit trail</h1>
      <p className="hint">Who did what, and when — payroll runs, approvals, rate changes, resets, emails and settings changes for this company.</p>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="mono">{new Date(l.createdAt).toLocaleString("en-KE")}</td>
                <td>{l.user ? `${l.user.name}` : "—"}<div className="hint">{l.user?.email}</div></td>
                <td><span className="pill">{l.action}</span></td>
                <td className="mono hint" style={{ maxWidth: 360, overflowWrap: "anywhere" }}>
                  {l.detail && Object.keys(l.detail).length ? JSON.stringify(l.detail) : ""}
                </td>
              </tr>
            ))}
            {!logs.length && <tr><td colSpan={4} className="hint">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
