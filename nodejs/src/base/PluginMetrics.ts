/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  DTrace, generateTimeBasedId, IPluginMetrics, Span, Timer
} from "../interfaces";
import { SBMetrics } from "../serviceBase";
import { BSBError } from "./errorMessages";
import { MS_PER_NS, NS_PER_SEC } from "./base";

export class PluginMetricsSpan implements Span {
  private _traceId: string;
  private _spanId: string;
  private pluginName: string;
  private metrics: SBMetrics;

  constructor(appId: string, metrics: SBMetrics, pluginName:string, traceId: string|null, spanId: string|null, traceName:string|null, spanName: string, attributes: Record<string, string | number | boolean> = {}) {
    this.metrics = metrics;
    this._traceId = traceId ?? generateTimeBasedId(16, appId);
    this._spanId = spanId ?? generateTimeBasedId(8, appId);
    this.pluginName = pluginName;
    if (traceId === null) {
      this.metrics.metricsBus.emit("startTrace", {
        time: Date.now(),
        contextPluginName: this.pluginName,
        traceId: this._traceId,
        name: traceName,
        appId: appId,
        pluginName: this.pluginName,
      });
    }
    if (spanId === null) {
      this.metrics.metricsBus.emit("startSpan", {
        time: Date.now(),
        contextPluginName: this.pluginName,
        traceId: this._traceId,
        appId: appId,
        pluginName: this.pluginName,
        spanId: this._spanId,
        name: spanName,
        attributes: attributes,
      });
    }
  }

  public get traceId(): string {
    return this._traceId;
  }

  public get id(): string {
    return this._spanId;
  }

  public get trace(): DTrace {
    return {
      t: this._traceId,
      s: this._spanId,
    };
  }

  public event(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.metrics.metricsBus.emit("eventSpan", Date.now(), this.pluginName, this._traceId, this._spanId, name, attributes);
  }
  
  public end(attributes?: Record<string, string | number | boolean>): void {
    this.metrics.metricsBus.emit("endSpan", Date.now(), this.pluginName, this._traceId, this._spanId, attributes);
  }
}

export class PluginMetrics implements IPluginMetrics {
  private metrics: SBMetrics;
  private pluginName: string;
  private appId: string;

  constructor(appId: string, plugin: string, metrics: SBMetrics) {
    this.metrics = metrics;
    this.pluginName = plugin;
    this.appId = appId;
  }

  public createNewTrace(name: string, attributes?: Record<string, string | number | boolean>): Span {
    if (!this.metrics.isReady) {
      throw new BSBError("Metrics not ready!", { t: "", s: "" });
    }

    const traceId = uuidv7();
    const spanId = uuidv7();

    this.metrics.metricsBus.emit("startTrace", {
      time: Date.now(),
      contextPluginName: this.pluginName,
      traceId,
      appId: this.appId,
      pluginName: this.pluginName,
    });

    this.metrics.metricsBus.emit("startSpan", Date.now(), this.pluginName, traceId, spanId, name, attributes);

    return new PluginMetricsSpan(this.metrics, traceId, spanId, name, attributes);
  }

  public createNewSpan(parentTrace: DTrace, name: string, attributes?: Record<string, string | number | boolean>): Span {
    if (!this.metrics.isReady) {
      throw new BSBError("Metrics not ready!", { t: "", s: "" });
    }

    const spanId = uuidv7();

    this.metrics.metricsBus.emit("startSpan", Date.now(), this.pluginName, parentTrace.t, spanId, name, attributes);

    return new PluginMetricsSpan(this.metrics, parentTrace.t, spanId, name, attributes);
  }

  // Implement other methods (createCounter, createGauge, createHistogram, createTimer) here...

