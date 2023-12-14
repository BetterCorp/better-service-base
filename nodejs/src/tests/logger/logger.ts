// import assert from "assert";
// import { LoggerBase } from "../../../src/logger/logger";
// import { ErrorMessages } from "../../base/errorMessages";

// describe("LoggerBase", function () {
//   describe("Default methods", function () {
//     it("reportStat should throw", async () => {
//       try {
//         let myobj = new LoggerBase("a", "b", "c", {} as any);
//         await myobj.reportStat("a", "b", 1);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
//       }
//     });
//     it("reportTextStat should throw", async () => {
//       try {
//         let myobj = new LoggerBase("a", "b", "c", {} as any);
//         await myobj.reportTextStat("a", "b", 1);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
//       }
//     });
//     it("debug should throw", async () => {
//       try {
//         let myobj = new LoggerBase("a", "b", "c", {} as any);
//         await myobj.debug("a", "b", 1);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
//       }
//     });
//     it("info should throw", async () => {
//       try {
//         let myobj = new LoggerBase("a", "b", "c", {} as any);
//         await myobj.info("a", "b", 1);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
//       }
//     });
//     it("warn should throw", async () => {
//       try {
//         let myobj = new LoggerBase("a", "b", "c", {} as any);
//         await myobj.warn("a", "b", 1);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
//       }
//     });
//     it("error should throw", async () => {
//       try {
//         let myobj = new LoggerBase("a", "b", "c", {} as any);
//         await myobj.error("a", "b", 1);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.LoggerNotImplementedProperly);
//       }
//     });
//   });
// });
