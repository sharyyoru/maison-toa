import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const testDirectory = resolve("src/__tests__");
const testFiles = readdirSync(testDirectory).filter((name) => name.endsWith(".test.ts")).sort();
const tsxCli = require.resolve("tsx/cli");
for (const name of testFiles) {
  console.log(`\n--- ${name} ---`);
  const result = spawnSync(process.execPath, [tsxCli, resolve(testDirectory, name)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

