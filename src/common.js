export class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, msg) => {
  throw new Problem(status, msg);
};
export const now = (v = Date.now()) =>
  new Date(v + 28800000).toISOString().slice(0, 19) + "+08:00";
export function when(v) {
  if (!v) return now();
  if (typeof v !== "string" || v.length > 60) fail(422, "Invalid date");
  let x = v;
  if (!/(Z|[+-]\d\d:\d\d)$/.test(x)) x += " +08:00".trim();
  const n = Date.parse(x);
  if (!Number.isFinite(n)) fail(422, "Invalid date");
  return now(n);
}
export function text(v, max = 120) {
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max || /[\x00-\x1f\x7f]/.test(v))
    fail(422, "Invalid text");
  return v.trim();
}
export function cents(v) {
  const s = String(v ?? "")
    .trim()
    .replace(/^(?:MYR|RM)\s*/i, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(s))
    fail(422, "Use a positive MYR amount with at most two decimals");
  const [a, b = ""] = s.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100000000000)
    fail(422, "Invalid amount");
  return n;
}
export const key = (v) =>
  String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
export const out = (r) =>
  r ? { ...r, amount: r.amount_cents / 100, version: String(r.version) } : null;
export const stmt = (db, s, ...p) => db.prepare(s).bind(...p);
export const all = async (db, s, ...p) =>
  (await stmt(db, s, ...p).all()).results;
export const one = (db, s, ...p) => stmt(db, s, ...p).first();
export const run = (db, s, ...p) => stmt(db, s, ...p).run();
export const json = (v, status = 200, headers = {}) =>
  Response.json(v, { status, headers });
export async function body(req, max = 65536) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  let n = 0,
    chunks = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    n += r.value.length;
    if (n > max) {
      await reader.cancel();
      fail(413, "Body too large");
    }
    chunks.push(r.value);
  }
  let b = new Uint8Array(n),
    i = 0;
  for (const c of chunks) {
    b.set(c, i);
    i += c.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(b);
}
export async function data(req) {
  try {
    const d = JSON.parse((await body(req)) || "{}");
    if (!d || typeof d !== "object" || Array.isArray(d))
      fail(422, "Expected JSON object");
    return d;
  } catch (e) {
    if (e instanceof Problem) throw e;
    fail(422, "Invalid JSON");
  }
}
export const hash = async (s) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
export const random = () => crypto.randomUUID() + crypto.randomUUID();
export function csv(v) {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
