import { describe, it } from "mocha";
import * as assert from "assert";
import { z } from "zod";
import { SBServices } from "../../serviceBase/services";
import { MockSBEvents, MockSBObservable } from "../mocks";

describe("SBServices", () => {
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
    const schema = z.object({
      enabled: z.boolean().default(true),
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
});
