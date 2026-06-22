/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program.
 * The commercial license allows you to use the Program in a closed-source manner,
 * including the right to create derivative works that are not subject to the terms
 * of the AGPL.
 *
 * To obtain a commercial license, please contact the copyright holders at
 * https://www.bettercorp.dev. The terms and conditions of the commercial license
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import * as assert from "assert";
import path from "path";
import { PluginTypes } from "@bsb/base";
import { createTestObservable } from "../../trace";
import { getConfigConstructorConfig } from "../../mocks";

const pluginModule = process.env.BSB_TEST_PLUGIN_MODULE;

if (!pluginModule) {
  throw new Error("BSB_TEST_PLUGIN_MODULE is required for config-default tests");
}

const resolvedModule = path.resolve(pluginModule);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require(resolvedModule);
const Plugin = mod.Plugin || mod.default || mod;

const fixturePath = path.join(__dirname, "..", "..", "..", "fixtures", "sec-config.yaml");

describe("plugins/config-default", () => {
  const obs = createTestObservable();

  it("should throw if config file is missing", () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: "missing-config.yaml",
    }));
    assert.throws(() => plugin.init(obs));
  });

  it("should throw for unknown profile", () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "missing",
      BSB_CONFIG_FILE: fixturePath,
    }));
    assert.throws(() => plugin.init(obs));
  });

  it("should load config and expose enabled plugins", async () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);

    const observables = await plugin.getObservablePlugins();
    assert.ok(observables["obs-enabled"]);
    assert.ok(!observables["obs-disabled"]);

    const events = await plugin.getEventsPlugins();
    assert.ok(events["ev-enabled"]);
    assert.ok(!events["ev-disabled"]);

    const services = await plugin.getServicePlugins();
    assert.ok(services["svc-enabled"]);
    assert.ok(!services["svc-disabled"]);
  });

  it("should return plugin configs for correct types", async () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);

    const evConfig = await plugin.getPluginConfig(obs, PluginTypes.events, "ev-enabled");
    assert.deepEqual(evConfig, { foo: "bar" });

    const obsConfig = await plugin.getPluginConfig(obs, PluginTypes.observable, "obs-enabled");
    assert.deepEqual(obsConfig, { level: "info" });

    const svcConfig = await plugin.getPluginConfig(obs, PluginTypes.service, "svc-enabled");
    assert.deepEqual(svcConfig, { hello: "world" });

    const cfgConfig = await plugin.getPluginConfig(obs, PluginTypes.config, "config-default");
    assert.strictEqual(cfgConfig, null);
  });

  it("should resolve service plugin definition", async () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);

    const def = await plugin.getServicePluginDefinition(obs, "service-default0");
    assert.strictEqual(def.name, "svc-enabled");
    assert.strictEqual(def.enabled, true);
  });

  it("should resolve disabled service plugin definition", async () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);

    const def = await plugin.getServicePluginDefinition(obs, "service-only-disabled");
    assert.strictEqual(def.name, "svc-only-disabled");
    assert.strictEqual(def.enabled, false);
  });

  it("should throw when service plugin missing", async () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);

    await assert.rejects(plugin.getServicePluginDefinition(obs, "missing-plugin"));
  });

  it("should list plugins", async () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);

    const plugins = await plugin.getPlugins();
    assert.ok(plugins.find((p: any) => p.name === "svc-enabled"));
  });

  it("dispose should clear config", () => {
    const plugin = new Plugin(getConfigConstructorConfig({
      BSB_PROFILE: "default",
      BSB_CONFIG_FILE: fixturePath,
    }));
    plugin.init(obs);
    plugin.dispose();
  });
});
