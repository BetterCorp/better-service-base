import {
  readdirSync,
  statSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { IPluginLogger } from "../interfaces/logger";
import { PluginDefinitions, IReadyPlugin, PluginDefinition } from "../interfaces/service";
import { Tools } from "@bettercorp/tools";

export class SBPlugins {
  public static getPluginType(name: string): PluginDefinition | null {
    const pluginLow = name.toLowerCase();
    if (pluginLow.indexOf("service-") === 0) return PluginDefinitions.service;
    if (pluginLow.indexOf("config-") === 0) return PluginDefinitions.config;
    if (pluginLow.indexOf("events-") === 0) return PluginDefinitions.events;
    if (pluginLow.indexOf("log-") === 0 || pluginLow.indexOf("logs-") === 0)
      return PluginDefinitions.logging;
    return null;
  }

  private static async findPluginsFiles(
    coreLogger: IPluginLogger,
    path: string,
    version: string,
    libOnly = false,
    pluginDir: string
  ): Promise<Array<IReadyPlugin>> {
    const arrOfPlugins: Array<IReadyPlugin> = [];

    await coreLogger.debug(`FIND: FIND plugins in [{path}]`, { path });
    for (const dirPluginFolderName of readdirSync(path)) {
      const thisFullPath = join(path, dirPluginFolderName);
      if (!statSync(thisFullPath).isDirectory()) {
        await coreLogger.debug(`FIND: IGNORE [{thisFullPath}] Not a DIR`, {
          thisFullPath,
        });
        continue;
      }
      if (dirPluginFolderName.indexOf("-") === 0) {
        await coreLogger.debug(
          `FIND: IGNORE [{thisFullPath}] Defined disabled`,
          { thisFullPath }
        );
        continue;
      }
      if (libOnly) {
        if (dirPluginFolderName.indexOf("-test") >= 0) {
          await coreLogger.debug(
            `FIND: IGNORE [{thisFullPath}] Defined test plugin to ignore`,
            { thisFullPath }
          );
          continue;
        }
      }

      let pluginDef = SBPlugins.getPluginType(dirPluginFolderName);
      if (pluginDef === null) {
        await coreLogger.debug(
          `FIND: NOT VALID [{dirPluginFolderName}] in: {thisFullPath}`,
          { dirPluginFolderName, thisFullPath }
        );
        continue;
      }

      let pluginFile = join(thisFullPath, "plugin.js");
      if (!existsSync(pluginFile)) pluginFile = join(thisFullPath, "plugin.ts");

      if (!existsSync(pluginFile)) {
        await coreLogger.debug(
          `FIND: IGNORE [{thisFullPath}] Not a valid plugin`,
          { thisFullPath }
        );
        continue;
      }

      let pluginInstallerFile: string | null = join(
        thisFullPath,
        "sec.config.js"
      );

      if (!existsSync(pluginInstallerFile))
        pluginInstallerFile = join(thisFullPath, "sec.config.ts");

      if (!existsSync(pluginInstallerFile)) pluginInstallerFile = null;
      await coreLogger.debug(
        `FIND: READY [{dirPluginFolderName}] in: {thisFullPath}`,
        { dirPluginFolderName, thisFullPath }
      );
      arrOfPlugins.push({
        pluginDefinition: pluginDef,
        name: dirPluginFolderName,
        mappedName: dirPluginFolderName,
        version: version,
        pluginFile,
        installerFile: pluginInstallerFile,
        pluginDir: pluginDir,
      });
    }

    return arrOfPlugins;
  }

  private static async findDependentPlugins(
    plugin: string,
    coreLogger: IPluginLogger,
    pluginJson: any,
    npmPluginsDir: string,
    knownDependencies: Record<string, boolean> = {}
  ) {
    let arrOfPlugins: Array<IReadyPlugin> = [];
    for (let dependency of Object.keys(pluginJson.dependencies || {})) {
      if (knownDependencies[dependency] !== undefined) {
        await coreLogger.info(
          `FIND: CHECK [{plugin}] DEPENDENCY [{dependency}] IGNORED BECAUSE [{reason}]`,
          {
            dependency,
            plugin,
            reason:
              knownDependencies[dependency] === true ? "EXISTS" : "INVALID",
          }
        );

        continue;
      }
      await coreLogger.info(
        `FIND: CHECK [{plugin}] DEPENDENCY [{dependency}]`,
        { dependency, plugin }
      );
      let path = dependency.split("/");
      let dependencyPath = join(npmPluginsDir, ...path);
      await coreLogger.debug(`FIND: CHECK [{dependency}] {dependencyPath}`, {
        dependency,
        dependencyPath,
      });
      if (statSync(dependencyPath).isDirectory()) {
        let response = await SBPlugins.findPluginsInBase(
          coreLogger,
          dependencyPath,
          true,
          npmPluginsDir,
          knownDependencies
        );
        if (Tools.isArray(response)) {
          knownDependencies[dependency] = false;
          arrOfPlugins = arrOfPlugins.concat(
            response as any as Array<IReadyPlugin>
          );
        } else {
          knownDependencies[dependency] = response.plugins.length > 0;
          arrOfPlugins = arrOfPlugins.concat(response.plugins);
          knownDependencies = {
            ...knownDependencies,
            ...(response.knownDependencies ?? {}),
          };
        }
      }
    }

    return {
      plugins: arrOfPlugins,
      knownDependencies: knownDependencies,
    };
  }

  private static async findPluginsInBase(
    coreLogger: IPluginLogger,
    path: string,
    libOnly: boolean
  ): Promise<Array<IReadyPlugin>>;
  private static async findPluginsInBase(
    coreLogger: IPluginLogger,
    path: string,
    libOnly: boolean,
    findLinkedPluginsNpmDir: string,
    knownDependencies: Record<string, boolean>
  ): Promise<
    | {
        plugins: Array<IReadyPlugin>;
        knownDependencies: Record<string, boolean>;
      }
    | Array<IReadyPlugin>
  >;
  private static async findPluginsInBase(
    coreLogger: IPluginLogger,
    path: string,
    libOnly = false,
    findLinkedPluginsNpmDir?: string,
    knownDependencies?: Record<string, boolean>
  ): Promise<
    | Array<IReadyPlugin>
    | {
        plugins: Array<IReadyPlugin>;
        knownDependencies: Record<string, boolean>;
      }
  > {
    const pluginJson = JSON.parse(
      readFileSync(join(path, "./package.json"), "utf8").toString()
    );
    if (pluginJson.bsb_project !== true) {
      await coreLogger.debug("FIND: IGNORE AS NOT BSB PROJECT");
      return [];
    }

    let innerPluginLib = join(path, "./src");
    if (
      libOnly ||
      !existsSync(innerPluginLib) ||
      !statSync(innerPluginLib).isDirectory()
    ) {
      innerPluginLib = join(path, "./lib");
    }
    if (
      !existsSync(innerPluginLib) ||
      !statSync(innerPluginLib).isDirectory()
    ) {
      await coreLogger.debug(
        `FIND: IGNORE [{innerPluginLib}] No src/lib dir in package`,
        { innerPluginLib }
      );
      return [];
    }
    const innerPluginLibPlugin = join(innerPluginLib, "./plugins");
    if (
      !existsSync(innerPluginLibPlugin) ||
      !statSync(innerPluginLibPlugin).isDirectory()
    ) {
      await coreLogger.debug(
        `FIND: IGNORE [{innerPluginLibPlugin}] No inner plugins dir`,
        { innerPluginLibPlugin }
      );
      return [];
    }

    const packageVersion = pluginJson.version;
    let returnableListOfPlugins = await SBPlugins.findPluginsFiles(
      coreLogger,
      innerPluginLibPlugin,
      packageVersion,
      libOnly,
      path
    );
    if (Tools.isString(findLinkedPluginsNpmDir)) {
      let response = await SBPlugins.findDependentPlugins(
        pluginJson.name,
        coreLogger,
        pluginJson,
        findLinkedPluginsNpmDir,
        knownDependencies
      );
      returnableListOfPlugins = returnableListOfPlugins.concat(
        response.plugins
      );
      return {
        plugins: returnableListOfPlugins,
        knownDependencies: response.knownDependencies ?? {},
      };
    }

    return returnableListOfPlugins;
  }

  public static async findNPMPlugins(
    coreLogger: IPluginLogger,
    cwd: string
  ): Promise<Array<IReadyPlugin>> {
    const pkgJsonFile = join(cwd, "./package.json");
    if (!existsSync(pkgJsonFile)) {
      await coreLogger.error(`Unable to find package.json in {pakDir}`, {
        pakDir: pkgJsonFile,
      });
      return [];
    }
    const pluginJson = JSON.parse(readFileSync(pkgJsonFile, "utf8").toString());

    const npmPluginsDir = join(cwd, "./node_modules");
    await coreLogger.info(`FIND: NPM plugins in: {npmPluginsDir}`, {
      npmPluginsDir,
    });
    if (!existsSync(npmPluginsDir)) {
      await coreLogger.error(
        `FIND: NPM plugins dir does not exist: {npmPluginsDir}`,
        { npmPluginsDir }
      );
      return [];
    }
    const knownDependenciesCacheFile = join(
      npmPluginsDir,
      "./.bsb-known-dependencies.json"
    );

    let arrOfPlugins: Array<IReadyPlugin> = [];
    if (existsSync(knownDependenciesCacheFile)) {
      try {
        let knownDependencies = JSON.parse(
          readFileSync(knownDependenciesCacheFile, "utf8").toString()
        );
        if (Object.keys(knownDependencies).length > 0) {
          for (let dependency of Object.keys(knownDependencies)) {
            if (knownDependencies[dependency] !== true) {
              continue;
            }
            let response = await SBPlugins.findPluginsInBase(
              coreLogger,
              join(npmPluginsDir, dependency),
              true
            );
            arrOfPlugins = arrOfPlugins.concat(response);
          }
        }
      } catch (e: any) {
        await coreLogger.error(
          `Cannot read known dependencies: {knownDependenciesCacheFile}`,
          { knownDependenciesCacheFile }
        );
      }
    }
    if (arrOfPlugins.length === 0) {
      let response = await SBPlugins.findDependentPlugins(
        "self",
        coreLogger,
        pluginJson,
        npmPluginsDir,
        {}
      );
      setTimeout(async () => {
        try {
          writeFileSync(
            knownDependenciesCacheFile,
            JSON.stringify(response.knownDependencies, null, 2)
          );
        } catch (e: any) {
          await coreLogger.warn(
            `Cannot cache known dependencies: {knownDependenciesCacheFile}`,
            { knownDependenciesCacheFile }
          );
        }
      }, 1000);
      arrOfPlugins = response.plugins;
    }

    return arrOfPlugins;
  }

  public static async findLocalPlugins(
    coreLogger: IPluginLogger,
    cwd: string,
    CLIONLY: boolean
  ): Promise<Array<IReadyPlugin>> {
    return await SBPlugins.findPluginsInBase(coreLogger, cwd, CLIONLY);
  }
}
