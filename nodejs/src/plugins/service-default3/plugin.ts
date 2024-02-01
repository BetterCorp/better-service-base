import { BSBService, BSBServiceConstructor } from "../../";
import { testClient } from "../service-default1";

export class Plugin extends BSBService<null> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};
  dispose?(): void;
  init?(): void | Promise<void>;
  public override initAfterPlugins: string[] = ["service-default2"];
  private testClient: testClient;
  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new testClient(this);
  }
  public override async run() {
    await this.testClient.abc(18, 19, 20, 21);
    this.log.error("Error {a}", new Error("err"), { a: "b" });
  }
}
