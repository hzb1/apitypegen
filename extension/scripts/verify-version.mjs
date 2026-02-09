import fs from "node:fs";
import path from "node:path";

const extensionRoot = path.resolve(process.cwd());
const pkgPath = path.join(extensionRoot, "package.json");
const manifestPath = path.join(extensionRoot, "src", "manifest.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const pkgVersion = String(pkg.version || "").trim();
const manifestVersion = String(manifest.version || "").trim();

if (!pkgVersion || !manifestVersion) {
  console.error("Missing version in package.json or manifest.json");
  process.exit(1);
}

if (pkgVersion !== manifestVersion) {
  console.error(
    `Version mismatch: package.json=${pkgVersion}, manifest.json=${manifestVersion}`,
  );
  process.exit(1);
}

const tagVersionRaw = process.env.TAG_VERSION || "";
if (tagVersionRaw) {
  const tagVersion = tagVersionRaw.replace(/^v/, "");
  if (tagVersion !== pkgVersion) {
    console.error(
      `Tag version mismatch: tag=${tagVersion}, package.json=${pkgVersion}`,
    );
    process.exit(1);
  }
}

console.log(`Version OK: ${pkgVersion}`);
