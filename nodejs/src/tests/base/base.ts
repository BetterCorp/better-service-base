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
// } from "../../index";
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