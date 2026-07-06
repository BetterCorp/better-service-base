import * as assert from "assert";
import * as av from "anyvali";
import { SBObservable } from "../../serviceBase/observable.js";

describe("SBObservable", () => {
  class TestObservablePlugin {
    pluginName: string;
    receivedConfig: unknown;

    constructor(config: any) {
      this.pluginName = config.pluginName;
      this.receivedConfig = config.config;
    }
  }

  function pluginNames(observable: SBObservable): string[] {
    return (observable as any).observablePlugins.map((entry: any) => entry.plugin.pluginName);
  }

  function findPlugin(observable: SBObservable, pluginName: string): any {
    return (observable as any).observablePlugins.find((entry: any) => entry.plugin.pluginName === pluginName)?.plugin;
  }

  async function withCapturedConsole<T>(run: () => Promise<T> | T): Promise<{ result: T; logs: string[] }> {
    const originalLog = console.log;
    const originalDebug = console.debug;
    const originalWarn = console.warn;
    const originalError = console.error;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    console.debug = (...args: unknown[]) => logs.push(args.join(" "));
    console.warn = (...args: unknown[]) => logs.push(args.join(" "));
    console.error = (...args: unknown[]) => logs.push(args.join(" "));
    try {
      return { result: await run(), logs };
    } finally {
      console.log = originalLog;
      console.debug = originalDebug;
      console.warn = originalWarn;
      console.error = originalError;
    }
  }

  async function loadObservablePlugin(pluginConfig: object | null) {
    const schema = av.object({
      host: av.string().minLength(1).default("0.0.0.0"),
      port: av.int32().min(1).default(3200),
      timeoutMs: av.int32().default(5000).min(1000),
      nested: av.object({
        mode: av.string().default("auto"),
      }).default({}),
    });
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-observable",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestObservablePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "demo-observable": {
          enabled: true,
          plugin: "observable-demo",
          version: "1.0.0",
        },
      }),
      getPluginConfig: async () => pluginConfig,
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    return findPlugin(observable, "demo-observable").receivedConfig;
  }

  it("applies AnyVali defaults for missing observable plugin config", async () => {
    assert.deepStrictEqual(await loadObservablePlugin(null), {
      host: "0.0.0.0",
      port: 3200,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("applies AnyVali defaults for empty observable plugin config", async () => {
    assert.deepStrictEqual(await loadObservablePlugin({}), {
      host: "0.0.0.0",
      port: 3200,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("applies AnyVali defaults around explicit observable plugin config", async () => {
    assert.deepStrictEqual(await loadObservablePlugin({
      port: 3211,
      nested: {
        extra: true,
      },
      unknown: true,
    }), {
      host: "0.0.0.0",
      port: 3211,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("passes undefined for observable plugin config when plugin has no schema", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-observable",
          version: "1.0.0",
          plugin: TestObservablePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "demo-observable": {
          enabled: true,
          plugin: "observable-demo",
          version: "1.0.0",
        },
      }),
      getPluginConfig: async () => ({
        raw: true,
      }),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    assert.strictEqual(findPlugin(observable, "demo-observable").receivedConfig, undefined);
  });

  it("loads multiple enabled observable plugins", async () => {
    const loaded: Array<{ packageName: string | null; pluginName: string; mappedName: string }> = [];
    const sbPlugins = {
      loadPlugin: async (_log: unknown, packageName: string | null, pluginName: string, mappedName: string) => {
        loaded.push({ packageName, pluginName, mappedName });
        return {
          success: true,
          data: {
            name: pluginName,
            version: "1.0.0",
            plugin: TestObservablePlugin,
            packageCwd: process.cwd(),
            pluginCwd: process.cwd(),
          },
        };
      },
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "observable-axiom": {
          enabled: true,
          plugin: "observable-axiom",
          package: "@bsb/observable-axiom",
        },
        "observable-default": {
          enabled: true,
          plugin: "observable-default",
          package: "@bsb/base",
        },
      }),
      getPluginConfig: async () => ({}),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    assert.deepStrictEqual(loaded, [
      {
        packageName: "@bsb/observable-axiom",
        pluginName: "observable-axiom",
        mappedName: "observable-axiom",
      },
    ]);
    assert.deepStrictEqual(pluginNames(observable), ["observable-axiom"]);
  });

  it("logs startup through bootstrap observable-default before configured observables load", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-observable",
          version: "1.0.0",
          plugin: TestObservablePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "demo-observable": {
          enabled: true,
          plugin: "observable-demo",
        },
      }),
      getPluginConfig: async () => ({}),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    const { logs } = await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    assert.ok(logs.some((line) => line.includes("Configured observable plugins: 1 (demo-observable)")));
    assert.ok(logs.some((line) => line.includes("Loading observable plugin demo-observable")));
    assert.deepStrictEqual(pluginNames(observable), ["demo-observable"]);
  });

  it("keeps bootstrap observable-default when no configured observable handles logs", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "metrics-observable",
          version: "1.0.0",
          plugin: TestObservablePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "metrics-observable": {
          enabled: true,
          plugin: "observable-metrics",
          filter: ["counter"],
        },
      }),
      getPluginConfig: async () => ({}),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    assert.deepStrictEqual(pluginNames(observable), ["observable-default", "metrics-observable"]);
  });

  it("uses bootstrap observable-default for configured observable-default without loading it twice", async () => {
    const loaded: string[] = [];
    const sbPlugins = {
      loadPlugin: async (_log: unknown, _packageName: string | null, pluginName: string) => {
        loaded.push(pluginName);
        return {
          success: true,
          data: {
            name: pluginName,
            version: "1.0.0",
            plugin: TestObservablePlugin,
            packageCwd: process.cwd(),
            pluginCwd: process.cwd(),
          },
        };
      },
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "observable-default": {
          enabled: true,
          plugin: "observable-default",
          package: "@bsb/base",
        },
      }),
      getPluginConfig: async () => ({}),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    assert.deepStrictEqual(loaded, []);
    assert.deepStrictEqual(pluginNames(observable), ["observable-default"]);
  });

  it("logs observable loader failure details", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: false,
        error: new Error("Cannot find module '/mnt/plugins/@bsb/observable-axiom/index.js'"),
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "observable-axiom": {
          enabled: true,
          plugin: "observable-axiom",
          package: "@bsb/observable-axiom",
          version: "latest",
        },
      }),
      getPluginConfig: async () => ({}),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    const { logs } = await withCapturedConsole(() => observable.setupObservablePlugins(sbConfig));

    assert.ok(logs.some((line) =>
      line.includes("Failed to load observable plugin observable-axiom as observable-axiom from (@bsb/observable-axiom) version latest: Cannot find module")
    ));
  });
});
