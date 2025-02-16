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
