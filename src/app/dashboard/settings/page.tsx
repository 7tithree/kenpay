"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useMe } from "../me-context";

export default function SettingsPage() {
  const { me, can, reload } = useMe();
  const [company, setCompany] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [wht, setWht] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newCompany, setNewCompany] = useState({ name: "", kraPin: "", address: "" });
  const [newType, setNewType] = useState("");
  const [assign, setAssign] = useState({ email: "", roleId: "" });
  const [newWht, setNewWht] = useState({ category: "", rate: "" });
  const [branches, setBranches] = useState<any[]>([]);
  const [newBranch, setNewBranch] = useState({ name: "", location: "" });
  const [allPerms, setAllPerms] = useState<string[]>([]);
  const [roleEdit, setRoleEdit] = useState<any>(null); // { id?, name, permissions: string[] }

  const load = () => {
    if (!me?.activeCompanyId) return;
    api("/api/companies/current").then(setCompany).catch(() => {});
    api<any>("/api/roles").then((r) => { setRoles(r.roles); setAllPerms(r.availablePermissions ?? []); }).catch(() => {});
    api<any[]>("/api/employment-types").then(setTypes).catch(() => {});
    api<any[]>("/api/wht-rates").then(setWht).catch(() => {});
    api<any[]>("/api/branches").then(setBranches).catch(() => {});
  };
  useEffect(load, [me?.activeCompanyId]);

  const wrap = (fn: () => Promise<any>, msg?: string) => async () => {
    setError(""); setNotice("");
    try { await fn(); if (msg) setNotice(msg); load(); reload(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <>
      <h1>Company settings</h1>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="card">
        <h2>Create a new company</h2>
        <p className="hint">New companies are seeded with Kenyan statutory deductions, default roles, WHT rates, and employment types — all editable.</p>
        <div className="row">
          <div><label>Name</label><input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} /></div>
          <div><label>KRA PIN</label><input value={newCompany.kraPin} onChange={(e) => setNewCompany({ ...newCompany, kraPin: e.target.value })} /></div>
          <div><label>Address</label><input value={newCompany.address} onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })} /></div>
        </div>
        <button style={{ marginTop: 12 }} onClick={wrap(
          () => api("/api/companies", { method: "POST", jsonBody: newCompany }),
          "Company created — you've been switched to it."
        )}>Create company</button>
      </div>

      {me?.activeCompanyId && (
        <>
          {can("company.edit") && company && (
            <div className="card">
              <h2>Company details</h2>
              <div className="row">
                <div><label>Name</label><input defaultValue={company.name} onBlur={(e) =>
                  wrap(() => api("/api/companies/current", { method: "PATCH", jsonBody: { name: e.target.value } }), "Saved.")()} /></div>
                <div><label>KRA PIN</label><input defaultValue={company.kraPin ?? ""} onBlur={(e) =>
                  wrap(() => api("/api/companies/current", { method: "PATCH", jsonBody: { kraPin: e.target.value } }), "Saved.")()} /></div>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Employment types</h2>
            {types.map((t) => (
              <span key={t.id} className="pill ACTIVE" style={{ marginRight: 6 }}>
                {t.name}{" "}
                {can("emptype.edit") && (
                  <a href="#" title="Rename" onClick={(e) => { e.preventDefault();
                    const name = prompt("Rename employment type", t.name);
                    if (name && name !== t.name)
                      wrap(() => api(`/api/employment-types/${t.id}`, { method: "PATCH", jsonBody: { name } }), "Renamed.")(); }}>✎</a>
                )}{" "}
                {can("emptype.delete") && (
                  <a href="#" onClick={(e) => { e.preventDefault();
                    wrap(() => api(`/api/employment-types/${t.id}`, { method: "DELETE" }))(); }}>×</a>
                )}
              </span>
            ))}
            {can("emptype.create") && (
              <div className="row" style={{ marginTop: 10, maxWidth: 380 }}>
                <input placeholder="e.g. Seasonal" value={newType} onChange={(e) => setNewType(e.target.value)} />
                <button onClick={wrap(async () => {
                  await api("/api/employment-types", { method: "POST", jsonBody: { name: newType } });
                  setNewType("");
                })}>Add</button>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Branches</h2>
            <table>
              <thead><tr><th>Branch</th><th>Location</th><th className="num">Employees</th><th>Actions</th></tr></thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {can("company.edit") ? (
                        <input defaultValue={b.name} onBlur={(e) => e.target.value !== b.name &&
                          wrap(() => api(`/api/branches?id=${b.id}`, { method: "PATCH", jsonBody: { name: e.target.value } }), "Saved.")()} />
                      ) : b.name}
                    </td>
                    <td>
                      {can("company.edit") ? (
                        <input defaultValue={b.location ?? ""} onBlur={(e) => (e.target.value || "") !== (b.location ?? "") &&
                          wrap(() => api(`/api/branches?id=${b.id}`, { method: "PATCH", jsonBody: { location: e.target.value } }), "Saved.")()} />
                      ) : (b.location ?? "")}
                    </td>
                    <td className="num">{b._count.employees}</td>
                    <td>{can("company.edit") &&
                      <button className="danger" onClick={() => {
                        if (confirm(`Delete branch "${b.name}"? Its employees will be unassigned.`))
                          wrap(() => api(`/api/branches?id=${b.id}`, { method: "DELETE" }), "Branch deleted.")();
                      }}>Delete</button>}
                    </td>
                  </tr>
                ))}
                {!branches.length && <tr><td colSpan={4} className="hint">No branches yet.</td></tr>}
              </tbody>
            </table>
            {can("company.edit") && (
              <div className="row" style={{ marginTop: 10, maxWidth: 520 }}>
                <input placeholder="Branch name e.g. Nairobi HQ" value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} />
                <input placeholder="Location (optional)" value={newBranch.location}
                  onChange={(e) => setNewBranch({ ...newBranch, location: e.target.value })} />
                <button onClick={wrap(async () => {
                  await api("/api/branches", { method: "POST", jsonBody: { name: newBranch.name, location: newBranch.location || undefined } });
                  setNewBranch({ name: "", location: "" });
                }, "Branch added.")}>Add</button>
              </div>
            )}
          </div>

          {can("company.assign_roles") && (
            <div className="card">
              <h2>Roles</h2>
              <p className="hint">Each role is a set of permissions from Permissions.txt. Presets can be edited; roles in use can't be deleted.</p>
              <table>
                <thead><tr><th>Role</th><th>Permissions</th><th>Actions</th></tr></thead>
                <tbody>
                  {roles.map((r: any) => (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong></td>
                      <td className="hint" style={{ maxWidth: 420 }}>
                        {r.permissions.length === allPerms.length && allPerms.length > 0
                          ? "All permissions"
                          : `${r.permissions.length} permission(s): ${r.permissions.slice(0, 6).join(", ")}${r.permissions.length > 6 ? "…" : ""}`}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="secondary" onClick={() => setRoleEdit({ id: r.id, name: r.name, permissions: [...r.permissions] })}>Edit</button>{" "}
                        <button className="danger" onClick={() => {
                          if (confirm(`Delete role "${r.name}"?`))
                            wrap(() => api(`/api/roles/${r.id}`, { method: "DELETE" }), "Role deleted.")();
                        }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button style={{ marginTop: 10 }} onClick={() => setRoleEdit({ name: "", permissions: [] })}>New role</button>

              {roleEdit && (
                <div style={{ marginTop: 14, borderTop: "1px solid #e3e6e3", paddingTop: 12 }}>
                  <div className="row" style={{ maxWidth: 380 }}>
                    <div><label>Role name</label><input value={roleEdit.name} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6, marginTop: 10 }}>
                    {allPerms.map((p) => (
                      <label key={p} style={{ fontWeight: 400, display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" style={{ width: "auto" }}
                          checked={roleEdit.permissions.includes(p)}
                          onChange={(e) => setRoleEdit({
                            ...roleEdit,
                            permissions: e.target.checked
                              ? [...roleEdit.permissions, p]
                              : roleEdit.permissions.filter((x: string) => x !== p),
                          })} />
                        <span className="mono" style={{ fontSize: 12 }}>{p}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button onClick={wrap(async () => {
                      if (roleEdit.id)
                        await api(`/api/roles/${roleEdit.id}`, { method: "PATCH", jsonBody: { name: roleEdit.name, permissions: roleEdit.permissions } });
                      else
                        await api("/api/roles", { method: "POST", jsonBody: { name: roleEdit.name, permissions: roleEdit.permissions } });
                      setRoleEdit(null);
                    }, "Role saved.")} disabled={!roleEdit.name || !roleEdit.permissions.length}>Save role</button>{" "}
                    <button className="secondary" onClick={() => setRoleEdit(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {can("company.assign_roles") && (
            <div className="card">
              <h2>Assign role to a user</h2>
              <p className="hint">The user must already have a KenPay account. Roles: {roles.map((r) => r.name).join(", ")}.</p>
              <div className="row" style={{ maxWidth: 560 }}>
                <div><label>User email</label><input value={assign.email} onChange={(e) => setAssign({ ...assign, email: e.target.value })} /></div>
                <div>
                  <label>Role</label>
                  <select value={assign.roleId} onChange={(e) => setAssign({ ...assign, roleId: e.target.value })}>
                    <option value="">Choose…</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <button style={{ marginTop: 12 }} onClick={wrap(
                () => api("/api/roles/assign", { method: "POST", jsonBody: assign }),
                "Role assigned."
              )}>Assign</button>
            </div>
          )}

          <div className="card">
            <h2>Withholding tax rates (reports)</h2>
            <table>
              <thead><tr><th>Category</th><th className="num">Rate %</th><th>Actions</th></tr></thead>
              <tbody>
                {wht.map((w: any) => (
                  <tr key={w.id}>
                    <td>{w.category}</td>
                    <td className="num">
                      {can("payroll.rates.edit") ? (
                        <input type="number" step="0.01" defaultValue={w.rate} style={{ width: 90, textAlign: "right" }}
                          onBlur={(e) => wrap(() => api("/api/wht-rates", { method: "POST",
                            jsonBody: { category: w.category, resident: w.resident, rate: Number(e.target.value) } }), "Rate saved.")()} />
                      ) : w.rate}
                    </td>
                    <td>{can("payroll.rates.edit") &&
                      <button className="danger" onClick={wrap(() => api("/api/wht-rates", { method: "DELETE", jsonBody: { id: w.id } }))}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {can("payroll.rates.edit") && (
              <div className="row" style={{ marginTop: 10, maxWidth: 460 }}>
                <input placeholder="Category e.g. Management fees" value={newWht.category}
                  onChange={(e) => setNewWht({ ...newWht, category: e.target.value })} />
                <input placeholder="Rate %" type="number" value={newWht.rate}
                  onChange={(e) => setNewWht({ ...newWht, rate: e.target.value })} />
                <button onClick={wrap(async () => {
                  await api("/api/wht-rates", { method: "POST", jsonBody: { category: newWht.category, resident: true, rate: Number(newWht.rate) } });
                  setNewWht({ category: "", rate: "" });
                })}>Add</button>
              </div>
            )}
          </div>

          {(can("company.delete") || can("general.reset_payroll")) && (
            <div className="card">
              <h2>Danger zone</h2>
              {can("general.reset_payroll") && (
                <>
                  <p className="hint">Reset restores statutory deductions and WHT rates to Kenyan defaults, deactivates custom deductions, and clears pending payroll inputs. Existing runs and payslips are untouched.</p>
                  <button className="danger" style={{ marginBottom: 12 }} onClick={() => {
                    if (confirm("Reset payroll settings to statutory defaults?")) {
                      wrap(async () => {
                        const r = await api<{ message: string }>("/api/payroll/reset", { method: "POST" });
                        setNotice(r.message);
                      })();
                    }
                  }}>Reset payroll settings</button>
                </>
              )}
              {can("company.delete") && <button className="danger" onClick={() => {
                if (confirm("Delete this company and ALL its data? This cannot be undone.")) {
                  wrap(() => api("/api/companies/current", { method: "DELETE" }), "Company deleted.")();
                }
              }}>Delete company</button>}
            </div>
          )}
        </>
      )}
    </>
  );
}
