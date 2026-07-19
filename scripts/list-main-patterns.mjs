import fs from "node:fs";
import path from "node:path";

const appDir = path.join(process.cwd(), "app");
const re = /<main className="([^"]+)"/g;
const set = new Set();
function walk(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".tsx")) {
      const t = fs.readFileSync(p, "utf8");
      let m;
      while ((m = re.exec(t))) set.add(m[0]);
    }
  }
}
walk(appDir);
[...set].sort().forEach((s) => console.log(s));
console.error("unique", set.size);
