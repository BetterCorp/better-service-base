import * as FS from "fs";
import * as PATH from "path";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { DeploymentProfile, DeploymentProfiles, IPluginLogger, IPluginConfig, ServiceConfig } from "./ILib";

export class AppConfig {
  private _appConfig: ServiceConfig;
  private _hasConfigChanges: boolean = false;
  private _runningLive: boolean = false;
  private _defaultLogger: IPluginLogger;
  private _secConfigFilePath: string;
  private _debugMode: boolean = false;
  private _deploymentProfile: string = "default";

  public get runningInDebug(): boolean {
    return this._debugMode;
  }
  public get runningLive(): boolean {
    return this._debugMode;
  }
  public get deploymentProfile(): string {
    return this._deploymentProfile;
  }
  public get activeDeploymentProfile(): DeploymentProfiles<DeploymentProfile> {
    return this._appConfig.deploymentProfiles[this._deploymentProfile] as any;
  }

  constructor(logger: IPluginLogger, cwd: string) {
    this._defaultLogger = logger;
    const PACKAGE_JSON = PATH.join(cwd, "./package.json");
    const packageJSON = JSON.parse(FS.readFileSync(PACKAGE_JSON, "utf-8").toString());
    const _version = packageJSON.version;
    let _BSBVersion = "unknown";
    const BSSPathToPackageJson = PATH.join(cwd, "./node_modules/@bettercorp/service-base/package.json");
    if (FS.existsSync(BSSPathToPackageJson)) {
      _BSBVersion = JSON.parse(FS.readFileSync(BSSPathToPackageJson, "utf-8").toString()).version;
    }
    if (!Tools.isNullOrUndefined(process.env.BSB_LIVE)) {
      this._runningLive = true;
    }
    let secConfigJsonFile = PATH.join(cwd, "./sec.config.json");
    if (!Tools.isNullOrUndefined(process.env.BSB_PROFILE)) {
      this._deploymentProfile = process.env.BSB_PROFILE!;
    }
    /*if (this._deploymentProfile !== "default") {
      secConfigJsonFile = PATH.join(cwd, `./sec.config.${ this._deploymentProfile }.json`);
    }*/
    if (!Tools.isNullOrUndefined(process.env.BSB_SEC_JSON)) {
      secConfigJsonFile = process.env.BSB_SEC_JSON!;
    }
    if (!FS.existsSync(secConfigJsonFile)) {
      this._defaultLogger.fatal("! sec.config.json CAN`T BE FOUND !");
    }
    this._appConfig = JSON.parse(process.env.BSB_CONFIG_OBJECT || FS.readFileSync(process.env.BSB_CONFIG_FILE || secConfigJsonFile, "utf-8").toString()) as ServiceConfig;
    this._appConfig.deploymentProfiles = this._appConfig.deploymentProfiles || {};
    this._appConfig.deploymentProfiles.default = this._appConfig.deploymentProfiles.default || {};
    this._appConfig.debug = this._appConfig.debug || false;

    this._secConfigFilePath = secConfigJsonFile;
    if (!Tools.isNullOrUndefined(this._appConfig.debug)) {
      this._debugMode = this._appConfig.debug;
    }
    if (process.env.BSB_FORCE_DEBUG !== undefined && process.env.BSB_FORCE_DEBUG !== null && process.env.BSB_FORCE_DEBUG == "1") {
      this._debugMode = true;
    }

    this.updateAppConfig();

    this._defaultLogger.info(`BOOT UP: @${ _version } with BSB@${ _BSBVersion } and debugging ${ this._debugMode ? "enabled" : "disabled" } while running ${ this._runningLive ? "live" : "normally" }`);
  }

  public getPluginConfig<T extends IPluginConfig>(pluginName: string): T {
    return (this._appConfig.plugins[pluginName] || {}) as T;
  }
  public getPluginDeploymentProfile(pluginName: string): DeploymentProfile {
    return this.activeDeploymentProfile[pluginName!];
  }
  public getMappedPluginName(pluginName: string): string {
    if (Tools.isNullOrUndefined(this.getPluginDeploymentProfile(pluginName))) return pluginName;
    return this.getPluginDeploymentProfile(pluginName).mappedName || pluginName;
  }
  public getPluginState(pluginName: string): boolean {
    return this.getPluginDeploymentProfile(pluginName).enabled;
  }
  public updateAppConfig(pluginName?: string, mappedPluginName?: string, config?: IPluginConfig) {
    if (Tools.isNullOrUndefined(this.activeDeploymentProfile)) {
      (this._appConfig.deploymentProfiles[this._deploymentProfile] as any) = {};
      this._hasConfigChanges = true;
    }

    if (!Tools.isNullOrUndefined(pluginName)) {
      if (Tools.isNullOrUndefined(this.getPluginDeploymentProfile(pluginName!))) {
        ((this._appConfig.deploymentProfiles[this._deploymentProfile] as any)[pluginName!] as DeploymentProfile) = {
          mappedName: mappedPluginName || pluginName!,
          enabled: false
        };
        this._hasConfigChanges = true;
      }
      if (Tools.isNullOrUndefined(this._appConfig.plugins[mappedPluginName!])) {
        this._appConfig.plugins[mappedPluginName!] = {};
        this._hasConfigChanges = true;
      }
      if (!Tools.isNullOrUndefined(config)) {
        this._appConfig.plugins[mappedPluginName!] = config!;
        this._hasConfigChanges = true;
      }
    }

    if (this._runningLive || !this._hasConfigChanges) return;

    this._defaultLogger.warn("SEC CONFIG AUTOMATICALLY UPDATING.");
    let readFile = JSON.stringify(JSON.parse(FS.readFileSync(this._secConfigFilePath, "utf-8").toString()));
    let configFile = JSON.stringify(this._appConfig);
    if (readFile == configFile) {
      this._defaultLogger.warn("SEC CONFIG AUTOMATICALLY UPDATING: IGNORED = NO CHANGES");
      this._hasConfigChanges = false;
      return;
    }

    FS.writeFileSync(this._secConfigFilePath, configFile);
    this._hasConfigChanges = false;
    this._defaultLogger.warn("SEC CONFIG AUTOMATICALLY UPDATING: UPDATED");
  }
}