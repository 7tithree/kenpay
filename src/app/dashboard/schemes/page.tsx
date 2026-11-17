"use client";
import { useEffect, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "../me-context";
import RateForm, { RateFormValue } from "@/components/RateForm";

export default function SchemesPage() {
  const { me, can } = useMe();
  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [enrol, setEnrol] = useState<{ schemeId: string; employeeId: string } | null>(null);

  const load = () => Promise.all([
    api<any[]>("/api/schemes").then(setItems),
    api<any[]>("/api/employees").then(setEmployees),
  ]).catch((e) => setError(e.message));
  useEffect(() => { if (me?.activeCompanyId) load(); }, [me?.activeCompanyId]);

  async function save(v: RateFormValue) {
    setSaving(true); setError("");
    try {
      if (editing) await api(`/api/schemes/${editing.id}`, { method: "PATCH", jsonBody: v });
      else await api("/api/schemes", { method: "POST", jsonBody: v });
      setEditing(null); setCreating(false); await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function addMember() {
    if (!enrol?.employeeId) return;
    try {
      await api(`/api/schemes/${enrol.schemeId}/members`, { method: "POST", jsonBody: { employeeId: enrol.employeeId } });
      setEnrol(null); await load();
    } catch (e: any) { setError(e.message); }
  }

  async function removeMember(scheme: any, employeeId: string) {
    setError("");
    try {
      await api(`/api/schemes/${scheme.id}/members`, { method: "DELETE", jsonBody: { employeeId } });
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function enrolAll(scheme: any) {
    if (!confirm(`Enrol all employees into "${scheme.name}"? Terminated employees are skipped.`)) return;
    try {
      await api(`/api/schemes/${scheme.id}/members`, { method: "POST", jsonBody: { all: true } });
      setEnrol(null); await load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <>
      <h1>Schemes</h1>
      <p className="hint">Pension, mortgage interest, and post-retirement medical schemes. Pre-tax schemes reduce taxable pay up to their cap (e.g. pension capped at KSh 30,000/month). Enrol employees per scheme.</p>
      {error && <div className="error">{error}</div>}

      {can("payroll.rates.edit") && !creating && !editing && (
        <button onClick={() => setCreating(true)} style={{ marginBottom: 14 }}>Add scheme</button>
      )}
      {(creating || editing) && (
        <div className="card">
          <h2>{editing ? `Edit ${editing.name}` : "New scheme"}</h2>
          <RateForm
            key={editing?.id ?? "new"}
            showKind saving={saving}
            initial={editing ? {
              name: editing.name, kind: editing.kind, method: editing.method, point: editing.point,
              rate: editing.rate ? Number(editing.rate) : null,
              capAmount: editing.capAmount ? Number(editing.capAmount) : null,
              employerRate: editing.employerRate ? Number(editing.employerRate) : null,
              preTax: editing.preTax,
            } : undefined}
            onSave={save}
            onCancel={() => { setEditing(null); setCreating(false); }}
          />
        </div>
      )}

      {items.map((s) => (
        <div className="card" key={s.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <h2>{s.name} <span className="hint">· {s.kind.replace(/_/g, " ").toLowerCase()}</span></h2>
              <p className="mono hint">
                {s.method === "FIXED" ? `KSh ${fmt(s.rate ?? 0)}` : `${s.rate ?? 0}%`} on {s.point.replace("_", " ").toLowerCase()}
                {s.capAmount && ` · cap KSh ${fmt(s.capAmount)}`} · {s.preTax ? "pre-tax" : "post-tax"}
              </p>
            </div>
            {can("payroll.rates.edit") && (
              <div>
                <button className="secondary" onClick={() => { setEditing(s); setCreating(false); }}>Edit</button>{" "}
                <button className="danger" onClick={async () => {
                  if (confirm(`Delete scheme "${s.name}"?`)) {
                    try { await api(`/api/schemes/${s.id}`, { method: "DELETE" }); load(); }
                    catch (e: any) { setError(e.message); }
                  }
                }}>Delete</button>
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Members ({s.members.length}):</strong>{" "}
            {s.members.map((m: any) => (
              <span key={m.id} className="pill ACTIVE" style={{ marginRight: 6 }}>
                {m.employee.firstName} {m.employee.lastName}{" "}
                <a href="#" onClick={(ev) => { ev.preventDefault(); removeMember(s, m.employeeId); }}>×</a>
              </span>
            ))}
            {enrol && enrol.schemeId === s.id ? (
              <div className="row" style={{ marginTop: 8, maxWidth: 420 }}>
                <select value={enrol.employeeId} onChange={(e) => setEnrol({ schemeId: s.id, employeeId: e.target.value })}>
                  <option value="">Choose employee…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.staffNo})</option>)}
                </select>
                <button onClick={addMember}>Enrol</button>
              </div>
            ) : (
              <>
                <button className="secondary" style={{ marginLeft: 8 }} onClick={() => setEnrol({ schemeId: s.id, employeeId: "" })}>
                  Enrol employee
                </button>{" "}
                <button className="secondary" onClick={() => enrolAll(s)}>
                  Enrol all
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {!items.length && <div className="card hint">No schemes yet — create one above.</div>}
    </>
  );
}
