"use client";
import { Fragment, useEffect, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "../me-context";
import RateForm, { RateFormValue } from "@/components/RateForm";

export default function DeductionsPage() {
  const { me, can } = useMe();
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exemptFor, setExemptFor] = useState<string | null>(null); // deduction id
  const [employees, setEmployees] = useState<any[]>([]);
  const [exemptForm, setExemptForm] = useState({ employeeId: "", reason: "" });

  const load = () => api<any[]>("/api/deductions").then(setItems).catch((e) => setError(e.message));

  async function toggleExemptions(d: any) {
    if (exemptFor === d.id) { setExemptFor(null); return; }
    setError("");
    try {
      if (!employees.length) setEmployees(await api<any[]>("/api/employees"));
      setExemptFor(d.id);
      setExemptForm({ employeeId: "", reason: "" });
    } catch (e: any) { setError(e.message); }
  }

  async function addExemption(d: any) {
    setError("");
    try {
      await api(`/api/deductions/${d.id}/exemptions`, { method: "POST",
        jsonBody: { employeeId: exemptForm.employeeId, reason: exemptForm.reason || undefined } });
      setExemptForm({ employeeId: "", reason: "" });
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function removeExemption(d: any, employeeId: string) {
    setError("");
    try {
      await api(`/api/deductions/${d.id}/exemptions`, { method: "DELETE", jsonBody: { employeeId } });
      await load();
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId]);

  async function save(v: RateFormValue) {
    setSaving(true); setError("");
    try {
      const { kind, ...body } = v;
      if (editing) await api(`/api/deductions/${editing.id}`, { method: "PATCH", jsonBody: body });
      else await api("/api/deductions", { method: "POST", jsonBody: body });
      setEditing(null); setCreating(false); await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function remove(d: any) {
    if (!confirm(`Delete "${d.name}"? Statutory deductions are deactivated instead.`)) return;
    try { await api(`/api/deductions/${d.id}`, { method: "DELETE" }); await load(); }
    catch (e: any) { setError(e.message); }
  }

  const describe = (d: any) =>
    d.method === "TIERED" ? "Tiered bands"
      : d.method === "FIXED" ? `KSh ${fmt(d.rate ?? 0)} flat`
      : `${d.rate}% ${d.capAmount ? `(cap ${fmt(d.capAmount)})` : ""}`;

  return (
    <>
      <h1>Deductions</h1>
      <p className="hint">Rates change with the law — edit them here and every future payroll run picks up the new values. Statutory Kenyan deductions were pre-loaded when the company was created.</p>
      {error && <div className="error">{error}</div>}

      {can("payroll.rates.edit") && !creating && !editing && (
        <button onClick={() => setCreating(true)} style={{ marginBottom: 14 }}>Add deduction</button>
      )}
      {(creating || editing) && (
        <div className="card">
          <h2>{editing ? `Edit ${editing.name}` : "New deduction"}</h2>
          <RateForm
            key={editing?.id ?? "new"}
            saving={saving}
            initial={editing ? {
              name: editing.name, method: editing.method, point: editing.point,
              rate: editing.rate ? Number(editing.rate) : null,
              capAmount: editing.capAmount ? Number(editing.capAmount) : null,
              relief: editing.relief ? Number(editing.relief) : null,
              employerRate: editing.employerRate ? Number(editing.employerRate) : null,
              preTax: editing.preTax, tiers: editing.tiers,
            } : undefined}
            onSave={save}
            onCancel={() => { setEditing(null); setCreating(false); }}
          />
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Rate</th><th>Deducted on</th><th>Pre-tax</th><th>Employer</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((d: any) => (
              <Fragment key={d.id}>
              <tr>
                <td><strong>{d.name}</strong>{d.statutory && <span className="hint"> · statutory</span>}
                  {d.exemptions?.length > 0 && <div className="hint">{d.exemptions.length} exemption(s)</div>}</td>
                <td className="mono">{describe(d)}</td>
                <td>{d.point.replace("_", " ").toLowerCase()}</td>
                <td>{d.preTax ? "Yes" : "No"}</td>
                <td className="mono">{d.employerRate ? `${d.employerRate}%` : "—"}</td>
                <td><span className={`pill ${d.active ? "ACTIVE" : "CANCELLED"}`}>{d.active ? "active" : "inactive"}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {can("payroll.exemptions.manage") && (
                    <><button className="secondary" onClick={() => toggleExemptions(d)}>
                      {exemptFor === d.id ? "Hide exemptions" : "Exemptions"}
                    </button>{" "}</>
                  )}
                  {can("payroll.rates.edit") && <>
                    <button className="secondary" onClick={() => { setEditing(d); setCreating(false); }}>Edit</button>{" "}
                    <button className="danger" onClick={() => remove(d)}>Delete</button>
                  </>}
                </td>
              </tr>
              {exemptFor === d.id && (
                <tr>
                  <td colSpan={7} style={{ background: "var(--paper, #fafaf7)" }}>
                    <strong>Exempt employees — {d.name}</strong>
                    <div style={{ margin: "8px 0" }}>
                      {(d.exemptions ?? []).map((x: any) => (
                        <span key={x.id} className="pill ACTIVE" style={{ marginRight: 6 }}>
                          {x.employee.firstName} {x.employee.lastName}
                          {x.reason ? <span className="hint"> — {x.reason}</span> : null}{" "}
                          <a href="#" onClick={(ev) => { ev.preventDefault(); removeExemption(d, x.employeeId); }}>×</a>
                        </span>
                      ))}
                      {!(d.exemptions ?? []).length && <span className="hint">No one is exempt from this deduction.</span>}
                    </div>
                    <div className="row" style={{ maxWidth: 620, alignItems: "end" }}>
                      <div>
                        <label>Employee</label>
                        <select value={exemptForm.employeeId} onChange={(e) => setExemptForm({ ...exemptForm, employeeId: e.target.value })}>
                          <option value="">Choose…</option>
                          {employees
                            .filter((e) => !(d.exemptions ?? []).some((x: any) => x.employeeId === e.id))
                            .map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.staffNo})</option>)}
                        </select>
                      </div>
                      <div><label>Reason (optional)</label><input value={exemptForm.reason} onChange={(e) => setExemptForm({ ...exemptForm, reason: e.target.value })} /></div>
                      <div><button onClick={() => addExemption(d)} disabled={!exemptForm.employeeId}>Exempt</button></div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {!items.length && <tr><td colSpan={7} className="hint">No deductions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
