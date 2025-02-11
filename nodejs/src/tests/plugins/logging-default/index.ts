import * as assert from "assert";
import {
  Plugin,
  LOG_LEVELS,
  LogLevels,
} from "../../../plugins/logging-default/index";
import { createFakeDTrace } from "../../trace";
import { getLoggingConstructorConfig } from '../../mocks';


describe("plugins/logging-default", () => {
  const dummyTrace = createFakeDTrace();
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
              assert.equal(data[xx], expectMessage[xx]);
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
            if (
              item
                .toString()
                .indexOf(
                  consoleExpectMessageContent.expectMessageContent[xx],
                ) >= 0
            ) {
              has = true;
              break;
            }
          }
          assert.ok(
            has,
            `Does not contain '${ consoleExpectMessageContent.expectMessageContent[xx]
            }': ${ consoleExpectMessageContent.logs.join(",") }`,
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
