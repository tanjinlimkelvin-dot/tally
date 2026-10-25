import {
  fail,
  now,
  text,
  stmt,
  one,
  run,
  json,
  data,
  hash,
  random,
} from "./common.js";
const COOKIE = "__Host-tally";
export async function limit(db, k, max, seconds) {
  const t = Math.floor(Date.now() / 1000),
    bucket = Math.floor(t / seconds);
  const r = await one(
    db,
    "INSERT INTO limits(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n",
    k + ":" + bucket,
    t + seconds * 2,
  );
  if (r.n > max) fail(429, "Too many requests");
}
export function csrf(req) {
  if (req.headers.get("X-Tally-Request") !== "1")
    fail(403, "Missing request header");
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin)
    fail(403, "Origin mismatch");
}
async function derive(p, s) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode(s),
          iterations: 100000,
          hash: "SHA-256",
        },
        k,
        256,
      ),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
function password(p) {
  if (typeof p !== "string" || p.length < 12 || p.length > 256)
    fail(422, "Password must be 12–256 characters");
  return p;
}
async function encode(p) {
  const salt = random();
  return salt + ":" + (await derive(password(p), salt));
}
async function matches(p, encoded) {
  if (typeof p !== "string" || p.length > 256) return false;
  const [s, h] = encoded.split(":");
  return (await derive(p, s)) === h;
}
const cookie = (v, age = 2592000) =>
  `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function issue(db, extra = []) {
  const token = random();
  await db.batch([
    ...extra,
    stmt(
      db,
      "INSERT INTO sessions(hash,expires) VALUES(?,?)",
      await hash(token),
      Date.now() + 2592000000,
    ),
  ]);
  return json({ authenticated: true, needs_setup: false }, 200, {
    "Set-Cookie": cookie(token),
  });
}
export async function session(req, db) {
  const value = (req.headers.get("Cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return value && value.length < 200
    ? await one(
        db,
        "SELECT hash FROM sessions WHERE hash=? AND expires>?",
        await hash(value),
        Date.now(),
      )
    : null;
}
export async function auth(req, env, path) {
  const db = env.DB,
    owner = await one(db, "SELECT password FROM owner WHERE id=1");
  if (path === "/api/auth/status" && req.method === "GET")
    return json({
      authenticated: !!(await session(req, db)),
      needs_setup: !owner,
    });
  if (req.method !== "POST") fail(405, "Method not allowed");
  csrf(req);
  await limit(
    db,
    "auth-ip:" + (await hash(req.headers.get("CF-Connecting-IP") || "local")),
    15,
    900,
  );
  const d = await data(req);
  if (path === "/api/auth/setup") {
    if (owner) fail(409, "Already configured");
    if (
      !env.SETUP_TOKEN_HASH ||
      typeof d.setup_token !== "string" ||
      d.setup_token.length > 300 ||
      (await hash(d.setup_token)) !== env.SETUP_TOKEN_HASH.toLowerCase()
    )
      fail(403, "Invalid setup token");
    const encoded = await encode(d.password);
    try {
      return await issue(db, [
        stmt(db, "INSERT INTO owner(id,password) VALUES(1,?)", encoded),
      ]);
    } catch {
      fail(409, "Already configured");
    }
  }
  if (path === "/api/auth/login") {
    if (!owner || !(await matches(d.password, owner.password)))
      fail(401, "Invalid password");
    return issue(db);
  }
  const s = await session(req, db);
  if (!s) fail(401, "Sign in required");
  if (path === "/api/auth/logout") {
    await run(db, "DELETE FROM sessions WHERE hash=?", s.hash);
    return json({ authenticated: false, needs_setup: false }, 200, {
      "Set-Cookie": cookie("", 0),
    });
  }
  if (path === "/api/auth/password") {
    if (!(await matches(d.old_password, owner.password)))
      fail(401, "Invalid password");
    const encoded = await encode(d.new_password);
    const result = await one(
      db,
      "UPDATE owner SET password=? WHERE id=1 AND password=? RETURNING id",
      encoded,
      owner.password,
    );
    if (!result) fail(409, "Password changed elsewhere");
    return issue(db, [stmt(db, "DELETE FROM sessions")]);
  }
  fail(404, "Not found");
}
export async function authorize(req, env, path) {
  const bearer = req.headers.get("Authorization");
  if (bearer) {
    if (req.method !== "POST" || !["/api/quick", "/api/ingest"].includes(path))
      fail(403, "Upload-only token");
    await limit(
      env.DB,
      "bearer-ip:" +
        (await hash(req.headers.get("CF-Connecting-IP") || "local")),
      120,
      60,
    );
    const t = await one(
      env.DB,
      "SELECT id FROM tokens WHERE hash=?",
      await hash(bearer.replace(/^Bearer /, "")),
    );
    if (!t) fail(401, "Invalid upload token");
    await limit(env.DB, "token-minute:" + t.id, 60, 60);
    await limit(env.DB, "token-day:" + t.id, 1000, 86400);
    await run(
      env.DB,
      "UPDATE tokens SET last_used_at=? WHERE id=?",
      now(),
      t.id,
    );
    return { token_id: t.id };
  }
  if (!(await session(req, env.DB))) fail(401, "Sign in required");
  if (!["GET", "HEAD"].includes(req.method)) csrf(req);
  return { session: true };
}
export async function tokens(req, db, path) {
  if (req.method === "GET")
    return json({
      tokens: await (
        await import("./common.js")
      ).all(
        db,
        "SELECT id,label,created_at,last_used_at FROM tokens ORDER BY created_at DESC",
      ),
    });
  const d = await data(req);
  const m = path.match(/^\/api\/tokens\/([^/]+)\/revoke$/);
  if (m) {
    await run(db, "DELETE FROM tokens WHERE id=?", m[1]);
    return json({ ok: true });
  }
  if (path !== "/api/tokens") fail(404, "Not found");
  const label = text(d.label, 80) || "Shortcut",
    id = crypto.randomUUID(),
    token = "tly_" + random();
  await run(
    db,
    "INSERT INTO tokens(id,label,hash,created_at) VALUES(?,?,?,?)",
    id,
    label,
    await hash(token),
    now(),
  );
  return json({ id, token });
}
