import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {broadcast} from "./events/broadcast.js";
import {emit} from "./events/emit.js";
import {emitAndReturn} from "./events/emitAndReturn.js";
import {emitStreamAndReceiveStream} from "./events/emitStreamAndReceiveStream.js";
import {randomUUID} from "crypto";
import {hostname} from "os";
import {Readable} from "stream";
import {
  BSBEvents,
  BSBEventsConstructor,
  createConfigSchema,
  Observable,
  DTrace,
  PluginObservable,
  ResourceContextBuilder,
  createFakeDTrace,
} from "@bsb/base";
import * as av from "@anyvali/js";

const ConfigSchema = av.object({
  platformKey: av.nullable(av.string()).default(null),
  fatalOnDisconnect: av.optional(av.bool()).default(true),
  prefetch: av.optional(av.int32()).default(10),
  endpoints: av.optional(av.array(av.string())).default(["amqp://localhost"]),
  credentials: av.object({
    username: av.optional(av.string()).default("guest"),
    password: av.optional(av.string()).default("guest"),
  }, { unknownKeys: "strip" }).default({ username: "guest", password: "guest" }),
  uniqueId: av.nullable(av.string()).default(null),
}, { unknownKeys: "strip" });

export const Config = createConfigSchema(
  {
    name: 'events-rabbitmq',
    description: 'RabbitMQ events plugin for distributed event bus',
    image: './assets/events-rabbitmq.png',
    tags: ['rabbitmq', 'amqp', 'event-bus', 'distributed'],
    documentation: ['./docs/plugin.md'],
  },
  ConfigSchema
);

export class Plugin extends BSBEvents<InstanceType<typeof Config>> {
  static Config = Config;

  public publishConnection!: amqplib.AmqpConnectionManager;
  public receiveConnection!: amqplib.AmqpConnectionManager;
  public myId!: string;
  private ear: emitAndReturn;
  private broadcast: broadcast;
  private emit: emit;
  private eas: emitStreamAndReceiveStream;

  constructor(config: BSBEventsConstructor<InstanceType<typeof Config>>) {
    super(config);
    this.broadcast = new broadcast(this);
    this.emit = new emit(this);
    this.ear = new emitAndReturn(this);
    this.eas = new emitStreamAndReceiveStream(this);
  }

  getPlatformName(name: string): string {
    if (this.config.platformKey === null) return name;
    return `${name}-${this.config.platformKey}`;
  }

  async init(obs: Observable): Promise<void> {
    await this._connectToAMQP(obs);
  }

  public createObservableFromTrace(trace?: DTrace, attributes?: Record<string, string | number | boolean>): Observable {
    const safeTrace = trace ?? createFakeDTrace("events-rabbitmq", "missing-trace");
    const resource = ResourceContextBuilder.build({
      appId: this.appId,
      mode: this.mode,
      pluginName: this.pluginName,
      cwd: this.cwd,
      packageCwd: this.packageCwd,
      pluginCwd: this.pluginCwd,
      pluginVersion: (this as any).pluginVersion || 'unknown',
    }, this.region);
    return new PluginObservable(
      safeTrace,
      resource,
      this.__internalObservable,
      attributes || {},
    );
  }

