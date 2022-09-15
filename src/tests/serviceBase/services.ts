import assert from "assert";
import { IPluginLogger, LogMeta } from '../../interfaces/logger';
import { ServicesBase } from '../../service/service';
import { SBServices } from "../../serviceBase/services";

//const debug = console.log;
const debug = (...a: any) => {};
const fakeLogger: IPluginLogger = {
  reportStat: async (key, value): Promise<void> => {},
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
  it("Should re-order plugins that require other plugins", async()=> {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      requires: string[];
      before: string[];
      ref: ServicesBase;
    }[] = [
      {
        name: 'plugin1',
        requires: ['plugin2'],
        before: [],
        ref: {} as any
      },
      {
        name: 'plugin2',
        requires: [],
        before: [],
        ref: {} as any
      },
      {
        name: 'plugin3',
        requires: [],
        before: [],
        ref: {} as any
      }
    ];
    plugins = services.makeRequired(plugins);
    services.dispose();
    assert.equal(plugins[0].name, 'plugin2');
    assert.equal(plugins[1].name, 'plugin1');
    assert.equal(plugins[2].name, 'plugin3');
  })  
  it("Should re-order plugins that before other plugins", async()=> {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      requires: string[];
      before: string[];
      ref: ServicesBase;
    }[] = [
      {
        name: 'plugin1',
        requires: ['plugin2'],
        before: [],
        ref: {} as any
      },
      {
        name: 'plugin2',
        requires: [],
        before: [],
        ref: {} as any
      },
      {
        name: 'plugin3',
        requires: [],
        before: ['plugin1'],
        ref: {} as any
      }
    ];
    plugins = services.makeBeforeRequired(plugins);
    assert.equal(plugins[0].requires.length, 2);
    assert.equal(plugins[0].requires[0], 'plugin2');
    assert.equal(plugins[0].requires[1], 'plugin3');
    assert.equal(plugins[1].requires.length, 0);
    assert.equal(plugins[2].requires.length, 0);
    plugins = services.makeRequired(plugins);
    services.dispose();
    assert.equal(plugins[0].name, 'plugin2');
    assert.equal(plugins[1].name, 'plugin3');
    assert.equal(plugins[2].name, 'plugin1');
  });
  it("Should re-order plugins that before or require other plugins", async()=> {
    let services = new SBServices(fakeLogger);
    let plugins: {
      name: string;
      requires: string[];
      before: string[];
      ref: ServicesBase;
    }[] = [
      {
        name: 'plugin1',
        requires: ['plugin2'],
        before: [],
        ref: {} as any
      },
      {
        name: 'plugin2',
        requires: [],
        before: [],
        ref: {} as any
      },
      {
        name: 'plugin3',
        requires: [],
        before: ['plugin1'],
        ref: {} as any
      },
      {
        name: 'plugin4',
        requires: ['plugin3'],
        before: ['plugin1'],
        ref: {} as any
      }
    ];
    plugins = services.makeBeforeRequired(plugins);
    plugins = services.makeRequired(plugins);
    services.dispose();
    assert.equal(plugins[3].name, 'plugin1', 'plugin 1 not last');
    assert.equal(plugins[3].requires.length, 3, 'length of requires does not match');
    assert.equal(plugins[3].requires[0], 'plugin2', 'plugin 1 required plugin 2');
    assert.equal(plugins[3].requires[1], 'plugin3', 'plugin 1 required plugin 3');
    assert.equal(plugins[3].requires[2], 'plugin4', 'plugin 1 required plugin 4');
    assert.equal(plugins[0].requires.length, 0, 'plugin 2 requires nothing');
    assert.equal(plugins[1].requires.length, 0, 'plugin 3 requires nothing');
    assert.equal(plugins[0].name, 'plugin2');
    assert.equal(plugins[1].name, 'plugin3');
    assert.equal(plugins[2].name, 'plugin4');
    assert.equal(plugins[3].name, 'plugin1');
  });
});
