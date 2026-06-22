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
import { BSBError } from "@bsb/base";
import { createTestObservable } from "../../trace";
import { getObservableConstructorConfig } from "../../mocks";

const pluginModule = process.env.BSB_TEST_PLUGIN_MODULE;

if (!pluginModule) {
  throw new Error("BSB_TEST_PLUGIN_MODULE is required for observable-default tests");
}

const resolvedModule = path.resolve(pluginModule);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require(resolvedModule);
const Plugin = mod.Plugin || mod.default || mod;

describe("plugins/observable-default", () => {
  const obs = createTestObservable();
  const dummyTrace = obs.trace;

  const tempConsole: Record<string, any> = {
    log: null,
    error: null,
    warn: null,
    debug: null,
  };

  const list = Object.keys(tempConsole);
  let consoleCalled = -1;

  const storeConsole = (expect: string | null, expectContains?: string) => {
    consoleCalled = 0;
    for (const key of list) {
      tempConsole[key] = (console as any)[key];
    }
    for (const key of list) {
      (console as any)[key] = () => {
        consoleCalled = 1;
        if (expect && key !== expect) {
          assert.fail("Invalid console called: " + key);
        }
      };
    }
    if (expectContains) {
      (console as any)[expect!] = (...data: Array<any>) => {
        consoleCalled = 1;
        const text = data.map((item) => String(item)).join(" ");
        const messagePart = text.includes(" | ") ? text.split(" | ")[1] : text;
        assert.ok(messagePart.includes(expectContains));
      };
    }
  };

  const restoreConsole = () => {
    for (const key of list) {
      (console as any)[key] = tempConsole[key];
    }
    if (consoleCalled === -1) {
      assert.fail("Console not setup!");
    }
  };

  it("should log debug when not production", async () => {
    const plugin = new Plugin(getObservableConstructorConfig("development"));
    storeConsole("debug", "[DEBUG]");
    plugin.debug(dummyTrace, "test-plugin", "My Msg", {});
    restoreConsole();
  });

  it("should not log debug in production", async () => {
    const plugin = new Plugin(getObservableConstructorConfig("production"));
    storeConsole(null);
    plugin.debug(dummyTrace, "test-plugin", "My Msg", {});
    restoreConsole();
    assert.ok(consoleCalled === 0);
  });

  it("should log info", async () => {
    const plugin = new Plugin(getObservableConstructorConfig());
    storeConsole("log", "[INFO]");
    plugin.info(dummyTrace, "info-plugin", "My Msg", {});
    restoreConsole();
  });

  it("should log warn", async () => {
    const plugin = new Plugin(getObservableConstructorConfig());
    storeConsole("warn", "[WARN]");
    plugin.warn(dummyTrace, "warn-plugin", "My Msg", {});
    restoreConsole();
  });

  it("should log error with string", async () => {
    const plugin = new Plugin(getObservableConstructorConfig());
    storeConsole("error", "[ERROR]");
    plugin.error(dummyTrace, "err-plugin", "My Msg", {});
    restoreConsole();
  });

  it("should log error with BSBError raw", async () => {
    const plugin = new Plugin(getObservableConstructorConfig());
    const err = new BSBError(dummyTrace, "My Msg");
    storeConsole("error", "[ERROR]");
    plugin.error(dummyTrace, "err-plugin", err, {});
    restoreConsole();
  });

  it("should log error with BSBError without raw", async () => {
    const plugin = new Plugin(getObservableConstructorConfig());
    const err = new BSBError(dummyTrace, "My Msg");
    (err as any).raw = null;
    storeConsole("error", "[ERROR]");
    plugin.error(dummyTrace, "err-plugin", err, {});
    restoreConsole();
  });
});
