import { BSBService, BSBServiceConstructor } from "../../";
import { testClient } from "../service-default1";

export class Plugin extends BSBService<null> {
  public static PLUGIN_NAME = "service-default3";
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {
    testMethod: () => {
      this.log.info("TEST CALLABLE OK");
      return "test";
    },
  };
  dispose?(): void;
  public initAfterPlugins: string[] = ["service-default2"];
  private testClient: testClient;
  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new testClient(this);
  }
  public async init() {
    await this.events.onReturnableEvent("onReverseReturnable", async (tex: string) => {
      this.log.warn("onReverseReturnable ({tex})", { tex });
      return tex.split("").reverse().join("");
    });
  }
  public async run() {
    await this.testClient.abc(18, 19, 20, 21);
    this.log.error("Error {a}", new Error("err"), { a: "b" });
  }
}
