"use client";
import { useState } from "react";

export type RateFormValue = {
  name: string;
  method: "PERCENTAGE" | "FIXED" | "TIERED";
  point: "BASIC_PAY" | "REGULAR_EARNINGS" | "GROSS_PAY" | "TAXABLE_PAY" | "NET_PAY";
  rate?: number | null;
  capAmount?: number | null;
  relief?: number | null;
  employerRate?: number | null;
  preTax?: boolean;
  tiers?: { upTo: number | null; rate: number }[] | null;
  kind?: string; // schemes only
};

const POINTS = [
  { v: "BASIC_PAY", label: "Basic pay" },
  { v: "REGULAR_EARNINGS", label: "Regular cash earnings (basic + regular allowances)" },
  { v: "GROSS_PAY", label: "Total gross pay (incl. irregular allowances)" },
  { v: "TAXABLE_PAY", label: "Taxable pay" },
  { v: "NET_PAY", label: "Net pay (post-tax)" },
];

export default function RateForm({
  initial, onSave, onCancel, showKind, saving,
}: {
  initial?: Partial<RateFormValue>;
  onSave: (v: RateFormValue) => void;
  onCancel?: () => void;
  showKind?: boolean;
  saving?: boolean;
}) {
  const [v, setV] = useState<RateFormValue>({
    name: "", method: "PERCENTAGE", point: "REGULAR_EARNINGS", preTax: true,
    rate: null, capAmount: null, relief: null, employerRate: null,
    tiers: null, kind: "PENSION", ...initial,
  });
  const set = (patch: Partial<RateFormValue>) => setV({ ...v, ...patch });
  const num = (s: string) => (s === "" ? null : Number(s));

  const tiers = v.tiers ?? [];

  return (
    <div>
      <div className="row">
        <div>
          <label>Name</label>
          <input value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Sacco loan" />
        </div>
        {showKind && (
          <div>
            <label>Scheme kind</label>
            <select value={v.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="PENSION">Pension</option>
              <option value="MORTGAGE_INTEREST">Mortgage interest</option>
              <option value="POST_RETIREMENT_MEDICAL">Post-retirement medical</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        )}
        <div>
          <label>Method</label>
          <select value={v.method} onChange={(e) => set({ method: e.target.value as any })}>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed amount</option>
            <option value="TIERED">Tiered bands</option>
          </select>
        </div>
        <div>
          <label>Deducted on</label>
          <select value={v.point} onChange={(e) => {
            const point = e.target.value as any;
            set({ point, preTax: point === "NET_PAY" ? false : v.preTax });
          }}>
            {POINTS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        {v.method !== "TIERED" && (
          <div>
            <label>{v.method === "FIXED" ? "Amount (KSh)" : "Rate (%)"}</label>
            <input type="number" step="0.01" value={v.rate ?? ""} onChange={(e) => set({ rate: num(e.target.value) })} />
          </div>
        )}
        <div>
          <label>Cap (KSh, optional)</label>
          <input type="number" value={v.capAmount ?? ""} onChange={(e) => set({ capAmount: num(e.target.value) })} />
        </div>
        <div>
          <label>Relief (KSh, optional)</label>
          <input type="number" value={v.relief ?? ""} onChange={(e) => set({ relief: num(e.target.value) })} />
        </div>
        <div>
          <label>Employer match (%)</label>
          <input type="number" step="0.01" value={v.employerRate ?? ""} onChange={(e) => set({ employerRate: num(e.target.value) })} />
        </div>
        <div>
          <label>Pre-tax</label>
          <select value={v.preTax ? "yes" : "no"} disabled={v.point === "NET_PAY"}
            onChange={(e) => set({ preTax: e.target.value === "yes" })}>
            <option value="yes">Yes — reduces taxable pay</option>
            <option value="no">No — post-tax</option>
          </select>
        </div>
      </div>

      {v.method === "TIERED" && (
        <div style={{ marginTop: 12 }}>
          <label>Bands (leave "up to" empty on the last band for "and above")</label>
          {tiers.map((t, i) => (
            <div className="row" key={i} style={{ marginBottom: 6 }}>
              <div>
                <input type="number" placeholder="Up to (KSh)" value={t.upTo ?? ""}
                  onChange={(e) => {
                    const next = [...tiers]; next[i] = { ...t, upTo: e.target.value === "" ? null : Number(e.target.value) };
                    set({ tiers: next });
                  }} />
              </div>
              <div>
                <input type="number" step="0.01" placeholder="Rate %" value={t.rate}
                  onChange={(e) => {
                    const next = [...tiers]; next[i] = { ...t, rate: Number(e.target.value) };
                    set({ tiers: next });
                  }} />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <button className="danger" onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            </div>
          ))}
          <button className="secondary" onClick={() => set({ tiers: [...tiers, { upTo: null, rate: 0 }] })}>
            Add band
          </button>
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button disabled={saving || !v.name} onClick={() => onSave(v)}>{saving ? "Saving…" : "Save"}</button>
        {onCancel && <button className="secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
