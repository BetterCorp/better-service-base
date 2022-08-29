import { Tools } from "@bettercorp/tools/lib/Tools";
import * as path from "path";
import * as fs from "fs";
import {
  ServiceConfig,
  DeploymentProfiles,
  DeploymentProfile,
  IPluginConfig,
} from "../../interfaces/config";
import { IPluginLogger } from "../../interfaces/logger";
import { ConfigBase } from "../../config/config";

export class Config extends ConfigBase {
  private _appConfig!: ServiceConfig;
  private _hasConfigChanges = false;
  private _runningLive = false;
  private _secConfigFilePath!: string;
  private _cwd: string;
  private _debugMode = false;

  public get runningDebug(): boolean {
    return this._debugMode;
  }
  public get runningLive(): boolean {
    return this._runningLive;
  }

  constructor(logger: IPluginLogger, cwd: string, deploymentProfile: string) {
    super(logger, cwd, deploymentProfile);
    this._cwd = cwd;
  }
  public get activeDeploymentProfile(): DeploymentProfiles<DeploymentProfile> {
    return this._appConfig.deploymentProfiles[this._deploymentProfile] as any;
  }
  public async getPluginDeploymentProfile(
    pluginName: string
  ): Promise<DeploymentProfile> {
    return this.activeDeploymentProfile[pluginName!];
  }
  public async getPluginConfig<T extends IPluginConfig>(
    pluginName: string
  ): Promise<T> {
    return (this._appConfig.plugins[pluginName] || {}) as T;
  }
  public async refreshAppConfig(): Promise<void> {
    return new Promise((r) => {
      const PACKAGE_JSON = path.join(this._cwd, "./package.json");
      const packageJSON = JSON.parse(
        fs.readFileSync(PACKAGE_JSON, "utf8").toString()
      );
      const _version = packageJSON.version;
      let _BSBVersion = "unknown";
      const BSSPathToPackageJson = path.join(
        this._cwd,
        "./node_modules/@bettercorp/service-base/package.json"
      );
      if (fs.existsSync(BSSPathToPackageJson)) {
        _BSBVersion = JSON.parse(
          fs.readFileSync(BSSPathToPackageJson, "utf8").toString()
        ).version;
      }
      if (!Tools.isNullOrUndefined(process.env.BSB_LIVE)) {
        this._runningLive = true;
      }
      let secConfigJsonFile = path.join(this._cwd, "./sec.config.json");
      if (!Tools.isNullOrUndefined(process.env.BSB_SEC_JSON)) {
        secConfigJsonFile = process.env.BSB_SEC_JSON!;
      }
      if (fs.existsSync(secConfigJsonFile)) {
        this._appConfig = JSON.parse(
          process.env.BSB_CONFIG_OBJECT ||
            fs
              .readFileSync(
                process.env.BSB_CONFIG_FILE || secConfigJsonFile,
                "utf8"
              )
              .toString()
        ) as ServiceConfig;
        this._appConfig.deploymentProfiles =
          this._appConfig.deploymentProfiles || {};
        this._appConfig.deploymentProfiles.default =
          this._appConfig.deploymentProfiles.default || {};
      } else {
        this._debugMode = true;
        this._defaultLogger.debug(
          "! sec.config.json CAN`T BE FOUND ... we will try create one / work in memory!"
        );
        this._appConfig = {
          plugins: {},
          deploymentProfiles: {
            default: {},
          },
        } as any;
      }

      this._secConfigFilePath = secConfigJsonFile;
      if (
        !this._runningLive ||
        (process.env.BSB_FORCE_DEBUG !== undefined &&
          process.env.BSB_FORCE_DEBUG !== null &&
          process.env.BSB_FORCE_DEBUG === "1")
      ) {
        this._debugMode = true;
      }

      this.updateAppConfig();

      this._defaultLogger.info(
        `BOOT UP: @{version} with BSB@{BSBVersion} and debugging {debugMode} while running {runningLive}`,
        {
          version: _version,
          BSBVersion: _BSBVersion,
          debugMode: this._debugMode,
          runningLive: this._runningLive,
        }
      );
      r();
    });
  }
  public async updateAppConfig(
    pluginName?: string,
    mappedPluginName?: string,
    config?: IPluginConfig
  ): Promise<void> {
    if (
      Tools.isNullOrUndefined(
        this._appConfig.deploymentProfiles[this._deploymentProfile]
      )
    ) {
      (this._appConfig.deploymentProfiles[this._deploymentProfile] as any) = {};
      this._hasConfigChanges = true;
    }

    if (!Tools.isNullOrUndefined(pluginName)) {
      this._defaultLogger.debug(
        `Plugin check {pluginName} as {mappedPluginName}`,
        { pluginName: pluginName!, mappedPluginName: mappedPluginName! }
      );
      if (
        Tools.isNullOrUndefined(
          await this.getPluginDeploymentProfile(pluginName!)
        )
      ) {
        ((this._appConfig.deploymentProfiles[this._deploymentProfile] as any)[
          pluginName!
        ] as DeploymentProfile) = {
          mappedName: mappedPluginName || pluginName!,
          enabled: false,
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

    this._defaultLogger.debug("SEC CONFIG AUTOMATICALLY UPDATING.");
    const readFile = fs.existsSync(
      this._secConfigFilePath || "./notavalid.file"
    )
      ? JSON.stringify(
          JSON.parse(
            fs.readFileSync(this._secConfigFilePath, "utf-8").toString()
          )
        )
      : {};
    const configFile = JSON.stringify(this._appConfig);
    if (readFile === configFile) {
      this._defaultLogger.debug(
        "SEC CONFIG AUTOMATICALLY UPDATING: IGNORED = NO CHANGES"
      );
      this._hasConfigChanges = false;
      return;
    }

    fs.writeFileSync(this._secConfigFilePath, configFile);
    this._hasConfigChanges = false;
    this._defaultLogger.debug("SEC CONFIG AUTOMATICALLY UPDATING: UPDATED");
  }
}

export class DefaultConfig extends Config {}
