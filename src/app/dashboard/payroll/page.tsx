"use client";
import { useEffect, useRef, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "../me-context";

export default function PayrollPage() {
  const { me, can } = useMe();
  const [runs, setRuns] = useState<any[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [emailing, setEmailing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function emailSlip(id: string) {
    setError(""); setNotice(""); setEmailing(id);
    try {
      const res = await api<{ to: string }>(`/api/payslips/${id}/email`, { method: "POST" });
      setNotice(`Payslip emailed to ${res.to}.`);
    } catch (e: any) { setError(e.message); }
    finally { setEmailing(null); }
  }

  const load = () => api<any[]>("/api/payroll/run").then(setRuns).catch((e) => setError(e.message));
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId]);

  async function run() {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/payroll/run", { method: "POST", jsonBody: { period } });
      setNotice(`Payroll run created for ${period} as a draft. Certify, then approve it.`);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function action(runId: string, a: "certify" | "approve" | "cancel") {
    setError("");
    try { await api("/api/payroll/run", { method: "PATCH", jsonBody: { runId, action: a } }); await load(); }
    catch (e: any) { setError(e.message); }
  }

  async function importCsv(file: File) {
    setError(""); setNotice("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("period", period);
    try {
      const res = await api<{ loaded: number; failed: any[] }>("/api/payroll/import", { method: "POST", body: fd });
      setNotice(`Loaded payroll inputs for ${res.loaded} employee(s) for ${period}.`);
      if (res.failed.length) setError(res.failed.map((f) => `Row ${f.row}: ${f.error}`).join(" · "));
    } catch (e: any) { setError(e.message); }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <h1>Payroll</h1>
      <p className="hint">Optionally import period inputs (CSV headers: staffNo, allowances, bonus — one-off amounts for this period only), then run payroll. Runs move Draft → Certified → Approved; drafts and certified runs can be cancelled.</p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="card">
        <div className="row" style={{ alignItems: "end" }}>
          <div style={{ maxWidth: 180 }}>
            <label>Period</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          {can("payroll.run") && (
            <>
              <div style={{ flex: "0 0 auto" }}>
                <button className="secondary" onClick={() => fileRef.current?.click()}>Import payroll CSV</button>
                <input ref={fileRef} type="file" accept=".csv" hidden
                  onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <button onClick={run} disabled={busy}>{busy ? "Running…" : "Run payroll"}</button>
              </div>
            </>
          )}
        </div>
      </div>

      {runs.map((r) => {
        const totals = r.payslips.reduce(
          (acc: any, p: any) => ({
            gross: acc.gross + Number(p.grossPay),
            net: acc.net + Number(p.netPay),
          }),
          { gross: 0, net: 0 }
        );
        return (
          <div className="card" key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2>{r.period} <span className={`pill ${r.status}`}>{r.status}</span></h2>
              <div>
                {can("payroll.certify") && r.status === "DRAFT" && <button onClick={() => action(r.id, "certify")}>Certify</button>}{" "}
                {can("payroll.approve") && r.status === "CERTIFIED" && <button onClick={() => action(r.id, "approve")}>Approve</button>}{" "}
                {can("payroll.cancel") && ["DRAFT", "CERTIFIED"].includes(r.status) &&
                  <button className="danger" onClick={() => action(r.id, "cancel")}>Cancel</button>}{" "}
                <button className="secondary" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? "Hide payslips" : `Payslips (${r.payslips.length})`}
                </button>
              </div>
            </div>
            <p className="mono hint">Gross KSh {fmt(totals.gross)} · Net KSh {fmt(totals.net)}</p>
            {open === r.id && (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Employee</th><th className="num">Gross</th><th className="num">Taxable</th><th>Deductions</th><th className="num">Net pay</th><th>Payslip</th></tr></thead>
                <tbody>
                  {r.payslips.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.employee.firstName} {p.employee.lastName}</td>
                      <td className="num">{fmt(p.grossPay)}</td>
                      <td className="num">{fmt(p.taxablePay)}</td>
                      <td>
                        {p.lines.filter((l: any) => l.kind !== "EARNING" && l.kind !== "BENEFIT").map((l: any) => (
                          <div key={l.id} className="mono hint">{l.label}: {fmt(l.amount)}</div>
                        ))}
                      </td>
                      <td className="num"><strong>{fmt(p.netPay)}</strong></td>
                      <td>
                        {can("payslip.download") && (
                          <a href={`/api/payslips/${p.id}/pdf`}><button className="secondary">PDF</button></a>
                        )}{" "}
                        {can("payslip.email") && (
                          <button className="secondary" disabled={emailing === p.id}
                            onClick={() => emailSlip(p.id)}>
                            {emailing === p.id ? "Sending…" : "Email"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {!runs.length && <div className="card hint">No payroll runs yet.</div>}
    </>
  );
}
