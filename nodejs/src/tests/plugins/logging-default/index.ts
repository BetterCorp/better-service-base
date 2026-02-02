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
import {
  Plugin,
  LOG_LEVELS,
  LogLevels,
} from "../../../plugins/logging-default/index";
import { createTestObservable } from "../../trace";
import { getLoggingConstructorConfig } from '../../mocks';


describe("plugins/logging-default", () => {
  const obs = createTestObservable();
  const dummyTrace = obs.trace; // logging-default plugin still uses DTrace internally
  describe("console.x", () => {
    const tempCCStore: any = {
      log: null,
      error: null,
      warn: null,
      debug: null,
    };
    const listOfConsoles = Object.keys(tempCCStore);
    let consoleEventCalled = -1;
    let consoleExpectMessageContent: any = null;
    const storeConsole = (
      expect: string,
      expectMessage?: Array<any>,
      expectMessageContent?: Array<any>,
    ) => {
      consoleEventCalled = 0;
      for (const consol of listOfConsoles) {
        tempCCStore[consol] = (
          console as any
        )[consol];
      }
      if (expectMessageContent !== undefined) {
        consoleExpectMessageContent = {
          expectMessageContent,
          logs: [],
        };
        for (const consol of listOfConsoles.filter((x) => x !== expect)) {
          (
            console as any
          )[consol] = () => {
            consoleEventCalled = 1;
            assert.fail("Invalid console called!: " + consol);
          };
        }
        for (const consol of listOfConsoles.filter((x) => x === expect)) {
          (
            console as any
          )[consol] = (...data: Array<any>) => {
            consoleEventCalled = 1;
            consoleExpectMessageContent.logs.push(data);
          };
        }
      }
      else if (expectMessage === undefined) {
        consoleEventCalled = 1;
        for (const consol of listOfConsoles) {
          (
            console as any
          )[consol] = () => {
            consoleEventCalled = 0;
            assert.fail("Invalid console called!: " + consol);
          };
        }
      }
      else {
        for (const consol of listOfConsoles.filter((x) => x !== expect)) {
          (
            console as any
          )[consol] = () => {
            consoleEventCalled = 1;
            assert.fail("Invalid console called!: " + consol);
          };
        }
        for (const consol of listOfConsoles.filter((x) => x === expect)) {
          (
            console as any
          )[consol] = (...data: Array<any>) => {
            consoleEventCalled = 1;
            assert.equal(data.length, expectMessage.length);
            for (let xx = 0; xx < expectMessage.length; xx++) {
              if (expectMessage[xx] === null) {
                continue;
              }
              // Handle timestamped log format: split on | and compare only the message part
              const actualMessage = typeof data[xx] === 'string' && data[xx].includes(' | ')
                ? data[xx].split(' | ')[1]
                : data[xx];
              assert.equal(actualMessage, expectMessage[xx]);
            }
          };
        }
      }
    };
    const restoreConsole = () => {
      for (const consol of listOfConsoles as any) {
        (
          console as any
        )[consol] = tempCCStore[consol];
      }
      if (consoleEventCalled === -1) {
        assert.fail("Console not setup!");
      }
      if (consoleEventCalled === 0) {
        assert.fail("No console called!");
      }
      if (consoleEventCalled === 1 && consoleExpectMessageContent !== null) {
        for (
          let xx = 0;
          xx < consoleExpectMessageContent.expectMessageContent.length;
          xx++
        ) {
          let has = false;
          for (const item of consoleExpectMessageContent.logs) {
            const itemStr = item.toString();
            // Handle timestamped log format: split on | and check only the message part
            const messagePart = itemStr.includes(' | ') ? itemStr.split(' | ')[1] : itemStr;
            if (
              messagePart.indexOf(
                consoleExpectMessageContent.expectMessageContent[xx],
              ) >= 0
            ) {
              has = true;
              break;
            }
          }
          assert.ok(
            has,
            `Does not contain '${consoleExpectMessageContent.expectMessageContent[xx]
            }': ${consoleExpectMessageContent.logs.join(",")}`,
          );
        }
      }
      consoleEventCalled = -1;
      consoleExpectMessageContent = null;
    };
    it("should console a debug event", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("debug", [
        null,
        "[DEBUG] [DEFAULT-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg",
      ]);
      await plugin.debug("default-DbG", dummyTrace, "My Msg", {});
      restoreConsole();
    });
    it("should console a debug event (meta)", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("debug", [
        null,
        "[DEBUG] [DEFAULT-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.debug("default-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("should console a info event", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("log", [
        null,
        "[INFO] [INFO-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg",
      ]);
      await plugin.info("info-DbG", dummyTrace, "My Msg", {});
      restoreConsole();
    });
    it("should console a info event (meta)", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("log", [
        null,
        "[INFO] [INFO-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.info("info-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("should console a error event", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("error", [
        null,
        "[ERROR] [INFEE-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg",
      ]);
      await plugin.error("infee-DbG", dummyTrace, "My Msg", {});
      restoreConsole();
    });
    it("should console a error event (meta)", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("error", [
        null,
        "[ERROR] [INFE-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.error("infe-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("should console a warn event", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("warn", [
        null,
        "[WARN] [INFOW-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg",
      ]);
      await plugin.warn("infoW-DbG", dummyTrace, "My Msg", {});
      restoreConsole();
    });
    it("should console a warn event (meta)", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("warn", [
        null,
        "[WARN] [INFW-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.warn("infW-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("running debug, should debug everything", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig("development"));
      storeConsole("debug", [
        null,
        "[DEBUG] [DEFAULT-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.debug("default-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });
    it("running non-debug, should not debug anything", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig("production"));
      storeConsole("debug");
      await plugin.debug("infW-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });
    it("running live-debug, should debug", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig("development"));
      storeConsole("debug", [
        null,
        "[DEBUG] [INFW-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.debug("infW-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });
    it("Stack report", async () => {
      const plugin = new Plugin(getLoggingConstructorConfig());
      storeConsole("error", undefined, ["Stack trace for: Error: My Error\n    at Context.<anonymous>"]);
      await plugin.error("infW-DbG", dummyTrace, "My Msg", new Error("My Error"));
      restoreConsole();
    });
  });
  describe("console mocked/overriden", () => {
    it("should mocked a debug event", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.DEBUG);
        assert.equal(message, "[DEBUG] [DEFAULT-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.debug("default-DbG", dummyTrace, "My Msg", {});
    });
    it("should mocked a debug event (meta)", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.DEBUG);
        assert.equal(message, "[DEBUG] [DEFAULT-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.debug("default-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });

    it("should mocked a info event", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.INFO);
        assert.equal(message, "[INFO] [INFO-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.info("info-DbG", dummyTrace, "My Msg", {});
    });
    it("should mocked a info event (meta)", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.INFO);
        assert.equal(message, "[INFO] [INFO-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.info("info-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });

    it("should mocked a error event", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.ERROR);
        assert.equal(message, "[ERROR] [INFEE-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.error("infee-DbG", dummyTrace, "My Msg", {});
    });
    it("should mocked a error event (meta)", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.ERROR);
        assert.equal(message, "[ERROR] [INFE-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.error("infe-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });

    it("should mocked a warn event", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.WARN);
        assert.equal(message, "[WARN] [INFOW-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.warn("infoW-DbG", dummyTrace, "My Msg", {});
    });
    it("should mocked a warn event (meta)", async () => {
      const fakeLogFunc = (level: LogLevels, message: string): any => {
        assert.equal(level, LOG_LEVELS.WARN);
        assert.equal(message, "[WARN] [INFW-DBG] [TRACE ID ERROR:SPAN ID ERROR] My Msg cHEESE and a,b (5)");
      };
      const plugin = new Plugin(getLoggingConstructorConfig(), fakeLogFunc);
      await plugin.warn("infW-DbG", dummyTrace, "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });
  });
});
