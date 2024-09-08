import {BSBService, BSBServiceConstructor, ServiceClient} from "../../index";
import {Plugin as S3Plugin} from "../service-default3/index";

export class Plugin
    extends BSBService<null> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};

  dispose?(): void;

  init?(): void | Promise<void>;

  public override initAfterPlugins: string[] = [];
  private service3: ServiceClient<S3Plugin>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.service3 = new ServiceClient(S3Plugin, this);
  }

  public override async run() {
    const traceId = this.metrics.createTrace().id;
    this.log.info("TEST CALLABLE OK ? [{result}]", {
      result: this.service3.callMethod("testMethod"),
    });
    this.log.info("TEST RETURNABLE OK ? [{result}]", {
      result: await this.service3.events.emitEventAndReturn(
          "onReverseReturnable",
          traceId,
          5,
          "teXt",
      ),
    });
  }
}
