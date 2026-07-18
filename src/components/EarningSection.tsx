"use client";
import { useEffect, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "@/app/dashboard/me-context";

/**
 * Shared CRUD section for company-defined earnings — used by the Allowances
 * (cash, taxable) and Benefits (non-cash, tax-exempt) pages. Items are FIXED
 * amounts or a PERCENTAGE of basic pay, assigned per employee with an
 * optional per-employee override.
 */
export default function EarningSection({
  title, singular, hint, apiBase, permPrefix,
}: {
  title: string;
  singular: string;      // "allowance" | "benefit" (display)
  hint: string;
  apiBase: string;       // "/api/allowances" | "/api/benefits"
  permPrefix: string;    // "allowance" | "benefit" (permission keys)
}) {
  const { me, can } = useMe();
  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const emptyForm = { name: "", method: "FIXED", rate: "", active: true };
  const [form, setForm] = useState<any>(emptyForm);
  const [assign, setAssign] = useState<{ itemId: string; employeeId: string; ownRate: string } | null>(null);

  const load = () => Promise.all([
    api<any[]>(apiBase).then(setItems),
    api<any[]>("/api/employees").then(setEmployees).catch(() => setEmployees([])),
  ]).catch((e) => setError(e.message));
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId]);

  function startEdit(item: any) {
    setEditing(item); setCreating(false);
    setForm({ name: item.name, method: item.method, rate: item.rate != null ? Number(item.rate) : "", active: item.active });
  }

  async function save() {
    setSaving(true); setError("");
    const body = {
      name: form.name,
      method: form.method,
      rate: form.rate === "" ? null : Number(form.rate),
      active: !!form.active,
    };
    try {
      if (editing) await api(`${apiBase}/${editing.id}`, { method: "PATCH", jsonBody: body });
      else await api(apiBase, { method: "POST", jsonBody: body });
      setEditing(null); setCreating(false); setForm(emptyForm);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function remove(item: any) {
    if (!confirm(`Delete ${singular} "${item.name}"? Employee assignments are removed too.`)) return;
    try { await api(`${apiBase}/${item.id}`, { method: "DELETE" }); await load(); }
    catch (e: any) { setError(e.message); }
  }

  async function addRecipient() {
    if (!assign?.employeeId) return;
    try {
      await api(`${apiBase}/${assign.itemId}/recipients`, { method: "POST", jsonBody: {
        employeeId: assign.employeeId,
        ownRate: assign.ownRate === "" ? null : Number(assign.ownRate),
      }});
      setAssign(null); await load();
    } catch (e: any) { setError(e.message); }
  }

  async function removeRecipient(itemId: string, employeeId: string) {
    try {
      await api(`${apiBase}/${itemId}/recipients`, { method: "DELETE", jsonBody: { employeeId } });
      await load();
    } catch (e: any) { setError(e.message); }
  }

  const rateLabel = form.method === "FIXED" ? "Amount (KSh)" : "Rate (% of basic pay)";

  return (
    <>
      <h1>{title}</h1>
      <p className="hint">{hint}</p>
      {error && <div className="error">{error}</div>}

      {can(`${permPrefix}.create`) && !creating && !editing && (
        <button onClick={() => { setCreating(true); setForm(emptyForm); }} style={{ marginBottom: 14 }}>
          Add {singular}
        </button>
      )}

      {(creating || editing) && (
        <div className="card">
          <h2>{editing ? `Edit ${editing.name}` : `New ${singular}`}</h2>
          <div className="row">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="FIXED">Fixed amount</option>
                <option value="PERCENTAGE">Percentage of basic pay</option>
              </select>
            </div>
            <div>
              <label>{rateLabel}</label>
              <input type="number" step="0.01" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </div>
            <div>
              <label>Active</label>
              <select value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}>
                <option value="yes">Yes</option>
                <option value="no">No — skipped in payroll</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button disabled={saving || !form.name} onClick={save}>{saving ? "Saving…" : "Save"}</button>
            <button className="secondary" onClick={() => { setEditing(null); setCreating(false); setForm(emptyForm); }}>Cancel</button>
          </div>
        </div>
      )}

      {items.map((item) => (
        <div className="card" key={item.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <h2>{item.name} {!item.active && <span className="hint">· inactive</span>}</h2>
              <p className="mono hint">
                {item.method === "FIXED"
                  ? `KSh ${fmt(item.rate ?? 0)}`
                  : `${item.rate ?? 0}% of basic pay`}
                {" "}· per-employee override allowed
              </p>
            </div>
            <div>
              {can(`${permPrefix}.edit`) && <button className="secondary" onClick={() => startEdit(item)}>Edit</button>}{" "}
              {can(`${permPrefix}.delete`) && <button className="danger" onClick={() => remove(item)}>Delete</button>}
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Recipients ({item.recipients.length}):</strong>{" "}
            {item.recipients.map((r: any) => (
              <span key={r.id} className="pill ACTIVE" style={{ marginRight: 6 }}>
                {r.employee.firstName} {r.employee.lastName}
                {r.ownRate != null && <span className="mono"> · {item.method === "FIXED" ? `KSh ${fmt(r.ownRate)}` : `${Number(r.ownRate)}%`}</span>}
                {can(`${permPrefix}.edit`) && (
                  <a href="#" style={{ marginLeft: 6 }} title="Remove"
                    onClick={(e) => { e.preventDefault(); removeRecipient(item.id, r.employeeId); }}>×</a>
                )}
              </span>
            ))}
            {can(`${permPrefix}.edit`) && (
              assign && assign.itemId === item.id ? (
                <div className="row" style={{ marginTop: 8, maxWidth: 620 }}>
                  <select value={assign.employeeId}
                    onChange={(e) => setAssign({ ...assign, employeeId: e.target.value })}>
                    <option value="">Choose employee…</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.staffNo})</option>)}
                  </select>
                  <input type="number" step="0.01"
                    placeholder={item.method === "FIXED" ? "Own amount (optional)" : "Own % (optional)"}
                    value={assign.ownRate}
                    onChange={(e) => setAssign({ ...assign, ownRate: e.target.value })} />
                  <div style={{ flex: "0 0 auto", display: "flex", gap: 6 }}>
                    <button onClick={addRecipient}>Assign</button>
                    <button className="secondary" onClick={() => setAssign(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="secondary" style={{ marginLeft: 8 }}
                  onClick={() => setAssign({ itemId: item.id, employeeId: "", ownRate: "" })}>
                  Assign employee
                </button>
              )
            )}
          </div>
        </div>
      ))}
      {!items.length && <div className="card hint">No {title.toLowerCase()} yet — create one above.</div>}
    </>
  );
}
