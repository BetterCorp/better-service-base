import { CLogger } from "@bettercorp/service-base/lib/interfaces/logger";
import { MyPluginConfig } from './sec.config';

export class Logger extends CLogger<MyPluginConfig> {
  async debug(plugin: string, ...data: any[]): Promise<void> {
    throw 'debug not setup';
  }
  async info(plugin: string, ...data: any[]): Promise<void> {
    throw 'info not setup';
  }
  async warn(plugin: string, ...data: any[]): Promise<void> {
    throw 'warn not setup';
  }
  async error(plugin: string, ...data: any[]): Promise<void> {
    throw 'error not setup';
  }
  async fatal(plugin: string, ...data: any[]): Promise<void> {
    throw 'fatal not setup';
  }
}