import assert from "assert";
import { LoggerBase } from "../../../src/logger/logger";
import { ErrorMessages } from "../../../src/interfaces/static";

describe("LoggerBase", function () {
  describe("formatLog", function () {
    it("Should return string when meta is undefined", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(ojb.formatLog("TEST"), "TEST");
    });
    it("Should return string when meta is null", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(ojb.formatLog("TEST", null), "TEST");
    });
    it("Should return string when meta is a string", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(ojb.formatLog("TEST", ""), "TEST");
    });
    it("Should return string when meta is a number", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(ojb.formatLog("TEST", 5), "TEST");
    });
    it("Should format correctly", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(ojb.formatLog("HTEST {a}", { a: "B" }), "HTEST B");
    });
    it("Should format *null/undefined* when a value found doesnt exist", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(
        ojb.formatLog("HTEST {a}", {}),
        "HTEST *null/undefined*"
      );
    });
    it("Should format *null/undefined* when a value found is undefined", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      assert.strictEqual(
        ojb.formatLog("HTEST {a}", { a: undefined }),
        "HTEST *null/undefined*"
      );
    });
    it("Should format DT in ISO when a value found is a date", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}", { f: dt }),
        "HTEST 2023-07-22T15:38:30.000Z"
      );
    });
    it("Should format DT in ISO when a value found is a date 2", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}@{e}", { e: "DD", f: dt }),
        "HTEST 2023-07-22T15:38:30.000Z@DD"
      );
    });
    it("Should format DT in ISO when a value found is a date 3", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1689694710000); // 18 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f.y}@{e}", { e: "DD", f: { y: dt } }),
        "HTEST 2023-07-18T15:38:30.000Z@DD"
      );
    });
    it("Should format DT in ISO when a value found is a date 4", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      let dt2 = new Date(1689694710000); // 18 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f.y}@{e}:{a.0}:{a.1}", {
          a: ["E", dt2],
          e: "DD",
          f: { y: dt },
        }),
        "HTEST 2023-07-22T15:38:30.000Z@DD:E:2023-07-18T15:38:30.000Z"
      );
    });
    it("Should format json when a value found is an object", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}@{e}", { e: "DD", f: { y: dt } }),
        'HTEST {"y":"2023-07-22T15:38:30.000Z"}@DD'
      );
    });
    it("Should format direct date", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("{y}", { y: dt }),
        "2023-07-22T15:38:30.000Z"
      );
    });
    it("Should format iso date", async () => {
      const isIsoDate = (str: string) => {
        if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str))
          return false;
        const d = new Date(str);
        return (
          d instanceof Date && !isNaN(d.getTime()) && d.toISOString() === str
        ); // valid date
      };
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(isIsoDate(ojb.formatLog("{y}", { y: dt })), true);
    });
    it("Should format json when a value found is an array", async () => {
      let ojb = new LoggerBase("", "", "", {} as any) as any;
      let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}@{e}:{a.0}", {
          a: ["E", "F"],
          e: "DD",
          f: { y: dt },
        }),
        'HTEST {"y":"2023-07-22T15:38:30.000Z"}@DD:E'
      );
    });
  });

  describe("Default methods", function () {
    it("reportStat should throw", async () => {
      try {
        let myobj = new LoggerBase("a", "b", "c", {} as any);
        await myobj.reportStat("a", "b", 1);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
      }
    });
    it("reportTextStat should throw", async () => {
      try {
        let myobj = new LoggerBase("a", "b", "c", {} as any);
        await myobj.reportTextStat("a", "b", 1);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
      }
    });
    it("debug should throw", async () => {
      try {
        let myobj = new LoggerBase("a", "b", "c", {} as any);
        await myobj.debug("a", "b", 1);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
      }
    });
    it("info should throw", async () => {
      try {
        let myobj = new LoggerBase("a", "b", "c", {} as any);
        await myobj.info("a", "b", 1);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
      }
    });
    it("warn should throw", async () => {
      try {
        let myobj = new LoggerBase("a", "b", "c", {} as any);
        await myobj.warn("a", "b", 1);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
      }
    });
    it("error should throw", async () => {
      try {
        let myobj = new LoggerBase("a", "b", "c", {} as any);
        await myobj.error("a", "b", 1);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
      }
    });
  });
});
