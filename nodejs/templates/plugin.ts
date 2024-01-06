import { ServicesBase } from "../src/index"; //"@bettercorp/service-base";
import {
  ServiceBroadcasts,
  ServiceCallable,
  ServiceEvents,
  ServiceReturnableEvents,
} from "../src/service/base";
import { PluginConfig } from "./sec.config";

/// TODO: Move these interfaces to your index.ts file so your client plugins can reference them
/// The reason for the index.ts file is if you are publishing any dist-clients, they will need to reference these interfaces
export interface OnEvents extends ServiceEvents {}
export interface EmitEvents extends ServiceEvents {}
export interface OnReturnableEvents extends ServiceReturnableEvents {}
export interface EmitReturnableEvents extends ServiceReturnableEvents {}
export interface CallableMethods extends ServiceCallable {}
export interface OnBroadcastEvents extends ServiceBroadcasts {}
export interface EmitBroadcastEvents extends ServiceBroadcasts {}
/// TODO: Move these interfaces to your index.ts file so your client plugins can reference them

export class Plugin
  extends ServicesBase<
    PluginConfig,
    OnEvents,
    EmitEvents,
    OnReturnableEvents,
    EmitReturnableEvents,
    CallableMethods,
    OnBroadcastEvents,
    EmitBroadcastEvents
  >
  implements CallableMethods
{
  /**
   * initAfterPlugins is a list of plugins that must be initialized before this plugin
   * This is useful if you need to initialize a plugin before/after another plugin
   * For example, if you have a plugin that requires a database connection, you can
   * add the database plugin to this list so that it is initialized before your plugin
   * is initialized
   */
  public override initAfterPlugins: string[] = [];
  /**
   * initBeforePlugins is a list of plugins that must be initialized after this plugin
   * This is useful if you need to initialize a plugin before/after another plugin
   * For example, another plugin may require your plugin to be initialized before it
   * is initialized
   */
  public override initBeforePlugins: string[] = [];
  /**
   * runAfterPlugins is a list of plugins that must be run before this plugin
   */
  public override runAfterPlugins: string[] = [];
  /**
   * runBeforePlugins is a list of plugins that must be run after this plugin
   */
  public override runBeforePlugins: string[] = [];

  /**
   * This method is called to setup the plugin
   * Add all your on event handlers here
   * Init is called before run
   */
  public override async init(): Promise<void> {}

  /**
   * This method is called once the plugin is loaded and ready to run
   */
  public override async run(): Promise<void> {}
}
