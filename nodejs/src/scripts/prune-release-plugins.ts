#!/usr/bin/env node

import { rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const pluginsDir = join(process.cwd(), "lib", "plugins");
if (isDirectory(pluginsDir)) {
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("service-")) continue;
    rmSync(join(pluginsDir, entry.name), { recursive: true, force: true });
  }
}
