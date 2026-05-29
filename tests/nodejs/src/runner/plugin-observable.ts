import path from "path";
import { RunObservablePluginTests } from "../sb/plugins/observable/index";

const pluginModule = process.env.BSB_TEST_PLUGIN_MODULE;
const pluginName = process.env.BSB_TEST_PLUGIN_NAME || "unknown-plugin";
const pluginConfigRaw = process.env.BSB_TEST_PLUGIN_CONFIG || "null";

if (!pluginModule) {
  throw new Error("BSB_TEST_PLUGIN_MODULE is required");
}

const resolvedModule = path.resolve(pluginModule);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require(resolvedModule);
const PluginCtor = mod.Plugin || mod.default || mod;

const config = JSON.parse(pluginConfigRaw);

describe(`observable: ${pluginName}`, () => {
  RunObservablePluginTests(PluginCtor, config);
});
