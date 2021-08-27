import { CLogger } from "@bettercorp/service-base/lib/ILib";
import { MyPluginConfig } from './sec.config';

export class Logger extends CLogger<MyPluginConfig> {
  debug(plugin: string, ...data: any[]): void {
    throw 'debug not setup';
  }
  info(plugin: string, ...data: any[]): void {
    throw 'info not setup';
  }
  warn(plugin: string, ...data: any[]): void {
    throw 'warn not setup';
  }
  error(plugin: string, ...data: any[]): void {
    throw 'error not setup';
  }
  fatal(plugin: string, ...data: any[]): void {
    throw 'fatal not setup';
  }
}