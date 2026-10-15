/** Validates every canon/characters/<id>/stats.json against the schema and checks a bible exists. */
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { default as addFormatsImport } from "ajv-formats";
const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => void;
import { CONFIG } from "../config.js";
import { StatsSchema } from "../canon.js";

const schema = JSON.parse(fs.readFileSync(path.join(CONFIG.canonDir, "schema/stats.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const dir = path.join(CONFIG.canonDir, "characters");
let bad = 0;
for (const id of fs.readdirSync(dir).sort()) {
  const folder = path.join(dir, id);
  if (!fs.statSync(folder).isDirectory()) continue;
  const statsPath = path.join(folder, "stats.json");
  const biblePath = path.join(folder, "bible.md");
  const problems: string[] = [];
  if (!fs.existsSync(biblePath)) problems.push("missing bible.md");
  else {
    const words = fs.readFileSync(biblePath, "utf8").split(/\s+/).length;
    if (words < 900) problems.push(`bible is thin (${words} words)`);
  }
  if (!fs.existsSync(statsPath)) problems.push("missing stats.json");
  else {
    const data = JSON.parse(fs.readFileSync(statsPath, "utf8"));
    if (!validate(data)) problems.push(...(validate.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`));
    else {
      const z = StatsSchema.safeParse(data);
      if (!z.success) problems.push(z.error.message);
      else if (z.data.id !== id) problems.push(`id "${z.data.id}" != folder "${id}"`);
    }
  }
  if (problems.length) { bad++; console.log(`✗ ${id}\n   ${problems.join("\n   ")}`); }
  else console.log(`✓ ${id}`);
}
if (bad) { console.log(`\n${bad} character(s) need attention`); process.exit(1); }
console.log("\nall canon valid");
