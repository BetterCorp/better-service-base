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

// describe("EventsBase", function () {
//   describe("Constructor", async function () {
//     it("Should construct correctly [pluginName]", async () => {
//       let myobj = new EventsBase("pluginNameX", "cwd", "packageCwd", {} as any);
//       assert.strictEqual(myobj.pluginName, "pluginNameX");
//     });
//     it("Should construct correctly [cwd]", async () => {
//       let myobj = new EventsBase("pluginNameX", "cwdD", "packageCwd", {} as any);
//       assert.strictEqual((myobj as any).cwd, "cwdD");
//     });
//     it("Should construct correctly [packageCwd]", async () => {
//       let myobj = new EventsBase(
//         "pluginNameX",
//         "cwdD",
//         "packageCwdY",
//         {} as any
//       );
//       assert.strictEqual((myobj as any).packageCwd, "packageCwdY");
//     });
//     it("Should construct correctly [logger]", async () => {
//       let myobj = new EventsBase("pluginNameX", "cwdD", "packageCwdY", {
//         alog: true,
//       } as any);
//       assert.strictEqual((myobj as any).log.alog, true);
//     });
//   });
//   describe("Default methods", function () {
//     it("onBroadcast should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.onBroadcast("a", "b", "c", async () => {});
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("emitBroadcast should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.emitBroadcast("a", "b", "c", []);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("onEvent should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.onEvent("a", "b", "c", async () => {});
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("emitEvent should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.emitEvent("a", "b", "c", []);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("onReturnableEvent should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.onReturnableEvent("a", "b", "c", async () => {});
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("emitEventAndReturn should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.emitEventAndReturn("a", "b", "c", 1, []);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("receiveStream should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.receiveStream("a", async () => {});
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//     it("sendStream should throw", async () => {
//       try {
//         let myobj = new EventsBase("a", "b", "c", {} as any);
//         await myobj.sendStream("a", "", {} as any);
//         assert.fail("Should have thrown");
//       } catch (e: any) {
//         assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
//       }
//     });
//   });
// });
