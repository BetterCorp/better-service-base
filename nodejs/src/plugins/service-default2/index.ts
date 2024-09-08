import {BSBService, BSBServiceConstructor, ServiceClient} from "../../index";
import {Plugin as Default0Plugin} from "../../plugins/service-default0/index";

export class Plugin
    extends BSBService<null> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};

  dispose?(): void;

  init?(): void | Promise<void>;

  public initAfterPlugins: string[] = ["service-default1"];
  private testClient: ServiceClient<Default0Plugin>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new ServiceClient(Default0Plugin, this);
  }

  public async run() {
    const traceId = this.metrics.createTrace().id;
    await this.testClient.callMethod('abc', traceId, 10, 12, 11, 13);
  }
}
