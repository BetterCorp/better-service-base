import { CLogger } from "./ILib";

export class Logger extends CLogger {
  async debug(plugin: string, ...data: any[]): Promise<void> {
    if (!this.appConfig.runningInDebug) return;
    if (typeof data === "string")
      return console.debug(`[DEBUG][${ plugin.toUpperCase() }] ${ data }`);
    console.debug(`[DEBUG][${ plugin.toUpperCase() }]`, data);
  }
  async info(plugin: string, ...data: any[]): Promise<void> {
    if (typeof data === "string")
      return console.log(`[${ plugin.toUpperCase() }] ${ data }`);
    console.log(`[${ plugin.toUpperCase() }]`, data);
  }
  async warn(plugin: string, ...data: any[]): Promise<void> {
    if (typeof data === "string")
      return console.warn(`[${ plugin.toUpperCase() }] ${ data }`);
    console.warn(`[${ plugin.toUpperCase() }]`, data);
  }
  async error(plugin: string, ...data: any[]): Promise<void> {
    if (typeof data === "string")
      return console.error(`[${ plugin.toUpperCase() }] ${ data }`);
    console.error(`[${ plugin.toUpperCase() }]`, data);
  }
  async fatal(plugin: string, ...data: any[]): Promise<void> {
    await this.error(plugin, 'FATAL', ...data);
  }
}