  private async _connectToAMQP(obs: Observable) {
    const endpoints = this.config.endpoints ?? ["amqp://localhost"];
    const fatalOnDisconnect = this.config.fatalOnDisconnect ?? true;
    const credentials = this.config.credentials;

    obs.log.info('Connect to {endpoints}', {
      endpoints,
    });
    const socketOptions: amqplib.AmqpConnectionManagerOptions = {
      connectionOptions: {},
    };
    if (credentials?.username) {
      socketOptions.connectionOptions!.credentials =
          amqplibCore.credentials.plain(
              credentials.username,
              credentials.password ?? "guest"
          );
    }
    this.publishConnection = amqplib.connect(
        endpoints,
        socketOptions
    );
    this.receiveConnection = amqplib.connect(
        endpoints,
        socketOptions
    );
    // Connection event handlers (no obs available, using console at module level)
    this.publishConnection.on("connect", async (data: any) => {
      console.log(`[events-rabbitmq] AMQP CONNECTED: ${data.url}`);
    });
    this.publishConnection.on(
        "connectFailed",
        async (data: any): Promise<any> => {
          if (
              fatalOnDisconnect ||
              endpoints.length === 1
          ) {
            console.error(`[events-rabbitmq] AMQP CONNECT FAIL: ${data.url} (${data.err.toString()})`);
            process.exit(5);
          }
          console.error(`[events-rabbitmq] AMQP CONNECT FAIL: ${data.url} (${data.err.toString()})`);
        }
    );
    this.publishConnection.on("error", async (err: any) => {
      if (err.message !== "Connection closing") {
        console.error(`[events-rabbitmq] AMQP ERROR: ${err.message}`);
      }
      if (fatalOnDisconnect) {
        console.error(`[events-rabbitmq] AMQP ERROR: ${err.message}`);
        process.exit(5);
      }
    });
    this.receiveConnection.on("error", async (err: any) => {
      if (err.message !== "Connection closing") {
        console.error(`[events-rabbitmq] AMQP ERROR: ${err.message}`);
      }
      if (fatalOnDisconnect) {
        console.error(`[events-rabbitmq] AMQP ERROR: ${err.message}`);
        process.exit(5);
      }
    });
    this.publishConnection.on("close", async (): Promise<any> => {
      console.warn("[events-rabbitmq] AMQP CONNECTION CLOSED");
    });
    this.receiveConnection.on("close", async (): Promise<any> => {
      console.warn("[events-rabbitmq] AMQP CONNECTION CLOSED");
    });

    obs.log.info('Connected to {endpoints}x2? (s:{sendS}/p:{pubS})', {
      endpoints,
      sendS: this.receiveConnection.isConnected(),
      pubS: this.publishConnection.isConnected(),
    });

    this.myId = `${this.config.uniqueId ?? hostname()}-${randomUUID()}`;
    await this.broadcast.init(obs);
    await this.emit.init(obs);
    await this.ear.init(obs);
  }

  public dispose() {
    this.broadcast.dispose();
    this.emit.dispose();
    this.ear.dispose();
    this.eas.dispose();
    this.publishConnection.close();
    this.receiveConnection.close();
  }

  async onBroadcast(
      obs: Observable,
      pluginName: string,
      event: string,
      listener: { (obs: Observable, args: any[]): Promise<void> }
  ): Promise<void> {
    await this.broadcast.onBroadcast(obs, pluginName, event, listener);
  }

  async emitBroadcast(
      obs: Observable,
      pluginName: string,
      event: string,
      args: any[]
  ): Promise<void> {
    await this.broadcast.emitBroadcast(obs, pluginName, event, args);
  }

  async onEvent(
      obs: Observable,
      pluginName: string,
      event: string,
      listener: { (obs: Observable, args: any[]): Promise<void> }
  ): Promise<void> {
    await this.emit.onEvent(obs, pluginName, event, listener);
  }

  async emitEvent(
      obs: Observable,
      pluginName: string,
      event: string,
      args: any[]
  ): Promise<void> {
    await this.emit.emitEvent(obs, pluginName, event, args);
  }

  async onReturnableEvent(
      obs: Observable,
      pluginName: string,
      event: string,
      listener: {(obs: Observable, args: any[]): Promise<any>}
  ): Promise<void> {
    await this.ear.onReturnableEvent(obs, pluginName, event, listener);
  }

  async emitEventAndReturn(
      obs: Observable,
      pluginName: string,
      event: string,
      timeoutSeconds: number,
      args: any[]
  ): Promise<any> {
    return await this.ear.emitEventAndReturn(
        obs,
        pluginName,
        event,
        timeoutSeconds,
        args
    );
  }

  async receiveStream(
      obs: Observable,
      pluginName: string,
      event: string,
      listener: (obs: Observable, error: Error | null, stream: Readable) => Promise<void>,
      timeoutSeconds?: number | undefined
  ): Promise<string> {
    return this.eas.receiveStream(obs, pluginName, event, listener, timeoutSeconds);
  }

  async sendStream(
      obs: Observable,
      pluginName: string,
      event: string,
      streamId: string,
      stream: Readable
  ): Promise<void> {
    return this.eas.sendStream(obs, pluginName, event, streamId, stream);
  }
}
