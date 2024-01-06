import { assert } from "chai";
import { LogFormatter } from "../../base";

describe("logFormatter", function () {
  describe("formatLog", function () {
    it("Should return string when meta is undefined", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(ojb.formatLog("TEST"), "TEST");
    });
    it("Should return string when meta is null", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(ojb.formatLog("TEST", null as any), "TEST"); // ts picks up this issue
    });
    it("Should return string when meta is a string", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(ojb.formatLog("TEST", ""), "TEST");
    });
    it("Should return string when meta is a number", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(ojb.formatLog("TEST", 5), "TEST");
    });
    it("Should format correctly", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(ojb.formatLog("HTEST {a}", { a: "B" }), "HTEST B");
    });
    it("Should format *null/undefined* when a value found doesnt exist", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(
        ojb.formatLog("HTEST {a}", {} as any), // ts picks up this issue
        "HTEST *null/undefined*"
      );
    });
    it("Should format *null/undefined* when a value found is undefined", async () => {
      const ojb = new LogFormatter();
      assert.strictEqual(
        ojb.formatLog("HTEST {a}", { a: undefined } as any), // ts picks up this issue
        "HTEST *null/undefined*"
      );
    });
    it("Should format DT in ISO when a value found is a date", async () => {
      const ojb = new LogFormatter();
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}", { f: dt }),
        "HTEST 2023-07-22T15:38:30.000Z"
      );
    });
    it("Should format DT in ISO when a value found is a date 2", async () => {
      const ojb = new LogFormatter();
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}@{e}", { e: "DD", f: dt }),
        "HTEST 2023-07-22T15:38:30.000Z@DD"
      );
    });
    it("Should fail to format DT when a value found is inside an object", async () => {
      const ojb = new LogFormatter();
      const dt = new Date(1689694710000); // 18 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f.y}@{e}", { e: "DD", f: { y: dt } } as any), // ts picks up this issue
        "HTEST *null/undefined*@DD"
      );
    });
    // it("Should format DT in ISO when a value found is a date 4", async () => {
    //   let ojb = new LogFormatter();
    //   let dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
    //   let dt2 = new Date(1689694710000); // 18 Jul 2023 15:38:30 GMT
    //   assert.strictEqual(
    //     ojb.formatLog("HTEST {f.y}@{e}:{a.0}:{a.1}", {
    //       a: ["E", dt2],
    //       e: "DD",
    //       f: { y: dt },
    //     } as any),
    //     "HTEST 2023-07-22T15:38:30.000Z@DD:E:2023-07-18T15:38:30.000Z"
    //   ); // ts picks up this issue
    // });
    it("Should format json when a value found is an object", async () => {
      const ojb = new LogFormatter();
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}@{e}", { e: "DD", f: { y: dt } }),
        'HTEST {"y":"2023-07-22T15:38:30.000Z"}@DD'
      );
    });
    it("Should format direct date", async () => {
      const ojb = new LogFormatter();
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
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
      const ojb = new LogFormatter();
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(isIsoDate(ojb.formatLog("{y}", { y: dt })), true);
    });
    it("Should format json when a value found is an array", async () => {
      const ojb = new LogFormatter();
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.strictEqual(
        ojb.formatLog("HTEST {f}@{e}:{a}", {
          a: ["E", "F"],
          e: "DD",
          f: { y: dt },
        } as any),
        'HTEST {"y":"2023-07-22T15:38:30.000Z"}@DD:E,F'
      ); // ts picks up this issue
    });
  });
});
