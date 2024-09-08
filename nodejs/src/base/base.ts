import {DEBUG_MODE, IPluginLogger} from "../interfaces";
import {SBLogging} from "../serviceBase";
import {BSBReferenceConfigType} from "./pluginConfig";
import {PluginLogger} from "./PluginLogger";

/**
 * Main base config
 * @property appId - The unique app id of the app that is running
 * @property mode - The mode the app is running in
 * @property pluginName - The name of the plugin
 * @property cwd - The current working directory of the app
 * @property packageCwd - The directory of the package that contains the plugin
 * @property pluginCwd - The directory of the plugin (src/plugins/{pluginName} or lib/plugins/{pluginName})
 */
export interface MainBaseConfig {
  appId: string;
  mode: DEBUG_MODE;
  pluginName: string;
  cwd: string;
  packageCwd: string;
  pluginCwd: string;
}

/**
 * @hidden
 */
export abstract class MainBase {
  /**
   * The unique app id of the app that is running
   * @readonly
   * @type {string}
   */
  public readonly appId: string = "tbd";

  /**
   * The mode the app is running in
   * @readonly
   * @type {DEBUG_MODE}
   * @example production (production mode - no debug)
   * @example production-debug (production mode - debug)
   * @example development (development mode - debug)
   */
  public readonly mode: DEBUG_MODE = "development";
  /**
   * The current working directory of the app
   */
  public readonly cwd: string;
  /**
   * The current working directory of the plugin
   */
  public readonly packageCwd: string;
  /**
   * The current working directory of the service
   */
  public readonly pluginCwd: string;
  /**
   * The name of the plugin
   * This is also the mapped name, or the name defined in the config rather than it's original defined name
   */
  public declare readonly pluginName: string;

  constructor(config: MainBaseConfig) {
    this.appId = config.appId;
    this.mode = config.mode;
    if (config.pluginName !== "") {
      this.pluginName = config.pluginName;
    }
    this.cwd = config.cwd;
    this.packageCwd = config.packageCwd;
    this.pluginCwd = config.pluginCwd;
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

/**
 * @hidden
 */
export abstract class Base
    extends MainBase {
  constructor(config: MainBaseConfig) {
    super(config);
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
  public abstract init?(): Promise<void> | void;

  /**
   * Run
   * Optional function to be called when the plugin is being run
   * Can be sync or async
   *
   * @example run?(): void; //to not use it
   * @example run() { your code here };
   * @example async run() { await your code here };
   */
  public abstract run?(): Promise<void> | void;
}

/**
 * @hidden
 */
export type ConfigPropertyTypeSafe<
    ReferencedConfig extends BSBReferenceConfigType
> = ReferencedConfig extends undefined
    ? undefined
    : ReferencedConfig extends null
      ? undefined
      : ReferencedConfig;

/**
 * @hidden
 */
export interface BaseWithConfigConfig<
    ReferencedConfig extends BSBReferenceConfigType
>
    extends MainBaseConfig {
  config: ConfigPropertyTypeSafe<ReferencedConfig>;
}

/**
 * @hidden
 * used by logging plugins (does not need events or logging since logging logs its own logs)
 */
export abstract class BaseWithConfig<
    ReferencedConfig extends BSBReferenceConfigType
>
    extends Base {
  /**
   * The config of the plugin
   * @type {PluginConfig}
   * @readonly
   */
  public readonly config: ConfigPropertyTypeSafe<ReferencedConfig>;

  constructor(config: BaseWithConfigConfig<ReferencedConfig>) {
    super(config);
    this.config = config.config;
  }
}

/**
 * BaseWithLoggingConfig
 * @property sbLogging - Passed in logging base - can be used to create new plugin loggers
 */
export interface BaseWithLoggingConfig
    extends MainBaseConfig {
  sbLogging: SBLogging;
}

/**
 * @hidden
 * used by config plugins (does not need events)
 */
export abstract class BaseWithLogging
    extends Base {
  protected log: IPluginLogger;

  //protected createNewLogger: { (plugin: string): IPluginLogger };

  constructor(config: BaseWithLoggingConfig) {
    super(config);
    this.log = new PluginLogger(
        config.mode,
        config.pluginName,
        config.sbLogging,
    );
    /*this.createNewLogger = (plugin: string) =>
     new PluginLogger(mode, `${pluginName}-${plugin}`, sbLogging);*/
  }
}

/**
 * @hidden
 */
export interface BaseWithLoggingAndConfigConfig<
    ReferencedConfig extends BSBReferenceConfigType
>
    extends BaseWithLoggingConfig,
            BaseWithConfigConfig<ReferencedConfig> {
}

/**
 * @hidden
 * used by events plugins (does not need events)
 */
export abstract class BaseWithLoggingAndConfig<
    ReferencedConfig extends BSBReferenceConfigType
>
    extends BaseWithConfig<ReferencedConfig> {
  public log: IPluginLogger;
  protected createNewLogger: { (plugin: string): IPluginLogger };

  constructor(config: BaseWithLoggingAndConfigConfig<ReferencedConfig>) {
    super(config);
    this.log = new PluginLogger(
        config.mode,
        config.pluginName,
        config.sbLogging,
    );
    this.createNewLogger = (plugin: string) =>
        new PluginLogger(
            config.mode,
            `${config.pluginName}-${plugin}`,
            config.sbLogging,
        );
  }
}

/**
 * @hidden
 */
export const NS_PER_SEC = 1e9;
/**
 * @hidden
 */
export const MS_PER_NS = 1e-6;