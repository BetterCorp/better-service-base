import { BSBServiceClient } from "../..";
import { Plugin } from ".";
import { DTrace } from "../../interfaces/metrics";

export class testClient extends BSBServiceClient<Plugin> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public dispose?(): void;
  public run?(): Promise<void>;
  public readonly pluginName: string = "service-default1";
  private count = 0;
  public async init(trace: DTrace): Promise<void> {
    // Handle emittable events
    this.events.onEvent("onEmittable", trace, async (trace: DTrace, a: number, b: number) => {
      this.log.warn(trace, "onEmittable ({a},{b})", { a, b });
    });

    // Handle returnable events
    this.events.onReturnableEvent("onReverseReturnable", trace, async (trace: DTrace, a: number, b: number) => {
      this.count++;
      this.log.warn(trace, "onReverseReturnable ({a},{b})", { a, b });
      return a * b;
    });

    // Emit receivable event
    await this.events.emitEvent("onReceivable", trace, 56, 7);
  }

  async abc(a: number, b: number, c: number, d: number): Promise<void> {
    const trace = this.metrics.createTrace();
    const span = this.metrics.createSpan(trace.trace, "abc");

    try {
      const result = await this.events.emitEventAndReturn("onReturnable", span.trace, 5, c, d);
      this.log.warn(span.trace, "TESTING onReturnable ({result})", { result });
    } catch (error) {
      span.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
      trace.end();
    }
  }
}
