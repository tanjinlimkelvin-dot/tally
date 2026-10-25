import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { hash } from "../src/common.js";
export async function fixture() {
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "src/worker.js",
    compatibilityDate: "2026-08-06",
    d1Databases: { DB: "test" },
    bindings: { SETUP_TOKEN_HASH: await hash("setup-test") },
    modulesRoot: process.cwd(),
  });
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations")).sort()) {
    const sql = await readFile("migrations/" + name, "utf8");
    const triggers = sql.match(/CREATE TRIGGER[\s\S]*?\nEND;/g) || [];
    for (const s of [
      ...sql
        .replace(/CREATE TRIGGER[\s\S]*?\nEND;/g, "")
        .split(";")
        .filter((s) => s.trim()),
      ...triggers,
    ])
      await db.prepare(s).run();
  }
  let cookie = "";
  const request = async (path, method = "GET", value, headers = {}) => {
    const h = {
      "X-Tally-Request": "1",
      Origin: "https://tally.test",
      Cookie: cookie,
      ...headers,
    };
    if (value !== undefined && !("Content-Type" in h))
      h["Content-Type"] = "application/json";
    const r = await mf.dispatchFetch("https://tally.test" + path, {
      method,
      headers: h,
      body:
        value === undefined
          ? undefined
          : typeof value === "string"
            ? value
            : JSON.stringify(value),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return { status: r.status, data, headers: r.headers };
  };
  return { mf, db, request };
}
