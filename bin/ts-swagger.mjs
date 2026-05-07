#!/usr/bin/env node

import { access } from "node:fs/promises";
import process from "node:process";

const entryFile = new URL("../dist/cli/ts-swagger.js", import.meta.url);

try {
  await access(entryFile);
  await import(entryFile.href);
} catch {
  process.stderr.write(
    "[ts-swagger] 未找到 dist/cli/ts-swagger.js，请先执行 npm run build。\n",
  );
  process.exit(1);
}
