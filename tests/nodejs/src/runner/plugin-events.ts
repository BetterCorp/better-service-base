import path from "path";
import { createTestObservable } from "../trace";
import { getEventsConstructorConfig } from "../mocks";
import { broadcast } from "../sb/plugins/events/broadcast";
import { emit } from "../sb/plugins/events/emit";
import { emitAndReturn } from "../sb/plugins/events/emitAndReturn";
import { emitStreamAndReceiveStream } from "../sb/plugins/events/emitStreamAndReceiveStream";

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

describe(`events: ${pluginName}`, () => {
  const gen = async () => {
    const refP = new PluginCtor(await getEventsConstructorConfig(config));
    if (refP.init) {
      await refP.init(createTestObservable());
    }
    return refP;
  };

  broadcast(gen, 30);
  emit(gen, 30);
  emitAndReturn(gen, 30);
  emitStreamAndReceiveStream(gen, 500);
});
