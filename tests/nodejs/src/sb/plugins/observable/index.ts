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
import { BSBObservableRef, BSBError } from "@bsb/base";
import { createTestObservable } from "../../../trace";

export const RunObservablePluginTests = (
  observablePlugin: typeof BSBObservableRef,
  config: any = undefined,
) => {
  describe("ObservableBase", async function (this: Mocha.Suite) {
    this.timeout(30000);
    const obs = createTestObservable();
    const trace = obs.trace;
    const pluginName = "test-plugin";

    it("should construct", async () => {
      const plugin = new observablePlugin(config);
      assert.ok(plugin);
    });

    it("should init/run/dispose if implemented", async () => {
      const plugin = new observablePlugin(config);
      if (plugin.init) {
        await plugin.init();
      }
      if (plugin.run) {
        await plugin.run();
      }
      if (plugin.dispose) {
        await plugin.dispose();
      }
    });

    it("should support logging methods if implemented", async () => {
      const plugin = new observablePlugin(config);
      if (plugin.debug) {
        plugin.debug(trace, pluginName, "debug message", {});
      }
      if (plugin.info) {
        plugin.info(trace, pluginName, "info message", {});
      }
      if (plugin.warn) {
        plugin.warn(trace, pluginName, "warn message", {});
      }
      if (plugin.error) {
        plugin.error(trace, pluginName, "error message", {});
        plugin.error(trace, pluginName, new BSBError(trace, "error message"));
      }
    });

    it("should support metrics methods if implemented", async () => {
      const plugin = new observablePlugin(config);
      const timestamp = Date.now();
      if (plugin.createCounter) {
        await plugin.createCounter(timestamp, pluginName, "c", "desc", "help", ["a"]);
      }
      if (plugin.incrementCounter) {
        await plugin.incrementCounter(timestamp, pluginName, "c", 1, { a: "b" });
      }
      if (plugin.createGauge) {
        await plugin.createGauge(timestamp, pluginName, "g", "desc", "help", ["a"]);
      }
      if (plugin.setGauge) {
        await plugin.setGauge(timestamp, pluginName, "g", 2, { a: "b" });
      }
      if (plugin.createHistogram) {
        await plugin.createHistogram(timestamp, pluginName, "h", "desc", "help", [1, 2], ["a"]);
      }
      if (plugin.observeHistogram) {
        await plugin.observeHistogram(timestamp, pluginName, "h", 3, { a: "b" });
      }
    });

    it("should support tracing methods if implemented", async () => {
      const plugin = new observablePlugin(config);
      if (plugin.spanStart) {
        await plugin.spanStart(Date.now(), trace, pluginName, "span", null, { a: "b" });
      }
      if (plugin.spanEnd) {
        await plugin.spanEnd(Date.now(), trace, pluginName, { a: "b" });
      }
      if (plugin.spanError) {
        await plugin.spanError(Date.now(), trace, pluginName, new Error("fail"), { a: "b" });
      }
    });
  });
};
