import { DEBUG_MODE, IPluginLogger } from "../interfaces/logging";
import { PluginLogger } from "./PluginLogger";
import { SBLogging } from "../serviceBase/logging";
import { z } from "zod";
import { BSBServiceConfig } from "./serviceConfig";

export abstract class MainBase {
  /**
   * The unique app id of the app that is running
   * @readonly
   * @type {string}
   */
  protected readonly appId: string = "tbd";

  /**
   * The mode the app is running in
   * @readonly
   * @type {DEBUG_MODE}
   * @example production (production mode - no debug)
   * @example production-debug (production mode - debug)
   * @example development (development mode - debug)
   */
  protected readonly mode: DEBUG_MODE = "development";
  /**
   * The current working directory of the app
   */
  protected readonly cwd: string;
  /**
   * The current working directory of the plugin
   */
  protected readonly pluginCwd: string;
  /**
   * The name of the plugin
   * This is also the mapped name, or the name defined in the config rather than it's original defined name
   */
  public readonly pluginName!: string;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string
  ) {
    this.appId = appId;
    this.mode = mode;
    if (pluginName !== "") this.pluginName = pluginName;
    this.cwd = cwd;
    this.pluginCwd = pluginCwd;
  }

  /**
   * Dispose
   * Optional function to be called when the plugin is being disposed
   *
   * @example dispose?(): void; //to not use it
   * @example dispose() { your code here };
   */
  dispose?(): void;
}

export abstract class Base extends MainBase {
  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd);
  }

  /**
   * Dispose
   * Optional function to be called when the plugin is being disposed
   *
   * @example dispose?(): void; //to not use it
   * @example dispose() { your code here };
   */
  abstract dispose?(): void;

  /**
   * Init
   * Optional function to be called when the plugin is being initialized
   * Can be sync or async
   *
   * @example init?(): void; //to not use it
   * @example init() { your code here };
   * @example async init() { await your code here };
   */
  abstract init?(): Promise<void> | void;

  /**
   * Run
   * Optional function to be called when the plugin is being run
   * Can be sync or async
   *
   * @example run?(): void; //to not use it
   * @example run() { your code here };
   * @example async run() { await your code here };
   */
  abstract run?(): Promise<void> | void;
}

/**
 * The definition of the config with zod validation
 * @example
 * const configDefinition = z.object({
 *  a: z.string(),
 * });
 */
export type BSBConfigType = z.AnyZodObject | undefined;
export type BSBConfigDefinition = BSBServiceConfig<z.AnyZodObject>;
/**
 * Config migration handler, allows for config migrations when the plugin version changes or a new plugin setup is done
 * @example simple version change and basic setup
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: z.infer<BSBConfigDefinition>) => {
 * if (versionFrom === null) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return {
 *  a: "b",
 * };
 * @example basic setup and no version change handling
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: z.infer<BSBConfigDefinition>) => {
 * if (versionFrom === null || existingConfig === undefined) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return existingConfig;
 */
export type BSBConfigMigration<T extends BSBConfigType> = (
  versionFrom: string | null,
  versionTo: string,
  existingConfig?: z.infer<Exclude<T, undefined>>
) => Promise<z.infer<Exclude<T, undefined>>>;

export type BSBConfigDefintionReference<
  T extends BSBConfigType,
  AS = undefined
> = T extends undefined ? AS : z.infer<Exclude<T, undefined>>;

// used by logging plugins (does not need events or logging since logging logs its own logs)
export abstract class BaseWithConfig<
  ReferencedConfig extends BSBConfigDefinition
> extends Base {
  /**
   * The config of the plugin
   * @type {PluginConfig}
   * @readonly
   */
  protected readonly config: BSBConfigDefintionReference<
    ReferencedConfig["validationSchema"],
    null
  >;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    config: any
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd);
    this.config = config;
  }
}

// used by config plugins (does not need events)
export abstract class BaseWithLogging extends Base {
  protected log: IPluginLogger;
  //protected createNewLogger: { (plugin: string): IPluginLogger };

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    sbLogging: SBLogging
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd);
    this.log = new PluginLogger(mode, pluginName, sbLogging);
    /*this.createNewLogger = (plugin: string) =>
      new PluginLogger(mode, `${pluginName}-${plugin}`, sbLogging);*/
  }
}

// used by events plugins (does not need events)
export abstract class BaseWithLoggingAndConfig<
  ReferencedConfig extends BSBConfigDefinition
> extends BaseWithConfig<ReferencedConfig> {
  protected log: IPluginLogger;
  protected createNewLogger: { (plugin: string): IPluginLogger };

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    config: any,
    sbLogging: SBLogging
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd, config);
    this.log = new PluginLogger(mode, pluginName, sbLogging);
    this.createNewLogger = (plugin: string) =>
      new PluginLogger(mode, `${pluginName}-${plugin}`, sbLogging);
  }
}
