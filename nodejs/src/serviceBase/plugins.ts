import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { IPluginLogger } from "../interfaces/logger";
import { IPluginDefinition, IReadyPlugin } from "../interfaces/service";

export class SBPlugins {
  public static getPluginType(name: string): IPluginDefinition | null {
    const pluginLow = name.toLowerCase();
    if (pluginLow.indexOf("service-") === 0) return IPluginDefinition.service;
    if (pluginLow.indexOf("config-") === 0) return IPluginDefinition.config;
    if (pluginLow.indexOf("events-") === 0) return IPluginDefinition.events;
    if (pluginLow.indexOf("log-") === 0 || pluginLow.indexOf("logs-") === 0)
      return IPluginDefinition.logging;
    return null;
  }

  private static async findPluginsFiles(
    coreLogger: IPluginLogger,
    path: string,
    version: string,
    libOnly = false
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
        pluginDefinition:pluginDef,
        name: dirPluginFolderName,
        mappedName: dirPluginFolderName,
        version: version,
        pluginFile,
        installerFile: pluginInstallerFile,
      });
    }

    return arrOfPlugins;
  }
  private static async findPluginsInBase(
    coreLogger: IPluginLogger,
    path: string,
    libOnly = false
  ): Promise<Array<IReadyPlugin>> {
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
    return await SBPlugins.findPluginsFiles(
      coreLogger,
      innerPluginLibPlugin,
      packageVersion,
      libOnly
    );
  }

  public static async findNPMPlugins(
    coreLogger: IPluginLogger,
    cwd: string
  ): Promise<Array<IReadyPlugin>> {
    let arrOfPlugins: Array<IReadyPlugin> = [];

    if (!existsSync(join(cwd, "./package.json"))) {
      await coreLogger.error(`Unable to find package.json in {pakDir}`, {
        pakDir: join(cwd, "./package.json"),
      });
      return [];
    }

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
    for (const dirFileWhat of readdirSync(npmPluginsDir)) {
      try {
        const pluginPath = join(npmPluginsDir, dirFileWhat);
        if (dirFileWhat.indexOf(".") === 0) {
          continue;
        }
        if (dirFileWhat.indexOf("@") === 0) {
          await coreLogger.debug(`FIND: GROUP [{dirFileWhat}] {pluginPath}`, {
            dirFileWhat,
            pluginPath,
          });
          for (const groupPluginName of readdirSync(pluginPath)) {
            if (groupPluginName.indexOf(".") === 0) {
              continue;
            }
            const groupPluginPath = join(pluginPath, groupPluginName);
            await coreLogger.debug(
              `FIND: CHECK [{dirFileWhat}/{groupPluginName}] {groupPluginPath}`,
              { dirFileWhat, groupPluginName, groupPluginPath }
            );
            if (statSync(groupPluginPath).isDirectory()) {
              arrOfPlugins = arrOfPlugins.concat(
                await SBPlugins.findPluginsInBase(
                  coreLogger,
                  groupPluginPath,
                  true
                )
              );
            }
          }
        } else {
          await coreLogger.debug(`FIND: CHECK [{dirFileWhat}] {pluginPath}`, {
            dirFileWhat,
            pluginPath,
          });
          if (statSync(pluginPath).isDirectory()) {
            arrOfPlugins = arrOfPlugins.concat(
              await SBPlugins.findPluginsInBase(coreLogger, pluginPath, true)
            );
          }
        }
      } catch (err: any) {
        await coreLogger.error("{message}", {
          message: err.message || err.toString(),
        });
      }
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
