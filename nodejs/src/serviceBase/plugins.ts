/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BSBPluginConfig, BSBPluginConfigRef } from "../base/index.js";
import { createFakeDTrace, DTrace, IPluginLogging, LoadedPlugin, PluginType, PluginTypeDefinitionRef, Result, Ok, Err, fromPromise, BSBRuntimeMode } from "../interfaces/index.js";
import { toImportUrl } from "../base/module-runtime.js";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBPlugins", span);
}

interface ResolvedPackageVersion {
  version: string;
  packageCwd: string;
  pluginRoot: string;
}

/**
 * BSB Plugins Controller
 * 
 * This class is responsible for loading the plugins in the BSB framework.
 * If you have a specific way of loading plugins, you can extend this class and then use your own class when creating the ServiceBase instance.
 * 
 * @group Plugins
 * @category Core
 */
export class SBPlugins {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBPlugins.html | API: SBPlugins}
   */
  protected cwd: string;
  protected nodeModulesPluginDir: string;
  protected referencedPluginDir: string | null = null;
  protected runtimeMode: BSBRuntimeMode;

  private static readonly MINOR_SELECTOR_REGEX = /^\d+\.\d+$/;
  private static readonly EXACT_VERSION_REGEX = /^\d+\.\d+\.\d+$/;
  private static readonly SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

  constructor(cwd: string, runtimeMode: BSBRuntimeMode) {
    this.cwd = cwd;
    this.runtimeMode = runtimeMode;
    this.nodeModulesPluginDir = join(this.cwd, "./node_modules/");
    const pluginDirEnv = process.env.BSB_PLUGINS_DIR ?? process.env.BSB_PLUGIN_DIR;
    if (
      typeof pluginDirEnv == "string" &&
      pluginDirEnv.length > 3
    ) {
      if (!existsSync(pluginDirEnv)) {
        throw new Error(`Plugin directory ${ pluginDirEnv } does not exist`);
      }
      this.referencedPluginDir = pluginDirEnv;
    }
  }

  private parseSemver(version: string): [number, number, number] | null {
    const match = version.match(SBPlugins.SEMVER_REGEX);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  private compareSemver(a: string, b: string): number {
    const pa = this.parseSemver(a);
    const pb = this.parseSemver(b);
    if (!pa || !pb) return 0;
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    if (pa[1] !== pb[1]) return pa[1] - pb[1];
    return pa[2] - pb[2];
  }

  private listVersionsFromReferencedDir(npmPackage: string): ResolvedPackageVersion[] {
    if (!this.referencedPluginDir) return [];
    const packageRoot = join(this.referencedPluginDir, npmPackage);
    if (!existsSync(packageRoot)) return [];

    const out: ResolvedPackageVersion[] = [];

    // New hierarchical layout: /pkg/<major>/<minor>/<micro>/
    for (const majorEntry of readdirSync(packageRoot, { withFileTypes: true })) {
      if (!majorEntry.isDirectory() || !/^\d+$/.test(majorEntry.name)) continue;
      const majorPath = join(packageRoot, majorEntry.name);
      for (const minorEntry of readdirSync(majorPath, { withFileTypes: true })) {
        if (!minorEntry.isDirectory() || !/^\d+$/.test(minorEntry.name)) continue;
        const minorPath = join(majorPath, minorEntry.name);
        for (const microEntry of readdirSync(minorPath, { withFileTypes: true })) {
          if (!microEntry.isDirectory() || !/^\d+$/.test(microEntry.name)) continue;
          const pluginRoot = join(minorPath, microEntry.name);
          out.push({
            version: `${ majorEntry.name }.${ minorEntry.name }.${ microEntry.name }`,
            packageCwd: pluginRoot,
            pluginRoot,
          });
        }
      }
    }

    // Legacy layout: /pkg/<major.minor.micro>/
    for (const versionEntry of readdirSync(packageRoot, { withFileTypes: true })) {
      if (!versionEntry.isDirectory()) continue;
      if (!SBPlugins.EXACT_VERSION_REGEX.test(versionEntry.name)) continue;
      const pluginRoot = join(packageRoot, versionEntry.name);
      out.push({
        version: versionEntry.name,
        packageCwd: pluginRoot,
        pluginRoot,
      });
    }

    const dedup = new Map<string, ResolvedPackageVersion>();
    for (const item of out) {
      // Prefer first-seen entries (hierarchical layout is collected first).
      if (!dedup.has(item.version)) {
        dedup.set(item.version, item);
      }
    }
    return Array.from(dedup.values());
  }

  private resolveVersionFromSelector(
    versions: ResolvedPackageVersion[],
    requestedVersion?: string | null,
  ): ResolvedPackageVersion | null {
    if (versions.length === 0) return null;
    const sorted = versions.slice().sort((a, b) => this.compareSemver(a.version, b.version));

    if (requestedVersion == null || requestedVersion.length === 0) {
      return sorted[sorted.length - 1];
    }

    if (SBPlugins.EXACT_VERSION_REGEX.test(requestedVersion)) {
      return sorted.find((x) => x.version === requestedVersion) ?? null;
    }

    if (SBPlugins.MINOR_SELECTOR_REGEX.test(requestedVersion)) {
      const [major, minor] = requestedVersion.split(".");
      const matching = sorted.filter((x) => {
        const parsed = this.parseSemver(x.version);
        return parsed !== null && String(parsed[0]) === major && String(parsed[1]) === minor;
      });
      return matching.length > 0 ? matching[matching.length - 1] : null;
    }

    throw new Error(
      `Invalid plugin version selector "${ requestedVersion }". Allowed formats: "major.minor" or "major.minor.micro".`
    );
  }

  public async loadPlugin<
    NamedType extends PluginType,
    ClassType extends PluginTypeDefinitionRef<NamedType> = PluginTypeDefinitionRef<NamedType>
  >(
    log: IPluginLogging,
    npmPackage: string | null,
    plugin: string,
    name: string,
    requestedVersion?: string | null,
  ): Promise<Result<LoadedPlugin<NamedType, ClassType>, Error>> {
    const tTrace = internalTrace(`loadPlugin:${ npmPackage }:${ plugin }`);
    log.debug(tTrace, `Plugin {name} from {package} try load as {pluginName}`, {
      name: plugin,
      pluginName: name,
      package: npmPackage ?? "self",
    });
    const nodeModulesLib = npmPackage !== null;
    let pluginPath = "";
    let packageCwd = this.cwd;
    let version = (
      typeof requestedVersion === "string" &&
      requestedVersion.length > 0
    )
      ? requestedVersion
      : "1.0.0";
    if (!nodeModulesLib) {
      // If no package is defined in the config, we will not look anywhere else except for the local plugins
      if (this.runtimeMode === "dev") {
        pluginPath = join(this.cwd, "./src/plugins/" + plugin);
        if (!existsSync(pluginPath)) {
          pluginPath = "";
        }
      }
      if (pluginPath == "") {
        pluginPath = join(this.cwd, "./lib/plugins/" + plugin);
      }
      const packageJsonPath = join(packageCwd, "./package.json");
      if (existsSync(packageJsonPath)) {
        const packageJSON = JSON.parse(
          readFileSync(packageJsonPath, "utf-8")
            .toString(),
        );
        version = packageJSON.version??'0.0.0';
      }
    } else {
      // If a package is defined in the config, we will look for the plugin in the BSB_PLUGIN_DIR env, followed by the node_modules directory. Local plugins are not used.
      if (this.referencedPluginDir) {
        const availableVersions = this.listVersionsFromReferencedDir(npmPackage);
        const resolved = this.resolveVersionFromSelector(
          availableVersions,
          requestedVersion ?? null,
        );

        if (resolved) {
          const versionedPluginPath = join(resolved.pluginRoot, "./lib/plugins/" + plugin);
          if (existsSync(versionedPluginPath)) {
            pluginPath = versionedPluginPath;
            packageCwd = resolved.packageCwd;
            version = resolved.version;
          }
        }

      }
      if (pluginPath == "") {
        const nodeModulesPluginPath = join(this.nodeModulesPluginDir, npmPackage, "./lib/plugins/" + plugin);
        const nodeModulesPackageCwd = join(this.nodeModulesPluginDir, npmPackage);
        if (existsSync(nodeModulesPluginPath)) {
          pluginPath = nodeModulesPluginPath;
          packageCwd = nodeModulesPackageCwd;
        }
      }

      if (existsSync(packageCwd) && existsSync(join(packageCwd, "./package.json"))) {
        const packageJSON = JSON.parse(
          readFileSync(join(packageCwd, "./package.json"), "utf-8")
            .toString(),
        );
        version = packageJSON.version??'0.0.0';
      }
    }
    if (!existsSync(pluginPath)) {
      log.error(tTrace, `Plugin {name} in {package} not found`, {
        name: plugin,
        package: npmPackage ?? "self",
      });
      return Err(new Error(`Plugin ${plugin} in ${npmPackage ?? "self"} not found`));
    }

    log.debug(tTrace, `Plugin {name}: attempt to load from {path} as {pluginName}`, {
      name: plugin,
      path: pluginPath,
      pluginName: name,
    });

    const loadResult = await fromPromise(this.loadPluginFile<NamedType, ClassType>(
      pluginPath,
      name,
      packageCwd,
      version
    ));

    if (!loadResult.success) {
      log.error(tTrace, `Failed to load plugin {name}: {error}`, {
        name: plugin,
        error: loadResult.error.message,
      });
      return Err(new Error(`Failed to load plugin ${name}: ${loadResult.error.message}`));
    }

    log.info(tTrace, `Successfully loaded plugin {name} v{version}`, { name: plugin, version: version });
    return Ok(loadResult.data);
  }

  public async loadPluginFile<
    NamedType extends PluginType,
    ClassType extends PluginTypeDefinitionRef<NamedType>
  >(
    pluginPath: string,
    pluginName: string,
    packageCwd: string,
    version: string
  ): Promise<LoadedPlugin<NamedType, ClassType>> {
    const candidateFiles = this.runtimeMode === "dev"
      ? [join(pluginPath, "./index.ts"), join(pluginPath, "./index.js")]
      : [join(pluginPath, "./index.js")];
    const pluginFile = candidateFiles.find((candidate) => existsSync(candidate));

    if (!pluginFile) {
      throw new Error(`Plugin ${ pluginName } not found in ${ pluginPath }`);
    }

    const pluginExports = await import(toImportUrl(pluginFile));

    if (!pluginExports.Plugin) {
      throw new Error(`Plugin ${ pluginName } does not export a Plugin class`);
    }

    let serviceConfigDef: BSBPluginConfig<any> | null = null;
    if (pluginExports.Config) {
      serviceConfigDef = new (pluginExports.Config as typeof BSBPluginConfigRef)(
        process.cwd(),
        packageCwd,
        pluginPath,
        pluginName
      );
    }

    return {
      name: pluginName,
      ref: pluginName,
      version: version,
      serviceConfig: serviceConfigDef,
      plugin: pluginExports.Plugin,
      packageCwd: packageCwd,
      pluginCwd: pluginPath,
      pluginPath: pluginPath,
    };
  }
}
