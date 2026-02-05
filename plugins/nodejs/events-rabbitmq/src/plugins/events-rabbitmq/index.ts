import * as amqplib from "amqp-connection-manager";
import * as amqplibCore from "amqplib";
import {Tools} from "@bettercorp/tools/lib/Tools";
import {broadcast} from "./events/broadcast";
import {emit} from "./events/emit";
import {emitAndReturn} from "./events/emitAndReturn";
import {emitStreamAndReceiveStream} from "./events/emitStreamAndReceiveStream";
import {randomUUID} from "crypto";
import {hostname} from "os";
import {Readable} from "stream";
import {
  BSBEvents,
  BSBEventsConstructor,
  BSBPluginConfig,
} from "@bsb/base";
import {z} from "zod";

export const secSchema = z
    .object({
      platformKey: z
          .string()
          .nullable()
          .default(null)
          .describe(
              "If you want to run multiple bsb platforms on a single rabbitmq"
          ),
      fatalOnDisconnect: z
          .boolean()
          .default(true)
          .describe(
              "Disconnect on error: Cause the bsb service to exit code 1 if the connection drops"
          ),
      prefetch: z
          .number()
          .default(10)
          .describe("Prefetch: The RabbitMQ Prefetch amount"),
      endpoints: z
          .array(z.string())
          .default(["amqp://localhost"])
          .describe("Endpoints: The list of servers(cluster) to connect too"),
      credentials: z
          .object({
            username: z.string().default("guest").describe("Username"),
            password: z.string().default("guest").describe("Password"),
          })
          .default({}),
      uniqueId: z
          .string()
          .nullable()
          .default(null)
          .describe(
              "Unique Client ID: A static client Id - hostname is used when not set"
          ),
    })
    .default({});

export class Config extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
      toVersion: string,
      fromVersion: string | null,
      fromConfig: any | null
  ) {
    return fromConfig;
  }
}

export class Plugin extends BSBEvents<Config> {
  public publishConnection!: amqplib.AmqpConnectionManager;
  public receiveConnection!: amqplib.AmqpConnectionManager;
  public myId!: string;
  private ear: emitAndReturn;
  private broadcast: broadcast;
  private emit: emit;
  private eas: emitStreamAndReceiveStream;

  constructor(config: BSBEventsConstructor) {
    super(config);
    this.broadcast = new broadcast(this, this.createNewLogger("broadcast"));
    this.emit = new emit(this, this.createNewLogger("emit"));
    this.ear = new emitAndReturn(this, this.createNewLogger("emitAndReturn"));
    this.eas = new emitStreamAndReceiveStream(
        this,
        this.createNewLogger("stream")
    );
  }

  getPlatformName(name: string): string {
    if (this.config.platformKey === null) return name;
    return `${name}-${this.config.platformKey}`;
  }

  async init(): Promise<void> {
    await this._connectToAMQP();
  }

  private async _connectToAMQP() {
    this.log.info(`Connect to {endpoints}`, {
      endpoints: this.config.endpoints,
    });
    const socketOptions: amqplib.AmqpConnectionManagerOptions = {
      connectionOptions: {},
    };
    if (!Tools.isNullOrUndefined(this.config.credentials)) {
      socketOptions.connectionOptions!.credentials =
          amqplibCore.credentials.plain(
              this.config.credentials.username,
              this.config.credentials.password
          );
    }
    this.publishConnection = amqplib.connect(
        this.config.endpoints,
        socketOptions
    );
    this.receiveConnection = amqplib.connect(
        this.config.endpoints,
        socketOptions
    );
    const self = this;
    this.publishConnection.on("connect", async (data: any) => {
      self.log.info("AMQP CONNECTED: {url}", {url: data.url});
    });
    this.publishConnection.on(
        "connectFailed",
        async (data: any): Promise<any> => {
          if (
              self.config.fatalOnDisconnect ||
              self.config.endpoints.length === 1
          ) {
            self.log.error("AMQP CONNECT FAIL: {url} ({msg})", {
              url: data.url,
              msg: data.err.toString(),
            });
            process.exit(5);
          }
          self.log.error("AMQP CONNECT FAIL: {url} ({msg})", {
            url: data.url,
            msg: data.err.toString(),
          });
        }
    );
    this.publishConnection.on("error", async (err: any) => {
      if (err.message !== "Connection closing") {
        self.log.error("AMQP ERROR: {message}", {message: err.message});
      }
      if (self.config.fatalOnDisconnect) {
        self.log.error("AMQP ERROR: {message}", {
          message: err.message,
        });
        process.exit(5);
      }
    });
    this.receiveConnection.on("error", async (err: any) => {
      if (err.message !== "Connection closing") {
        self.log.error("AMQP ERROR: {message}", {message: err.message});
      }
      if (self.config.fatalOnDisconnect) {
        self.log.error("AMQP ERROR: {message}", {
          message: err.message,
        });
        process.exit(5);
      }
    });
    this.publishConnection.on("close", async (): Promise<any> => {
      self.log.warn("AMQP CONNECTION CLOSED");
    });
    this.receiveConnection.on("close", async (): Promise<any> => {
      self.log.warn("AMQP CONNECTION CLOSED");
    });

    this.log.info(`Connected to {endpoints}x2? (s:{sendS}/p:{pubS})`, {
      endpoints: this.config.endpoints,
      sendS: this.receiveConnection.isConnected(),
      pubS: this.publishConnection.isConnected(),
    });

    this.myId = `${this.config.uniqueId ?? hostname()}-${randomUUID()}`;
    await this.broadcast.init();
    await this.emit.init();
    await this.ear.init();
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
      pluginName: string,
      event: string,
      listener: { (traceId: string | undefined, args: any[]): Promise<void> }
  ): Promise<void> {
    await this.broadcast.onBroadcast(pluginName, event, listener);
  }

  async emitBroadcast(
      pluginName: string,
      event: string,
      traceId: string,
      args: any[]
  ): Promise<void> {
    await this.broadcast.emitBroadcast(pluginName, event, traceId, args);
  }

  async onEvent(
      pluginName: string,
      event: string,
      listener: { (traceId: string | undefined, args: any[]): Promise<void> }
  ): Promise<void> {
    await this.emit.onEvent(pluginName, event, listener);
  }

  async emitEvent(
      pluginName: string,
      event: string,
      traceId: string | undefined,
      args: any[]
  ): Promise<void> {
    await this.emit.emitEvent(pluginName, event, traceId, args);
  }

  async onReturnableEvent(
      pluginName: string,
      event: string,
      listener: {(traceId: string | undefined, args: any[]): Promise<any>}
  ): Promise<void> {
    await this.ear.onReturnableEvent(pluginName, event, listener);
  }

  async emitEventAndReturn(
      pluginName: string,
      event: string,
      traceId: string | undefined,
      timeoutSeconds: number,
      args: any[]
  ): Promise<any> {
    return await this.ear.emitEventAndReturn(
        pluginName,
        event,
        traceId,
        timeoutSeconds,
        args
    );
  }

  async receiveStream(
      event: string,
      listener: (error: Error | null, stream: Readable) => Promise<void>,
      timeoutSeconds?: number | undefined
  ): Promise<string> {
    return this.eas.receiveStream(listener, timeoutSeconds);
  }

  async sendStream(
      event: string,
      streamId: string,
      stream: Readable
  ): Promise<void> {
    return this.eas.sendStream(streamId, stream);
  }
}
