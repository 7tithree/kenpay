"use client";
import { useEffect, useState } from "react";
import { api, fmt } from "@/lib/client";
import { useMe } from "./me-context";

export default function Overview() {
  const { me } = useMe();
  const [employees, setEmployees] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    if (!me?.activeCompanyId) return;
    api<any[]>("/api/employees").then(setEmployees).catch(() => {});
    api<any[]>("/api/deductions").then(setDeductions).catch(() => {});
    api<any[]>("/api/payroll/run").then(setRuns).catch(() => {});
  }, [me?.activeCompanyId]);

  const latest = runs[0];
  const totalNet = latest?.payslips?.reduce((s: number, p: any) => s + Number(p.netPay), 0) ?? 0;

  return (
    <>
      <h1>Overview</h1>
      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="hint">Active employees</div>
          <div className="num" style={{ fontSize: "1.8rem" }}>{employees.filter((e) => e.status === "ACTIVE").length}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="hint">Active deductions</div>
          <div className="num" style={{ fontSize: "1.8rem" }}>{deductions.filter((d) => d.active).length}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="hint">Last run net pay (KSh)</div>
          <div className="num" style={{ fontSize: "1.8rem" }}>{fmt(totalNet)}</div>
        </div>
      </div>
      {latest && (
        <div className="card">
          <h2>Latest payroll run — {latest.period} <span className={`pill ${latest.status}`}>{latest.status}</span></h2>
          <p className="hint">{latest.payslips.length} payslips generated.</p>
        </div>
      )}
    </>
  );
}
