import fs from "fs";
import path from "path";

type CustomTestFn = (context: any, data?: any) => void | Promise<void>;

const pluginId = process.env.BSB_TEST_PLUGIN_ID;
const pluginRoot = process.env.BSB_TEST_PLUGIN_ROOT;
const pluginName = process.env.BSB_TEST_PLUGIN_NAME || pluginId || "unknown-plugin";
const pluginConfigRaw = process.env.BSB_TEST_PLUGIN_CONFIG || "null";

if (!pluginId || !pluginRoot) {
  throw new Error("BSB_TEST_PLUGIN_ID and BSB_TEST_PLUGIN_ROOT are required");
}

const config = JSON.parse(pluginConfigRaw);

const testsRoot = path.resolve(process.cwd(), "tests", pluginId);
if (!fs.existsSync(testsRoot)) {
  describe(`custom: ${pluginName}`, () => {
    it("no custom tests found", () => {});
  });
  return;
}

const isTestFile = (file: string) => {
  const base = path.basename(file);
  if (base.startsWith("_")) return false;
  return base.endsWith(".ts") || base.endsWith(".js") || base.endsWith(".cjs") || base.endsWith(".mjs");
};

const findTests = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTests(full));
      continue;
    }
    if (entry.isFile() && isTestFile(entry.name)) {
      results.push(full);
    }
  }
  return results;
};

const findHook = (dir: string, name: "_before" | "_after") => {
  const exts = [".ts", ".js", ".cjs", ".mjs"];
  for (const ext of exts) {
    const candidate = path.join(dir, `${name}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const loadTestFn = (file: string): CustomTestFn => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(file);
  return mod.default || mod.test || mod.run || mod;
};

const tests = findTests(testsRoot);
const grouped: Record<string, string[]> = {};

for (const testFile of tests) {
  const rel = path.relative(testsRoot, testFile);
  const dir = path.dirname(rel);
  const group = dir === "." ? "default" : dir;
  if (!grouped[group]) grouped[group] = [];
  grouped[group].push(testFile);
}

describe(`custom: ${pluginName}`, () => {
  for (const group of Object.keys(grouped)) {
    const groupDir = group === "default" ? testsRoot : path.join(testsRoot, group);
    const beforeHook = findHook(groupDir, "_before");
    const afterHook = findHook(groupDir, "_after");
    let sharedData: any = undefined;

    describe(group, () => {
      before(async () => {
        if (beforeHook) {
          const hookFn = loadTestFn(beforeHook);
          const maybe = await hookFn({
            pluginId,
            pluginName,
            pluginRoot,
            config,
            group,
          });
          if (maybe !== undefined) {
            sharedData = maybe;
          }
        }
      });

      after(async () => {
        if (afterHook) {
          const hookFn = loadTestFn(afterHook);
          await hookFn({
            pluginId,
            pluginName,
            pluginRoot,
            config,
            group,
          }, sharedData);
        }
      });

      for (const testFile of grouped[group]) {
        const testName = path.basename(testFile).replace(/\.(ts|js|cjs|mjs)$/i, "");
        it(testName, async () => {
          const testFn = loadTestFn(testFile);
          await testFn({
            pluginId,
            pluginName,
            pluginRoot,
            config,
            group,
          }, sharedData);
        });
      }
    });
  }
});
