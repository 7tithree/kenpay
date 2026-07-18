"use client";
import { useEffect, useRef, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "../me-context";

const STATUSES = ["ACTIVE", "SUSPENDED", "ON_LEAVE", "TERMINATED"];

export default function EmployeesPage() {
  const { me, can } = useMe();
  const [items, setItems] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const emptyForm = { staffNo: "", firstName: "", lastName: "", email: "", basicPay: "", employmentTypeId: "", branchId: "" };
  const [form, setForm] = useState<any>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null); // employee id being edited
  const [salaryFor, setSalaryFor] = useState<any>(null);       // employee whose salary panel is open
  const [history, setHistory] = useState<any[]>([]);
  const [newRate, setNewRate] = useState({ basicPay: "", effectiveFrom: new Date().toISOString().slice(0, 10), note: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null); // CSV awaiting employment-type choice
  const [importTypeId, setImportTypeId] = useState("");
  const [importing, setImporting] = useState(false);

  const load = () => Promise.all([
    api<any[]>("/api/employees").then(setItems),
    api<any[]>("/api/employment-types").then(setTypes),
    api<any[]>("/api/branches").then(setBranches).catch(() => setBranches([])),
  ]).catch((e) => setError(e.message));
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId]);

  async function save() {
    setError("");
    const body: any = {
      ...form, email: form.email || null,
      employmentTypeId: form.employmentTypeId || null,
      branchId: form.branchId || null,
    };
    if (form.basicPay !== "" && form.basicPay != null) body.basicPay = Number(form.basicPay);
    else delete body.basicPay;
    try {
      if (editing) await api(`/api/employees/${editing}`, { method: "PATCH", jsonBody: body });
      else await api("/api/employees", { method: "POST", jsonBody: body });
      setAdding(false); setEditing(null); setForm(emptyForm);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  function startEdit(e: any) {
    setEditing(e.id); setAdding(true);
    setForm({
      staffNo: e.staffNo, firstName: e.firstName, lastName: e.lastName,
      email: e.email ?? "", basicPay: e.basicPay ?? "",
      employmentTypeId: e.employmentTypeId ?? "", branchId: e.branchId ?? "",
    });
  }

  async function openSalary(e: any) {
    if (salaryFor?.id === e.id) { setSalaryFor(null); return; }
    setError("");
    try {
      setHistory(await api<any[]>(`/api/salaries?employeeId=${e.id}`));
      setSalaryFor(e);
    } catch (err: any) { setError(err.message); }
  }

  async function addRate() {
    setError("");
    try {
      await api("/api/salaries", { method: "POST", jsonBody: {
        employeeId: salaryFor.id, basicPay: Number(newRate.basicPay),
        effectiveFrom: newRate.effectiveFrom, note: newRate.note || undefined,
      }});
      setNewRate({ basicPay: "", effectiveFrom: new Date().toISOString().slice(0, 10), note: "" });
      setHistory(await api<any[]>(`/api/salaries?employeeId=${salaryFor.id}`));
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function editRate(id: string, basicPay: number) {
    setError("");
    try {
      await api(`/api/salaries/${id}`, { method: "PATCH", jsonBody: { basicPay } });
      setHistory(await api<any[]>(`/api/salaries?employeeId=${salaryFor.id}`));
    } catch (e: any) { setError(e.message); }
  }

  async function deleteRate(id: string) {
    if (!confirm("Delete this salary record?")) return;
    setError("");
    try {
      await api(`/api/salaries/${id}`, { method: "DELETE" });
      setHistory(await api<any[]>(`/api/salaries?employeeId=${salaryFor.id}`));
    } catch (e: any) { setError(e.message); }
  }

  async function importCsv() {
    if (!importFile) return;
    setError(""); setNotice(""); setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    if (importTypeId) fd.append("employmentTypeId", importTypeId);
    try {
      const res = await api<{ created: number; updated: number; failed: any[] }>(
        "/api/employees/import", { method: "POST", body: fd });
      setNotice(`Imported: ${res.created} created, ${res.updated} updated${res.failed.length ? `, ${res.failed.length} failed` : ""}.`);
      if (res.failed.length) setError(res.failed.map((f) => `Row ${f.row}: ${f.error}`).join(" · "));
      cancelImport();
      await load();
    } catch (e: any) { setError(e.message); }
    setImporting(false);
  }

  function cancelImport() {
    setImportFile(null); setImportTypeId("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function exportCsv() {
    try {
      const res = await api<{ csv: string }>("/api/employees?export=csv");
      const blob = new Blob([res.csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "employees.csv";
      a.click();
    } catch (e: any) { setError(e.message); }
  }

  async function setStatus(id: string, status: string) {
    try { await api(`/api/employees/${id}`, { method: "PATCH", jsonBody: { status } }); await load(); }
    catch (e: any) { setError(e.message); }
  }

  async function remove(e: any) {
    if (!confirm(`Delete ${e.firstName} ${e.lastName}? This removes their history.`)) return;
    try { await api(`/api/employees/${e.id}`, { method: "DELETE" }); await load(); }
    catch (err: any) { setError(err.message); }
  }

  return (
    <>
      <h1>Employees</h1>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div style={{ display: "flex", gap: 8, margin: "14px 0", flexWrap: "wrap" }}>
        {can("employee.add") && <button onClick={() => { setAdding(!adding); setEditing(null); setForm(emptyForm); }}>{adding ? "Close form" : "Add employee"}</button>}
        {can("employee.import") && (
          <>
            <button className="secondary" onClick={() => fileRef.current?.click()}>Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv" hidden
              onChange={(e) => e.target.files?.[0] && setImportFile(e.target.files[0])} />
          </>
        )}
        {can("employee.export") && <button className="secondary" onClick={exportCsv}>Export CSV</button>}
      </div>
      <p className="hint">
        CSV headers: Staff No., Name, Designation, Branch, ID/PASSPORT NO., NSSF NO., SHIF NO., PIN,
        Account No., Bank Name, Bank code, Bank Branch, Branch Code, Email. Unrecognised columns are
        ignored. Existing staff numbers are updated, new ones created.
      </p>

      {importFile && (
        <div className="card">
          <h2>Import employees — <span className="mono">{importFile.name}</span></h2>
          <div className="row" style={{ maxWidth: 480, alignItems: "end" }}>
            <div>
              <label>Employment type (applied to all imported employees)</label>
              <select value={importTypeId} onChange={(e) => setImportTypeId(e.target.value)}>
                <option value="">—</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <button onClick={importCsv} disabled={importing}>{importing ? "Importing…" : "Import"}</button>{" "}
              <button className="secondary" onClick={cancelImport} disabled={importing}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div className="card">
          <h2>{editing ? "Edit employee" : "New employee"}</h2>
          <div className="row">
            <div><label>Staff No</label><input value={form.staffNo} onChange={(e) => setForm({ ...form, staffNo: e.target.value })} /></div>
            <div><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            <div><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label>Basic pay (KSh)</label><input type="number" value={form.basicPay} onChange={(e) => setForm({ ...form, basicPay: e.target.value })} /></div>
            <div>
              <label>Employment type</label>
              <select value={form.employmentTypeId} onChange={(e) => setForm({ ...form, employmentTypeId: e.target.value })}>
                <option value="">—</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {branches.length > 0 && (
              <div>
                <label>Branch</label>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <button style={{ marginTop: 12 }} onClick={save}>{editing ? "Save changes" : "Save employee"}</button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Staff No</th><th>Name</th><th>Type</th><th className="num">Basic pay</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((e: any) => (
              <tr key={e.id}>
                <td className="mono">{e.staffNo}</td>
                <td><strong>{e.firstName} {e.lastName}</strong><div className="hint">{e.email}</div></td>
                <td>{e.employmentType?.name ?? "—"}</td>
                <td className="num">{e.basicPay != null ? fmt(e.basicPay) : <span className="hint">hidden</span>}</td>
                <td>
                  {can("employee.status") ? (
                    <select value={e.status} onChange={(ev) => setStatus(e.id, ev.target.value)} style={{ width: "auto" }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  ) : <span className={`pill ${e.status}`}>{e.status}</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {can("salary.history") && <button className="secondary" onClick={() => openSalary(e)}>{salaryFor?.id === e.id ? "Hide salary" : "Salary"}</button>}{" "}
                  {can("employee.edit") && <button className="secondary" onClick={() => startEdit(e)}>Edit</button>}{" "}
                  {can("employee.delete") && <button className="danger" onClick={() => remove(e)}>Delete</button>}
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="hint">No employees yet — add one or import a CSV.</td></tr>}
          </tbody>
        </table>
      </div>

      {salaryFor && (
        <div className="card">
          <h2>Salary history — {salaryFor.firstName} {salaryFor.lastName} <span className="mono hint">{salaryFor.staffNo}</span></h2>
          <table>
            <thead><tr><th>Effective from</th><th className="num">Basic pay (KSh)</th><th>Note</th><th>Actions</th></tr></thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id}>
                  <td className="mono">{String(h.effectiveFrom).slice(0, 10)}</td>
                  <td className="num">
                    {can("salary.edit") ? (
                      <input type="number" defaultValue={h.basicPay} style={{ width: 130, textAlign: "right" }}
                        onBlur={(ev) => Number(ev.target.value) !== Number(h.basicPay) && editRate(h.id, Number(ev.target.value))} />
                    ) : fmt(h.basicPay)}
                  </td>
                  <td className="hint">{h.note ?? ""}</td>
                  <td>{can("salary.delete") && <button className="danger" onClick={() => deleteRate(h.id)}>Delete</button>}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={4} className="hint">No salary records yet.</td></tr>}
            </tbody>
          </table>
          {can("salary.add") && (
            <div className="row" style={{ marginTop: 10, maxWidth: 640, alignItems: "end" }}>
              <div><label>New basic pay (KSh)</label><input type="number" value={newRate.basicPay} onChange={(e) => setNewRate({ ...newRate, basicPay: e.target.value })} /></div>
              <div><label>Effective from</label><input type="date" value={newRate.effectiveFrom} onChange={(e) => setNewRate({ ...newRate, effectiveFrom: e.target.value })} /></div>
              <div><label>Note</label><input placeholder="e.g. Annual review" value={newRate.note} onChange={(e) => setNewRate({ ...newRate, note: e.target.value })} /></div>
              <div><button onClick={addRate} disabled={!newRate.basicPay}>Add rate</button></div>
            </div>
          )}
          <p className="hint" style={{ marginTop: 8 }}>Adding a rate effective today or earlier also updates the employee's current basic pay.</p>
        </div>
      )}
    </>
  );
}
