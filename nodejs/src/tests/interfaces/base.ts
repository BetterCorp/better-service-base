// import assert from "assert";
// import { BaseWithLogging } from "../../base/base";
// import { ErrorMessages } from "../../base/errorMessages";

// describe("DefaultBase", function () {
//   describe("Default methods", function () {
//     it("getPluginConfig should throw", async () => {
//       try {
//         let myobj = new BaseWithLogging("a", "b", "c", {} as any);
//         (myobj as any).getPluginConfig();
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.BSBNotInit);
//       }
//     });
//     it("getPluginState should throw", async () => {
//       try {
//         let myobj = new BaseWithLogging("a", "b", "c", {} as any);
//         await (myobj as any).getPluginState();
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.BSBNotInit);
//       }
//     });
//   });
// });
