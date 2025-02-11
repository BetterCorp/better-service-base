import { expect } from "chai";
import { BSBConfig, BSBConfigRef } from "../../base/BSBConfig";
import { createFakeDTrace } from "../trace";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED, BSBError } from "../../base/errorMessages";
import { DTrace, EventsConfig, LoggingConfig, PluginDefinition, PluginType } from "../../interfaces";
import { MockSBLogging } from "../mocks";

describe("BSBConfig", () => {
  const dummyTrace = createFakeDTrace();

  describe("BSBConfigRef", () => {
    let config: BSBConfigRef;

    beforeEach(() => {
      config = new BSBConfigRef({
        appId: "test-app",
        mode: "development",
        cwd: process.cwd(),
        packageCwd: process.cwd(),
        pluginCwd: process.cwd(),
        pluginName: "test-plugin",
        pluginVersion: "0.0.0",
        sbLogging: MockSBLogging(),
      });
    });

    it("should throw not implemented for getLoggingPlugins", async () => {
      try {
        await config.getLoggingPlugins(dummyTrace);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getLoggingPlugins").toString());
      }
    });

    it("should throw not implemented for getMetricsPlugins", async () => {
      try {
        await config.getMetricsPlugins(dummyTrace);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getMetricsPlugins").toString());
      }
    });

    it("should throw not implemented for getEventsPlugins", async () => {
      try {
        await config.getEventsPlugins(dummyTrace);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getEventsPlugins").toString());
      }
    });

    it("should throw not implemented for getServicePlugins", async () => {
      try {
        await config.getServicePlugins(dummyTrace);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getServicePlugins").toString());
      }
    });

    it("should throw not implemented for getPluginConfig", async () => {
      try {
        await config.getPluginConfig(dummyTrace, "events", "test-plugin");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getPluginConfig").toString());
      }
    });

    it("should throw not implemented for getServicePluginDefinition", async () => {
      try {
        await config.getServicePluginDefinition(dummyTrace, "test-plugin");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBConfigRef", "getServicePluginName").toString());
      }
    });
  });

  describe("Concrete Implementation", () => {
    class TestConfig extends BSBConfig {
      constructor(config: any) {
        super(config);
      }

      dispose(): void {
        // No-op for testing
      }

      async init(trace: DTrace): Promise<void> {
        // No-op for testing
      }

      async getLoggingPlugins(trace: DTrace): Promise<Record<string, LoggingConfig>> {
        return {
          "test-plugin": {
            enabled: true,
            plugin: "test-plugin",
            version: "0.0.0"
          }
        };
      }

      async getMetricsPlugins(trace: DTrace): Promise<Record<string, PluginDefinition>> {
        return {
          "test-plugin": {
            enabled: true,
            plugin: "test-plugin",
            version: "0.0.0"
          }
        };
      }

      async getEventsPlugins(trace: DTrace): Promise<Record<string, EventsConfig>> {
        return {
          "test-plugin": {
            enabled: true,
            plugin: "test-plugin",
            version: "0.0.0"
          }
        };
      }

      async getServicePlugins(trace: DTrace): Promise<Record<string, PluginDefinition>> {
        return {
          "test-plugin": {
            enabled: true,
            plugin: "test-plugin",
            version: "0.0.0"
          }
        };
      }

      async getPluginConfig(trace: DTrace, pluginType: PluginType, plugin: string): Promise<object | null> {
        return {
          key: "value"
        };
      }

      async getServicePluginDefinition(trace: DTrace, pluginName: string): Promise<{ name: string; enabled: boolean }> {
        return {
          name: pluginName,
          enabled: true
        };
      }
    }

    let config: TestConfig;

    beforeEach(() => {
      config = new TestConfig({
        appId: "test-app",
        mode: "development",
        cwd: process.cwd(),
        packageCwd: process.cwd(),
        pluginCwd: process.cwd(),
        pluginName: "test-plugin",
        pluginVersion: "0.0.0",
        sbLogging: MockSBLogging(),
      });
    });

    it("should return logging plugins config", async () => {
      const result = await config.getLoggingPlugins(dummyTrace);
      expect(result).to.deep.equal({
        "test-plugin": {
          enabled: true,
          plugin: "test-plugin",
          version: "0.0.0"
        }
      });
    });

    it("should return metrics plugins config", async () => {
      const result = await config.getMetricsPlugins(dummyTrace);
      expect(result).to.deep.equal({
        "test-plugin": {
          enabled: true,
          plugin: "test-plugin",
          version: "0.0.0"
        }
      });
    });

    it("should return events plugins config", async () => {
      const result = await config.getEventsPlugins(dummyTrace);
      expect(result).to.deep.equal({
        "test-plugin": {
          enabled: true,
          plugin: "test-plugin",
          version: "0.0.0"
        }
      });
    });

    it("should return service plugins config", async () => {
      const result = await config.getServicePlugins(dummyTrace);
      expect(result).to.deep.equal({
        "test-plugin": {
          enabled: true,
          plugin: "test-plugin",
          version: "0.0.0"
        }
      });
    });

    it("should return plugin config", async () => {
      const result = await config.getPluginConfig(dummyTrace, "events", "test-plugin");
      expect(result).to.deep.equal({
        key: "value"
      });
    });

    it("should return service plugin definition", async () => {
      const result = await config.getServicePluginDefinition(dummyTrace, "test-plugin");
      expect(result).to.deep.equal({
        name: "test-plugin",
        enabled: true
      });
    });

    it("should do nothing when run is called", () => {
      expect(() => config.run()).to.not.throw();
    });
  });
});
