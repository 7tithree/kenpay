"use client";
import { useEffect, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "../me-context";

export default function ReportsPage() {
  const { me, can } = useMe();
  const [tab, setTab] = useState<"deductions" | "wht" | "returns">("deductions");

  return (
    <>
      <h1>Reports</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === "deductions" ? "" : "secondary"} onClick={() => setTab("deductions")}>Deduction reports</button>
        <button className={tab === "wht" ? "" : "secondary"} onClick={() => setTab("wht")}>Withholding tax</button>
        <button className={tab === "returns" ? "" : "secondary"} onClick={() => setTab("returns")}>Statutory returns</button>
      </div>
      {tab === "deductions" && <DeductionReports can={can} me={me} />}
      {tab === "wht" && <WhtReport can={can} me={me} />}
      {tab === "returns" && <StatutoryReturns can={can} me={me} />}
    </>
  );
}

function DeductionReports({ can, me }: any) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<any>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load(lbl: string | null = label) {
    setError("");
    try {
      const q = `/api/reports/deductions?period=${period}` + (lbl ? `&label=${encodeURIComponent(lbl)}` : "");
      setReport(await api(q));
      setLabel(lbl);
    } catch (e: any) { setReport(null); setError(e.message); }
  }
  useEffect(() => { if (me?.activeCompanyId) load(null); }, [me?.activeCompanyId, period]);

  const exportUrl = `/api/reports/deductions?period=${period}&export=csv` + (label ? `&label=${encodeURIComponent(label)}` : "");

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "end" }}>
        <div style={{ maxWidth: 180 }}>
          <label>Period</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        {label && <button className="secondary" onClick={() => load(null)}>← All deductions</button>}
        {can("reports.export") && report?.rows?.length > 0 && (
          <a href={exportUrl}><button className="secondary">Export CSV</button></a>
        )}
      </div>
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {report?.kind === "summary" && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Deduction</th><th className="num">Employees</th><th className="num">Employee total</th><th className="num">Employer total</th><th>Actions</th></tr></thead>
          <tbody>
            {report.rows.map((r: any) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{r.employees}</td>
                <td className="num">{fmt(r.amount)}</td>
                <td className="num">{fmt(r.employerAmount)}</td>
                <td><button className="secondary" onClick={() => load(r.label)}>Detail</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report?.kind === "detail" && (
        <>
          <h2 style={{ marginTop: 12 }}>{report.label} — {report.period} <span className={`pill ${report.status}`}>{report.status}</span></h2>
          <table>
            <thead><tr><th>Staff No</th><th>Employee</th><th>KRA PIN</th><th className="num">Amount</th><th className="num">Employer</th></tr></thead>
            <tbody>
              {report.rows.map((r: any) => (
                <tr key={r.staffNo}>
                  <td className="mono">{r.staffNo}</td><td>{r.name}</td><td className="mono">{r.kraPin}</td>
                  <td className="num">{fmt(r.amount)}</td><td className="num">{fmt(r.employerAmount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}><strong>Total</strong></td>
                <td className="num"><strong>{fmt(report.totals.amount)}</strong></td>
                <td className="num"><strong>{fmt(report.totals.employerAmount)}</strong></td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function WhtReport({ can, me }: any) {
  const year = new Date().toISOString().slice(0, 4);
  const [from, setFrom] = useState(`${year}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<any>(null);
  const [rates, setRates] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ payeeName: "", payeePin: "", category: "", resident: true, grossAmount: "", paidOn: new Date().toISOString().slice(0, 10) });

  async function load() {
    setError("");
    try {
      setReport(await api(`/api/reports/wht?from=${from}&to=${to}`));
      setRates(await api("/api/wht-rates"));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId, from, to]);

  async function record() {
    setError(""); setNotice("");
    try {
      await api("/api/wht-payments", { method: "POST", jsonBody: { ...form, grossAmount: Number(form.grossAmount), payeePin: form.payeePin || undefined } });
      setNotice("Payment recorded — WHT computed from the company rate table.");
      setForm({ ...form, payeeName: "", payeePin: "", grossAmount: "" });
      await load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <>
      {can("payroll.rates.edit") && (
        <div className="card">
          <h2>Record a payment subject to WHT</h2>
          <div className="row">
            <div><label>Payee name</label><input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} /></div>
            <div><label>Payee PIN (optional)</label><input value={form.payeePin} onChange={(e) => setForm({ ...form, payeePin: e.target.value })} /></div>
            <div>
              <label>Category</label>
              <select value={`${form.category}|${form.resident}`} onChange={(e) => {
                const [category, resident] = e.target.value.split("|");
                setForm({ ...form, category, resident: resident === "true" });
              }}>
                <option value="|true">Select…</option>
                {rates.map((r) => (
                  <option key={r.id} value={`${r.category}|${r.resident}`}>
                    {r.category} ({r.resident ? "Resident" : "Non-resident"}) — {Number(r.rate) * 100}%
                  </option>
                ))}
              </select>
            </div>
            <div><label>Gross amount (KSh)</label><input type="number" value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} /></div>
            <div><label>Paid on</label><input type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></div>
            <div style={{ alignSelf: "end" }}><button onClick={record} disabled={!form.payeeName || !form.category || !form.grossAmount}>Record</button></div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: "end" }}>
          <div style={{ maxWidth: 160 }}><label>From</label><input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div style={{ maxWidth: 160 }}><label>To</label><input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {can("reports.export") && report?.rows?.length > 0 && (
            <a href={`/api/reports/wht?from=${from}&to=${to}&export=csv`}><button className="secondary">Export CSV</button></a>
          )}
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        {notice && <div className="success" style={{ marginTop: 10 }}>{notice}</div>}

        {report && (
          <>
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Date</th><th>Payee</th><th>PIN</th><th>Category</th><th className="num">Gross</th><th className="num">WHT</th></tr></thead>
              <tbody>
                {report.rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="mono">{r.paidOn}</td><td>{r.payeeName}</td><td className="mono">{r.payeePin}</td>
                    <td>{r.category} <span className="hint">({r.resident})</span></td>
                    <td className="num">{fmt(r.grossAmount)}</td><td className="num">{fmt(r.whtAmount)}</td>
                  </tr>
                ))}
                {!report.rows.length && <tr><td colSpan={6} className="hint">No WHT payments in this range.</td></tr>}
              </tbody>
            </table>
            {report.totals.length > 0 && (
              <p className="mono hint" style={{ marginTop: 8 }}>
                {report.totals.map((t: any) => `${t.category}: ${fmt(t.wht)}`).join(" · ")} — Total WHT KSh {fmt(report.grandTotal)}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}


const RETURN_TYPES = [
  { key: "p10", label: "KRA P10 (PAYE)" },
  { key: "nssf", label: "NSSF return" },
  { key: "shif", label: "SHIF return" },
  { key: "housing", label: "Housing Levy return" },
];

function StatutoryReturns({ can, me }: any) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [type, setType] = useState("p10");
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    setError(""); setReport(null);
    try { setReport(await api(`/api/reports/returns?type=${type}&period=${period}`)); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId, type, period]);

  return (
    <div className="card">
      <p className="hint">Return files are generated from <strong>approved</strong> payroll runs only, so what you file always matches what was paid.</p>
      <div className="row" style={{ alignItems: "end" }}>
        <div style={{ maxWidth: 220 }}>
          <label>Return</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {RETURN_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 180 }}>
          <label>Period</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        {can("reports.export") && report?.rows?.length > 0 && (
          <a href={`/api/reports/returns?type=${type}&period=${period}&export=csv`}>
            <button className="secondary">Export CSV</button>
          </a>
        )}
      </div>
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {report && report.rows.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>{Object.keys(report.rows[0]).map((h) => (
              <th key={h} className={typeof report.rows[0][h] === "number" ? "num" : ""}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {report.rows.map((r: any, i: number) => (
              <tr key={i}>
                {Object.keys(report.rows[0]).map((h) => (
                  <td key={h} className={typeof r[h] === "number" ? "num" : "mono"}>
                    {typeof r[h] === "number" ? fmt(r[h]) : r[h]}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              {Object.keys(report.rows[0]).map((h, i) => (
                <td key={h} className={h in report.totals ? "num" : ""}>
                  {i === 0 ? <strong>Total</strong> : h in report.totals ? <strong>{fmt(report.totals[h])}</strong> : ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
      {report && !report.rows.length && <p className="hint" style={{ marginTop: 10 }}>No matching lines in this run.</p>}
    </div>
  );
}
