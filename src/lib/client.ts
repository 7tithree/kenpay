"use client";

// Small fetch wrapper: throws Error(message) on API failure so pages can
// show consistent error banners.
export async function api<T = any>(url: string, init?: RequestInit & { jsonBody?: any }): Promise<T> {
  const { jsonBody, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: jsonBody ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: jsonBody ? JSON.stringify(jsonBody) : rest.body,
  });
  let payload: any = null;
  try { payload = await res.json(); } catch { /* no body */ }
  if (!res.ok || payload?.ok === false) {
    const issues = payload?.issues ? " — " + Object.entries(payload.issues).map(([k, v]: any) => `${k}: ${v}`).join("; ") : "";
    throw new Error((payload?.error ?? `Request failed (${res.status})`) + issues);
  }
  return payload?.data as T;
}

export const fmt = (n: number | string) =>
  Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
