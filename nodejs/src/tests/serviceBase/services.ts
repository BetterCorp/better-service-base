import assert from "assert";
import { IPluginLogger, LogMeta } from "../../interfaces/logger";
import { ServicesBase } from "../../service/service";
import { SBServices } from "../../serviceBase/services";

//const debug = console.log;
const debug = (...a: any) => {};
const fakeLogger: IPluginLogger = {
  reportStat: async (key, value): Promise<void> => {},
  reportTextStat: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  info: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  warn: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  error: async (
    messageOrError: string | Error,
    meta?: LogMeta<any>,
    hasPIData?: boolean
  ): Promise<void> => {
    debug(messageOrError, meta);
    assert.fail(
      typeof messageOrError === "string"
        ? new Error(messageOrError)
        : messageOrError
    );
  },
  fatal: async (
    messageOrError: string | Error,
    meta?: LogMeta<any>,
    hasPIData?: boolean
  ): Promise<void> => {
    debug(messageOrError, meta);
    assert.fail(
      typeof messageOrError === "string"
        ? new Error(messageOrError)
        : messageOrError
    );
  },
  debug: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
};

describe("serviceBase/services", () => {
  it("Should re-order plugins that require other plugins", async () => {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      after: string[];
      before: string[];
      ref: ServicesBase;
    }[] = [
      {
        name: "plugin1",
        after: ["plugin2"],
        before: [],
        ref: {} as any,
      },
      {
        name: "plugin2",
        after: [],
        before: [],
        ref: {} as any,
      },
      {
        name: "plugin3",
        after: [],
        before: [],
        ref: {} as any,
      },
    ];
    plugins = await services.makeAfterRequired(
      {
        getAppPluginMappedName: async (x: string) => {
          return x;
        },
      } as any,
      plugins
    );
    services.dispose();
    assert.equal(plugins[0].name, "plugin2");
    assert.equal(plugins[1].name, "plugin1");
    assert.equal(plugins[2].name, "plugin3");
  });
  it("Should re-order plugins that before other plugins", async () => {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      after: string[];
      before: string[];
      ref: ServicesBase;
    }[] = [
      {
        name: "plugin1",
        after: ["plugin2"],
        before: [],
        ref: {} as any,
      },
      {
        name: "plugin2",
        after: [],
        before: [],
        ref: {} as any,
      },
      {
        name: "plugin3",
        after: [],
        before: ["plugin1"],
        ref: {} as any,
      },
    ];
    plugins = await services.makeBeforeRequired(
      {
        getAppPluginMappedName: async (x: string) => {
          return x;
        },
      } as any,
      plugins
    );
    assert.equal(plugins[0].after.length, 2);
    assert.equal(plugins[0].after[0], "plugin2");
    assert.equal(plugins[0].after[1], "plugin3");
    assert.equal(plugins[1].after.length, 0);
    assert.equal(plugins[2].after.length, 0);
    plugins = await services.makeAfterRequired(
      {
        getAppPluginMappedName: async (x: string) => {
          return x;
        },
      } as any,
      plugins
    );
    services.dispose();
    assert.equal(plugins[0].name, "plugin2");
    assert.equal(plugins[1].name, "plugin3");
    assert.equal(plugins[2].name, "plugin1");
  });
  it("Should re-order plugins that before or require other plugins", async () => {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      after: string[];
      before: string[];
      ref: ServicesBase;
    }[] = [
      {
        name: "plugin1",
        after: ["plugin2"],
        before: [],
        ref: {} as any,
      },
      {
        name: "plugin2",
        after: [],
        before: [],
        ref: {} as any,
      },
      {
        name: "plugin3",
        after: [],
        before: ["plugin1"],
        ref: {} as any,
      },
      {
        name: "plugin4",
        after: ["plugin3"],
        before: ["plugin1"],
        ref: {} as any,
      },
    ];
    plugins = await services.makeBeforeRequired(
      {
        getAppPluginMappedName: async (x: string) => {
          return x;
        },
      } as any,
      plugins
    );
    plugins = await services.makeAfterRequired(
      {
        getAppPluginMappedName: async (x: string) => {
          return x;
        },
      } as any,
      plugins
    );
    services.dispose();
    assert.equal(plugins[3].name, "plugin1", "plugin 1 not last");
    assert.equal(plugins[3].after.length, 3, "length of after does not match");
    assert.equal(plugins[3].after[0], "plugin2", "plugin 1 required plugin 2");
    assert.equal(plugins[3].after[1], "plugin3", "plugin 1 required plugin 3");
    assert.equal(plugins[3].after[2], "plugin4", "plugin 1 required plugin 4");
    assert.equal(plugins[0].after.length, 0, "plugin 2 after nothing");
    assert.equal(plugins[1].after.length, 0, "plugin 3 after nothing");
    assert.equal(plugins[0].name, "plugin2");
    assert.equal(plugins[1].name, "plugin3");
    assert.equal(plugins[2].name, "plugin4");
    assert.equal(plugins[3].name, "plugin1");
  });

  it("Should re-order plugins that before or require other plugins (mapped names)", async () => {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      after: string[];
      before: string[];
      ref: ServicesBase;
      _mappedName: string;
    }[] = [
      {
        name: "pligin1",
        after: ["plugin2"],
        before: [],
        ref: {} as any,
        _mappedName: "plugin1",
      },
      {
        name: "pligin2",
        after: [],
        before: [],
        ref: {} as any,
        _mappedName: "plugin2",
      },
      {
        name: "pligin3",
        after: [],
        before: ["plugin1"],
        ref: {} as any,
        _mappedName: "plugin3",
      },
      {
        name: "pligin4",
        after: ["plugin3"],
        before: ["plugin1"],
        ref: {} as any,
        _mappedName: "plugin4",
      },
    ];
    const appConfigPass = {
      getAppPluginMappedName: async (x: string) => {
        for (let plugin of plugins) {
          if (plugin._mappedName === x) {
            return plugin.name;
          }
        }
        return x;
      },
    } as any;
    plugins = (await services.makeBeforeRequired(
      appConfigPass,
      plugins
    )) as any;
    plugins = (await services.makeAfterRequired(appConfigPass, plugins)) as any;
    services.dispose();
    assert.equal(plugins[3].name, "pligin1", "plugin 1 not last");
    assert.equal(plugins[3].after.length, 3, "length of after does not match");
    assert.equal(plugins[3].after[0], "pligin2", "plugin 1 required plugin 2");
    assert.equal(plugins[3].after[1], "pligin3", "plugin 1 required plugin 3");
    assert.equal(plugins[3].after[2], "pligin4", "plugin 1 required plugin 4");
    assert.equal(plugins[0].after.length, 0, "plugin 2 after nothing");
    assert.equal(plugins[1].after.length, 0, "plugin 3 after nothing");
    assert.equal(plugins[0].name, "pligin2");
    assert.equal(plugins[1].name, "pligin3");
    assert.equal(plugins[2].name, "pligin4");
    assert.equal(plugins[3].name, "pligin1");
  });
});
