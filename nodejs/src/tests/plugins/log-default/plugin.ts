import assert from "assert";
import { Logger, LogLevels } from "../../../plugins/log-default/plugin";

describe("plugins/log-default", () => {
  describe("console.x", () => {
    let tempCCStore: any = {
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
      expectMessageContent?: Array<any>
    ) => {
      consoleEventCalled = 0;
      for (let consol of listOfConsoles)
        tempCCStore[consol] = (console as any)[consol];
      if (expectMessageContent !== undefined) {
        consoleExpectMessageContent = {
          expectMessageContent,
          logs: [],
        };
        for (let consol of listOfConsoles.filter((x) => x !== expect))
          (console as any)[consol] = () => {
            consoleEventCalled = 1;
            assert.fail("Invalid console called!: " + consol);
          };
        for (let consol of listOfConsoles.filter((x) => x === expect))
          (console as any)[consol] = (...data: Array<any>) => {
            consoleEventCalled = 1;
            consoleExpectMessageContent.logs.push(data);
          };
      } else if (expectMessage === undefined) {
        consoleEventCalled = 1;
        for (let consol of listOfConsoles)
          (console as any)[consol] = () => {
            consoleEventCalled = 0;
            assert.fail("Invalid console called!: " + consol);
          };
      } else {
        for (let consol of listOfConsoles.filter((x) => x !== expect))
          (console as any)[consol] = () => {
            consoleEventCalled = 1;
            assert.fail("Invalid console called!: " + consol);
          };
        for (let consol of listOfConsoles.filter((x) => x === expect))
          (console as any)[consol] = (...data: Array<any>) => {
            consoleEventCalled = 1;
            assert.equal(data.length, expectMessage.length);
            for (let xx = 0; xx < expectMessage.length; xx++) {
              if (expectMessage[xx] === null) continue;
              assert.equal(data[xx], expectMessage[xx]);
            }
          };
      }
    };
    const restoreConsole = () => {
      for (let consol of listOfConsoles as any)
        (console as any)[consol] = tempCCStore[consol];
      if (consoleEventCalled === -1) assert.fail("Console not setup!");
      if (consoleEventCalled === 0) assert.fail("No console called!");
      if (consoleEventCalled === 1 && consoleExpectMessageContent !== null) {
        for (
          let xx = 0;
          xx < consoleExpectMessageContent.expectMessageContent.length;
          xx++
        ) {
          let has = false;
          for (let item of consoleExpectMessageContent.logs) {
            if (
              item
                .toString()
                .indexOf(
                  consoleExpectMessageContent.expectMessageContent[xx]
                ) >= 0
            ) {
              has = true;
              break;
            }
          }
          assert.ok(
            has,
            `Does not contain '${
              consoleExpectMessageContent.expectMessageContent[xx]
            }': ${consoleExpectMessageContent.logs.join(",")}`
          );
        }
      }
      consoleEventCalled = -1;
      consoleExpectMessageContent = null;
    };
    it("should console a stat event", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("debug", [null, "[STAT] [DEFAULT-STAT] [val=2]"]);
      await plugin.reportStat("default-stat", "val", 2);
      restoreConsole();
    });
    it("should console a text stat event", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("debug", [null, "[STAT] [DEFAULT-DBG] My Msg"]);
      await plugin.reportTextStat("default-DbG", "My Msg");
      restoreConsole();
    });
    it("should console a debug event", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("debug", [null, "[DEBUG] [DEFAULT-DBG] My Msg"]);
      await plugin.debug("default-DbG", "My Msg");
      restoreConsole();
    });
    it("should console a debug event (meta)", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("debug", [
        null,
        "[DEBUG] [DEFAULT-DBG] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.debug("default-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("should console a info event", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("log", [null, "[INFO] [INFO-DBG] My Msg"]);
      await plugin.info("info-DbG", "My Msg");
      restoreConsole();
    });
    it("should console a info event (meta)", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("log", [
        null,
        "[INFO] [INFO-DBG] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.info("info-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("should console a error event", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("error", [null, "[ERROR] [INFEE-DBG] My Msg"]);
      await plugin.error("infee-DbG", "My Msg");
      restoreConsole();
    });
    it("should console a error event (meta)", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("error", [
        null,
        "[ERROR] [INFE-DBG] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.error("infe-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("should console a warn event", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("warn", [null, "[WARN] [INFOW-DBG] My Msg"]);
      await plugin.warn("infoW-DbG", "My Msg");
      restoreConsole();
    });
    it("should console a warn event (meta)", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      storeConsole("warn", [
        null,
        "[WARN] [INFW-DBG] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.warn("infW-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("running debug, should debug everything", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = true;
      (plugin as any).runningLive = false;
      storeConsole("debug", [
        null,
        "[DEBUG] [DEFAULT-DBG] My Msg cHEESE and a,b (5)",
      ]);
      await plugin.debug("default-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });
    it("running non-debug, should not debug anything", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = false;
      (plugin as any).runningLive = false;
      storeConsole("debug");
      await plugin.debug("infW-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });
    it("running live-debug, should not debug anything", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = false;
      (plugin as any).runningLive = true;
      storeConsole("debug");
      await plugin.debug("infW-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
      restoreConsole();
    });

    it("running non-debug, should not stat anything", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = false;
      (plugin as any).runningLive = false;
      storeConsole("debug");
      await plugin.reportStat("infW-DbG", "a", 3);
      restoreConsole();
    });
    it("running live, should not output PI info", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = false;
      (plugin as any).runningLive = true;
      storeConsole("log");
      await plugin.info(
        "infW-DbG",
        "My Msg {che} and {chi} ({te})",
        {
          che: "cHEESE",
          chi: ["a", "b"],
          te: 5,
        },
        true
      );
      restoreConsole();
    });
    it("running live, should not output PI warn", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = false;
      (plugin as any).runningLive = true;
      storeConsole("warn");
      await plugin.warn(
        "infW-DbG",
        "My Msg {che} and {chi} ({te})",
        {
          che: "cHEESE",
          chi: ["a", "b"],
          te: 5,
        },
        true
      );
      restoreConsole();
    });
    it("running live, should not output PI error", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = false;
      (plugin as any).runningLive = true;
      storeConsole("error");
      await plugin.error(
        "infW-DbG",
        "My Msg {che} and {chi} ({te})",
        {
          che: "cHEESE",
          chi: ["a", "b"],
          te: 5,
        },
        true
      );
      restoreConsole();
    });
    it("Stack report", async () => {
      const plugin = new Logger("default-logger", "./", "./", null as any);
      (plugin as any).runningDebug = true;
      (plugin as any).runningLive = false;
      storeConsole("error", undefined, [
        "test-error",
        "src/tests/plugins/log-default/plugin.ts:",
      ]);
      await plugin.error("infW-DbG", new Error("test-error"));
      restoreConsole();
    });
  });
  describe("console mocked/overriden", () => {
    it("should mocked a stat event", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.STAT) return assert.fail(new Error(message));
        assert.equal(message, "[STAT] [DEFAULT-STAT] [val=2]");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.reportStat("default-stat", "val", 2);
    });

    it("should mocked a debug event", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.DEBUG) return assert.fail(new Error(message));
        assert.equal(message, "[DEBUG] [DEFAULT-DBG] My Msg");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.debug("default-DbG", "My Msg");
    });
    it("should mocked a debug event (meta)", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.DEBUG) return assert.fail(new Error(message));
        assert.equal(
          message,
          "[DEBUG] [DEFAULT-DBG] My Msg cHEESE and a,b (5)"
        );
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.debug("default-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });

    it("should mocked a info event", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.INFO) return assert.fail(new Error(message));
        assert.equal(message, "[INFO] [INFO-DBG] My Msg");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.info("info-DbG", "My Msg");
    });
    it("should mocked a info event (meta)", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.INFO) return assert.fail(new Error(message));
        assert.equal(message, "[INFO] [INFO-DBG] My Msg cHEESE and a,b (5)");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.info("info-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });

    it("should mocked a error event", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.ERROR) return assert.fail(new Error(message));
        assert.equal(message, "[ERROR] [INFEE-DBG] My Msg");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.error("infee-DbG", "My Msg");
    });
    it("should mocked a error event (meta)", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.ERROR) return assert.fail(new Error(message));
        assert.equal(message, "[ERROR] [INFE-DBG] My Msg cHEESE and a,b (5)");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.error("infe-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });

    it("should mocked a warn event", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.WARN) return assert.fail(new Error(message));
        assert.equal(message, "[WARN] [INFOW-DBG] My Msg");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.warn("infoW-DbG", "My Msg");
    });
    it("should mocked a warn event (meta)", async () => {
      const fakeLogFunc = (level: number, message: string): any => {
        if (level !== LogLevels.WARN) return assert.fail(new Error(message));
        assert.equal(message, "[WARN] [INFW-DBG] My Msg cHEESE and a,b (5)");
      };

      const plugin = new Logger(
        "default-logger",
        "./",
        "./",
        null as any,
        fakeLogFunc
      );
      await plugin.warn("infW-DbG", "My Msg {che} and {chi} ({te})", {
        che: "cHEESE",
        chi: ["a", "b"],
        te: 5,
      });
    });
  });
});
