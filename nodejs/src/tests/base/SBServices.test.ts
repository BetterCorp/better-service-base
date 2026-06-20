import * as assert from "assert";
import * as av from "anyvali";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SBConfig } from "../../serviceBase/config.js";
import { SBPlugins } from "../../serviceBase/plugins.js";
import { SBServices } from "../../serviceBase/services.js";
import { MockSBEvents, MockSBObservable } from "../mocks.js";
import { createTestObservable } from "../trace.js";

describe("SBServices", () => {
  const tempDirs: string[] = [];
  const originalProfile = process.env.BSB_PROFILE;
  const originalConfigFile = process.env.BSB_CONFIG_FILE;

  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.BSB_PROFILE;
    } else {
      process.env.BSB_PROFILE = originalProfile;
    }
    if (originalConfigFile === undefined) {
      delete process.env.BSB_CONFIG_FILE;
    } else {
      process.env.BSB_CONFIG_FILE = originalConfigFile;
    }
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  class TestServicePlugin {
    pluginName: string;
    _clients: any[] = [];
    initBeforePlugins: string[] = [];
    initAfterPlugins: string[] = [];
    runBeforePlugins: string[] = [];
    runAfterPlugins: string[] = [];
    receivedConfig: unknown;

    constructor(config: any) {
      this.pluginName = config.pluginName;
      this.receivedConfig = config.config;
    }

    init() {}
  }

  it("should validate service config in production and pass undefined for missing config", async () => {
    const parseInputs: unknown[] = [];
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-service",
          ref: "demo-service",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: {
              parse: (input: unknown) => {
                parseInputs.push(input);
                return { source: "schema-default" };
              },
            },
          },
          plugin: TestServicePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
          pluginPath: process.cwd(),
        },
      }),
    } as any;
    const services = new SBServices(
      "test-app",
      "production",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
    );
    const sbConfig = {
      getPluginConfig: async () => null,
    } as any;

    await (services as any).addService(
      sbConfig,
      MockSBObservable(),
      MockSBEvents(),
      {
        name: "demo-service",
        package: null,
        plugin: "service-demo",
        version: "1.0.0",
      },
    );

    assert.deepStrictEqual(parseInputs, [undefined]);
    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, { source: "schema-default" });
  });

  it("should preserve explicit service config objects during validation", async () => {
    const schema = av.object({
      enabled: av.optional(av.bool()).default(true),
    });
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-service",
          ref: "demo-service",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestServicePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
          pluginPath: process.cwd(),
        },
      }),
    } as any;
    const services = new SBServices(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
    );
    const sbConfig = {
      getPluginConfig: async () => ({ enabled: false }),
    } as any;

    await (services as any).addService(
      sbConfig,
      MockSBObservable(),
      MockSBEvents(),
      {
        name: "demo-service",
        package: null,
        plugin: "service-demo",
        version: "1.0.0",
      },
    );

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, { enabled: false });
  });

  it("should apply AnyVali optional-wrapper defaults for missing service config", async () => {
    const schema = av.object({
      enabled: av.optional(av.bool()).default(true),
      port: av.optional(av.int32().min(1).max(65535)).default(3210),
      labels: av.optional(av.array(av.string())).default(["default"]),
    });
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-service",
          ref: "demo-service",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestServicePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
          pluginPath: process.cwd(),
        },
      }),
    } as any;
    const services = new SBServices(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
    );
    const sbConfig = {
      getPluginConfig: async () => null,
    } as any;

    await (services as any).addService(
      sbConfig,
      MockSBObservable(),
      MockSBEvents(),
      {
        name: "demo-service",
        package: null,
        plugin: "service-demo",
        version: "1.0.0",
      },
    );

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, {
      enabled: true,
      port: 3210,
      labels: ["default"],
    });
  });

  it("should pass undefined for service config when plugin has no schema", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-service",
          ref: "demo-service",
          version: "1.0.0",
          plugin: TestServicePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
          pluginPath: process.cwd(),
        },
      }),
    } as any;
    const services = new SBServices(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
    );
    const sbConfig = {
      getPluginConfig: async () => ({
        raw: true,
      }),
    } as any;

    await (services as any).addService(
      sbConfig,
      MockSBObservable(),
      MockSBEvents(),
      {
        name: "demo-service",
        package: null,
        plugin: "service-demo",
        version: "1.0.0",
      },
    );

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.strictEqual(activeServices[0].receivedConfig, undefined);
  });

  it("should apply AnyVali direct defaults for missing service config", async () => {
    const schema = av.object({
      host: av.string().minLength(1).default("0.0.0.0"),
      port: av.int32().min(1).max(65535).default(3210),
      labels: av.array(av.string()).default(["default"]),
      nested: av.object({
        mode: av.string().default("auto"),
      }).default({}),
    });
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-service",
          ref: "demo-service",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestServicePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
          pluginPath: process.cwd(),
        },
      }),
    } as any;
    const services = new SBServices(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
    );
    const sbConfig = {
      getPluginConfig: async () => null,
    } as any;

    await (services as any).addService(
      sbConfig,
      MockSBObservable(),
      MockSBEvents(),
      {
        name: "demo-service",
        package: null,
        plugin: "service-demo",
        version: "1.0.0",
      },
    );

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, {
      host: "0.0.0.0",
      port: 3210,
      labels: ["default"],
      nested: {
        mode: "auto",
      },
    });
  });

  it("should apply AnyVali direct defaults around explicit service config", async () => {
    const schema = av.object({
      host: av.string().minLength(1).default("0.0.0.0"),
      port: av.int32().min(1).max(65535).default(3210),
      labels: av.array(av.string()).default(["default"]),
      nested: av.object({
        mode: av.string().default("auto"),
      }).default({}),
    });
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-service",
          ref: "demo-service",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestServicePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
          pluginPath: process.cwd(),
        },
      }),
    } as any;
    const services = new SBServices(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
    );
    const sbConfig = {
      getPluginConfig: async () => ({
        port: 3211,
        nested: {
          extra: true,
        },
        unknown: true,
      }),
    } as any;

    await (services as any).addService(
      sbConfig,
      MockSBObservable(),
      MockSBEvents(),
      {
        name: "demo-service",
        package: null,
        plugin: "service-demo",
        version: "1.0.0",
      },
    );

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, {
      host: "0.0.0.0",
      port: 3211,
      labels: ["default"],
      nested: {
        mode: "auto",
      },
    });
  });

  it("should apply service config defaults through config file startup flow", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bsb-services-flow-"));
    const configPath = join(tempDir, "sec-config.yaml");
    tempDirs.push(tempDir);
    writeFileSync(configPath, `
default:
  services:
    mapped-demo:
      plugin: service-demo
      enabled: true
      config:
        port: 3211
        nested:
          extra: true
        unknown: true
`, "utf8");
    process.env.BSB_PROFILE = "default";
    process.env.BSB_CONFIG_FILE = configPath;

    const schema = av.object({
      host: av.string().minLength(1).default("0.0.0.0"),
      port: av.int32().min(1).max(65535).default(3210),
      dbLocation: av.string().minLength(1).default("data"),
      nested: av.object({
        mode: av.string().default("auto"),
      }).default({}),
    });
    const sbPlugins = {
      loadPlugin: async (_obs: unknown, _pkg: unknown, pluginName: string, mappedName: string) => {
        assert.strictEqual(pluginName, "service-demo");
        assert.strictEqual(mappedName, "mapped-demo");
        return {
          success: true,
          data: {
            name: pluginName,
            ref: pluginName,
            version: "1.0.0",
            serviceConfig: {
              validationSchema: schema,
            },
            plugin: TestServicePlugin,
            packageCwd: tempDir,
            pluginCwd: tempDir,
            pluginPath: tempDir,
          },
        };
      },
    } as any;
    const sbObservable = MockSBObservable();
    const sbConfig = new SBConfig(
      "test-app",
      "development",
      tempDir,
      sbObservable,
      sbPlugins,
      () => createTestObservable(),
    );
    await sbConfig.init();
    const services = new SBServices(
      "test-app",
      "development",
      tempDir,
      sbPlugins,
      sbObservable,
    );

    await services.setup(sbConfig, sbObservable, MockSBEvents());

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, {
      host: "0.0.0.0",
      port: 3211,
      dbLocation: "data",
      nested: {
        mode: "auto",
      },
    });
  });

  it("should apply service config defaults through config file and real plugin loader", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bsb-services-loader-flow-"));
    const configPath = join(tempDir, "sec-config.yaml");
    const pluginDir = join(tempDir, "src", "plugins", "service-demo");
    tempDirs.push(tempDir);
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "test-app",
      version: "1.2.3",
      type: "module",
    }), "utf8");
    await import("node:fs/promises").then((fs) => fs.mkdir(pluginDir, { recursive: true }));
    writeFileSync(configPath, `
default:
  services:
    mapped-demo:
      plugin: service-demo
      enabled: true
      config:
        port: 3211
        nested:
          extra: true
`, "utf8");
    writeFileSync(join(pluginDir, "index.ts"), `
import * as av from ${JSON.stringify(import.meta.resolve("anyvali"))};

export class Config {
  validationSchema = av.object({
    host: av.string().minLength(1).default("0.0.0.0"),
    port: av.int32().min(1).max(65535).default(3210),
    dbLocation: av.string().minLength(1).default("data"),
    nested: av.object({
      mode: av.string().default("auto"),
    }).default({}),
  });
}

export class Plugin {
  _clients = [];
  initBeforePlugins = [];
  initAfterPlugins = [];
  runBeforePlugins = [];
  runAfterPlugins = [];

  constructor(config) {
    this.pluginName = config.pluginName;
    this.receivedConfig = config.config;
  }

  init() {}
}
`, "utf8");
    process.env.BSB_PROFILE = "default";
    process.env.BSB_CONFIG_FILE = configPath;

    const sbPlugins = new SBPlugins(tempDir, "dev");
    const sbObservable = MockSBObservable();
    const sbConfig = new SBConfig(
      "test-app",
      "development",
      tempDir,
      sbObservable,
      sbPlugins,
      () => createTestObservable(),
    );
    await sbConfig.init();
    const services = new SBServices(
      "test-app",
      "development",
      tempDir,
      sbPlugins,
      sbObservable,
    );

    await services.setup(sbConfig, sbObservable, MockSBEvents());

    const activeServices = (services as any)._activeServices;
    assert.strictEqual(activeServices.length, 1);
    assert.deepStrictEqual(activeServices[0].receivedConfig, {
      host: "0.0.0.0",
      port: 3211,
      dbLocation: "data",
      nested: {
        mode: "auto",
      },
    });
  });
});
