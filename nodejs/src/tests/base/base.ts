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

// import {SinonStubbedInstance, createStubInstance} from "sinon";
// import {
//   MainBase,
//   Base,
//   BaseWithConfig,
//   BaseWithLogging,
//   BaseWithLoggingAndConfig,
//   PluginLogger,
//   DEBUG_MODE,
//   SBLogging, MainBaseConfig, BaseWithConfigConfig,
// } from "../../index.js";
// import {z} from "zod";
// import {expect} from "chai";
//
// class MainBaseRef
//     extends MainBase {
//   constructor(config: MainBaseConfig) {
//     super(config);
//   }
// }
//
// const zodtype = z.object({
//   testProp: z.string(),
// });
//
// describe("Base Classes", async () => {
//   const defaultConfig: BaseWithConfigConfig<null> = {
//     appId: "test-app",
//     mode: "development" as DEBUG_MODE,
//     pluginName: "test-plugin",
//     cwd: "/test/cwd",
//     packageCwd: "/test/package",
//     pluginCwd: "/test/plugin",
//     config: undefined,
//   };
//
//   describe("MainBase", () => {
//     it("should initialize with correct properties", () => {
//       const mainBase = new MainBaseRef(defaultConfig);
//       expect(mainBase["appId"])
//           .to
//           .equal("test-app");
//       expect(mainBase["mode"])
//           .to
//           .equal("development");
//       expect(mainBase["pluginName"])
//           .to
//           .equal("test-plugin");
//       expect(mainBase["cwd"])
//           .to
//           .equal("/test/cwd");
//       expect(mainBase["packageCwd"])
//           .to
//           .equal("/test/package");
//       expect(mainBase["pluginCwd"])
//           .to
//           .equal("/test/plugin");
//     });
//
//     it("should not set pluginName if empty string is provided", () => {
//       const config = {...defaultConfig, pluginName: ""};
//       const mainBase = new MainBaseRef(config);
//       expect(mainBase["pluginName"]).to.be.undefined;
//     });
//   });
//
//   describe("Base", () => {
//     class TestBase
//         extends Base {
//       dispose() {
//       }
//
//       init() {
//       }
//
//       run() {
//       }
//     }
//
//     it("should initialize with correct properties", () => {
//       const base = new TestBase(defaultConfig);
//       expect(base["appId"])
//           .to
//           .equal("test-app");
//       expect(base["mode"])
//           .to
//           .equal("development");
//       expect(base["pluginName"])
//           .to
//           .equal("test-plugin");
//     });
//
//     it("should have abstract methods", () => {
//       const base = new TestBase(defaultConfig);
//       expect(base.dispose)
//           .to
//           .be
//           .a("function");
//       expect(base.init)
//           .to
//           .be
//           .a("function");
//       expect(base.run)
//           .to
//           .be
//           .a("function");
//     });
//   });
//
//   describe("BaseWithConfig", () => {
//     class TestBaseWithConfig
//         extends BaseWithConfig<typeof zodtype> {
//       dispose() {
//       }
//
//       init() {
//       }
//
//       run() {
//       }
//     }
//
//     it("should initialize with correct properties including config", () => {
//       const config: BaseWithConfigConfig<typeof zodtype> = {...defaultConfig, config: zodtype};
//       const baseWithConfig = new TestBaseWithConfig(config);
//       expect(baseWithConfig["config"])
//           .to
//           .deep
//           .equal({testProp: "test-value"});
//     });
//   });
//
//   describe("BaseWithLogging", () => {
//     let sbLoggingStub: SinonStubbedInstance<SBLogging>;
//
//     beforeEach(() => {
//       sbLoggingStub = createStubInstance(SBLogging);
//     });
//
//     class TestBaseWithLogging
//         extends BaseWithLogging {
//       dispose() {
//       }
//
//       init() {
//       }
//
//       run() {
//       }
//     }
//
//     it("should initialize with correct properties including logger", () => {
//       const config = {...defaultConfig, sbLogging: sbLoggingStub};
//       const baseWithLogging = new TestBaseWithLogging(config);
//       expect(baseWithLogging["log"])
//           .to
//           .be
//           .instanceOf(PluginLogger);
//     });
//   });
//
//   describe("BaseWithLoggingAndConfig", () => {
//     let sbLoggingStub: SinonStubbedInstance<SBLogging>;
//
//     beforeEach(() => {
//       sbLoggingStub = createStubInstance(SBLogging);
//     });
//
//     class TestBaseWithLoggingAndConfig
//         extends BaseWithLoggingAndConfig<typeof zodtype> {
//       dispose() {
//       }
//
//       init() {
//       }
//
//       run() {
//       }
//     }
//
//     it("should initialize with correct properties including logger and config", () => {
//       const config = {
//         ...defaultConfig,
//         sbLogging: sbLoggingStub,
//         config: zodtype,
//       };
//       const baseWithLoggingAndConfig = new TestBaseWithLoggingAndConfig(config);
//       expect(baseWithLoggingAndConfig["log"])
//           .to
//           .be
//           .instanceOf(PluginLogger);
//       expect(baseWithLoggingAndConfig["config"])
//           .to
//           .deep
//           .equal({testProp: "test-value"});
//     });
//
//     it("should create a new logger with createNewLogger method", () => {
//       const config = {
//         ...defaultConfig,
//         sbLogging: sbLoggingStub,
//         config: zodtype,
//       };
//       const baseWithLoggingAndConfig = new TestBaseWithLoggingAndConfig(config);
//       const newLogger = baseWithLoggingAndConfig["createNewLogger"]("sub-plugin");
//       expect(newLogger)
//           .to
//           .be
//           .instanceOf(PluginLogger);
//     });
//   });
// });