  public createTimer(): Timer {
    if (!this.metrics.isReady) {
      throw new BSBError("Metrics not ready!", { t: "", s: "" });
    }
    const start = process.hrtime();
    return {
      stop: () => {
        const diff = process.hrtime(start);
        return (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS;
      }
    };
  }
}

// import {v7 as uuidv7} from "uuid";
// import {
//   Counter, createFakeDTrace,
//   DTrace,
//   Gauge,
//   Histogram,
//   IPluginMetrics,
//   Span,
//   Timer
// } from "../interfaces";
// import {SBMetrics} from "../serviceBase";
// import {BSBError} from "./errorMessages";
// import {MS_PER_NS, NS_PER_SEC} from "./base";
//
// export class PluginMetricsSpan implements Span {
//   private _traceId: string;
//   private _spanId: string;
//   private name: string;
//   private attributes: Record<string, string | number | boolean> | undefined;
//   private metrics: SBMetrics;
//
//   public get traceId() {
//     return this._traceId;
//   }
//
//   public get id() {
//     return this._spanId;
//   }
//
//   public get trace(): DTrace {
//     return {
//       t: this._traceId,
//       s: this._spanId,
//     }
//   }
//
//   constructor(metrics: SBMetrics, traceId: string, srcSpanId: string | null, name: string, attributes?: Record<string, string | number | boolean>) {
//     this.metrics = metrics;
//     this._traceId = traceId;
//     this.name = name;
//     this.attributes = attributes;
//     if (srcSpanId === null) {
//       const newSpan = this.createSpan(this.name, this.attributes);
//       this._spanId = newSpan.id;
//     } else
//       this._spanId = srcSpanId;
//   }
//
//   public createSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
//     this.metrics.metricsBus.emit("startSpan", Date.now(), context.pluginName, traceId, spanId, name, attributes);
//
//   }
//
//   public end(attributes?: Record<string, string | number | boolean>): void {
//     if (this.traceId === null) {
//       throw new BSBError("No traceId defined!", createFakeDTrace());
//     }
//     this.metrics.metricsBus.emit("endSpan", Date.now(), context.pluginName, traceId, spanId, attributes);
//   }
// }
//
// export class PluginMetrics
//     implements IPluginMetrics {
//   private metrics: SBMetrics;
//   private pluginName: string;
//   private appId: string;
//
//   constructor(appId: string, plugin: string, metrics: SBMetrics) {
//     this.metrics = metrics;
//     this.pluginName = plugin;
//     this.appId = appId;
//   }
//
//   public createCounter<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Counter<LABELS> {
//     if (!this.metrics.isReady) {
//       throw new BSBError("Metrics not ready!", createFakeDTrace());
//     }
//     this.metrics.metricsBus.emit("createCounter", Date.now(), this.pluginName, name, description, help, labels);
//     return {
//       inc: (value: number = 1, labels?) => {
//         this.metrics.metricsBus.emit("updateCounter", Date.now(), "inc", this.pluginName, name, value, labels);
//       },
//     };
//   }
//
//   public createGauge<LABELS extends string | undefined>(name: string, description: string, help: string, labels?: LABELS[]): Gauge<LABELS> {
//     if (!this.metrics.isReady) {
//       throw new BSBError("Metrics not ready!", createFakeDTrace());
//     }
//     this.metrics.metricsBus.emit("createGauge", Date.now(), this.pluginName, name, description, help, labels);
//     return {
//       set: (value: number, labels?) => {
//         this.metrics.metricsBus.emit("updateGauge", Date.now(), "set", this.pluginName, name, value, labels);
//       },
//       increment: (value: number = 1, labels?) => {
//         this.metrics.metricsBus.emit("updateGauge", Date.now(), "inc", this.pluginName, name, value, labels);
//       },
//       decrement: (value: number = 1, labels?) => {
//         this.metrics.metricsBus.emit("updateGauge", Date.now(), "dec", this.pluginName, name, value, labels);
//       },
//     };
//   }
//
//   public createHistogram<LABELS extends string | undefined>(name: string, description: string, help: string, boundaries?: number[], labels?: LABELS[]): Histogram<LABELS> {
//     if (!this.metrics.isReady) {
//       throw new BSBError("Metrics not ready!", createFakeDTrace());
//     }
//     this.metrics.metricsBus.emit("createHistogram", Date.now(), this.pluginName, name, description, help, boundaries, labels);
//     return {
//       record: (value: number, labels?) => {
//         this.metrics.metricsBus.emit("updateHistogram", Date.now(), "record", this.pluginName, name, value, labels);
//       },
//     };
//   }
//
//   public createNewTrace(firstSpanName: string, firstSpanAttributes?: Record<string, string | number | boolean>): Span {
//     if (!this.metrics.isReady) {
//       throw new BSBError("Metrics not ready!", createFakeDTrace());
//     }
//     const context = this;
//     const traceId = uuidv7();
//     context.metrics.metricsBus.emit("startTrace", {
//       time: Date.now(),
//       contextPluginName: context.pluginName,
//       traceId,
//       appId: this.appId,
//       pluginName: this.pluginName,
//     });
//     return new PluginMetricsSpan(traceId, null, firstSpanName, firstSpanAttributes);
//     const createSpan = (name: string, parentSpanId?: string, attributes?: Record<string, string | number | boolean>): Span => {
//       const spanId = parentSpanId ?? traceId + ":" + uuidv7();
//       if (parentSpanId
//           === undefined) {
//         context.metrics.metricsBus.emit("startSpan", Date.now(), context.pluginName, traceId, spanId, name, attributes);
//       }
//       const dTrace: DTrace = {
//         traceId: traceId,
//         spanId: spanId,
//         createSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
//           return createSpan(name, spanId, attributes);
//         }
//       };
//       return {
//         id: spanId,
//         traceId: traceId,
//         dTrace: dTrace,
//         end: () => {
//           context.metrics.metricsBus.emit("endSpan", Date.now(), context.pluginName, traceId, spanId, attributes);
//         },
//         error: (error: BSBError<any> | Error) => {
//           context.metrics.metricsBus.emit("errorSpan", Date.now(), context.pluginName, traceId, spanId, error, attributes);
//         },
//       };
//     }
//     return {
//       id: traceId,
//       createSpan(name: string, attributes?: Record<string, string>): Span {
//         return createSpan(name, undefined, attributes);
//       },
//       createSpanFromParent(parentSpanId: string, name: string, attributes?: Record<string, string>): Span {
//         return createSpan(name, parentSpanId, attributes);
//       },
//       end: (attributes?: Record<string, string>) => {
//         context.metrics.metricsBus.emit("endTrace", Date.now(), context.pluginName, traceId, attributes);
//       },
//     };
//   }
//
//   public createNewSpan(span: DTrace, name: string, attributes?: Record<string, string | number | boolean>): Span {
//     if (!this.metrics.isReady) {
//       throw new BSBError("Metrics not ready!", createFakeDTrace());
//     }
//
//   }
//
//   public createTimer(): Timer {
//     if (!this.metrics.isReady) {
//       throw new BSBError("Metrics not ready!", createFakeDTrace());
//     }
//     const start = process.hrtime();
//     return {
//       stop: () => {
//         const diff = process.hrtime(start);
//         return (
//             diff[0] * NS_PER_SEC + diff[1]
//         ) * MS_PER_NS;
//       }
//     }
//   }
// }