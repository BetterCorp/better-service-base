/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
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

import { expect } from "chai";
import { SBMetrics } from "../../serviceBase";
import { PluginMetrics } from "../../base/PluginMetrics";
import { BSBError } from "../../base/errorMessages";
import { DTrace } from "../../interfaces";
import { EventEmitter } from "events";

describe("PluginMetrics", () => {
  let mockMetrics: SBMetrics;
  let pluginMetrics: PluginMetrics;
  const appId = "test-app";
  const pluginName = "test-plugin";

  function createMockMetrics(isReady: boolean = true): SBMetrics {
    return {
      isReady,
      metricsBus: new EventEmitter() as any
    } as SBMetrics;
  }

  beforeEach(() => {
    mockMetrics = createMockMetrics(true);
    pluginMetrics = new PluginMetrics(appId, pluginName, mockMetrics);
  });

  describe("createCounter", () => {
    it("should create a counter and emit creation event", (done) => {
      const name = "test_counter";
      const description = "Test counter";
      const help = "Help text";
      const labels = ["label1", "label2"];

      mockMetrics.metricsBus.once("createCounter", (timestamp, emittedAppId, emittedPlugin, emittedName, emittedDesc, emittedHelp, emittedLabels) => {
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(emittedName).to.equal(name);
        expect(emittedDesc).to.equal(description);
        expect(emittedHelp).to.equal(help);
        expect(emittedLabels).to.deep.equal(labels);
        done();
      });

      pluginMetrics.createCounter(name, description, help, labels);
    });

    it("should increment counter and emit increment event", (done) => {
      const name = "test_counter";
      const value = 5;
      const labels = { label1: "value1" };

      mockMetrics.metricsBus.once("updateCounter", (timestamp, event, emittedAppId, emittedPlugin, emittedName, emittedValue, emittedLabels) => {
        expect(event).to.equal("inc");
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(emittedName).to.equal(name);
        expect(emittedValue).to.equal(value);
        expect(emittedLabels).to.deep.equal(labels);
        done();
      });

      const counter = pluginMetrics.createCounter(name, "desc", "help");
      counter.increment(value, labels);
    });

    it("should throw error when metrics not ready", () => {
      pluginMetrics = new PluginMetrics(appId, pluginName, createMockMetrics(false));
      expect(() => pluginMetrics.createCounter("test", "desc", "help")).to.throw(BSBError);
    });
  });

  describe("createGauge", () => {
    it("should create a gauge and emit creation event", (done) => {
      const name = "test_gauge";
      const description = "Test gauge";
      const help = "Help text";
      const labels = ["label1", "label2"];

      mockMetrics.metricsBus.once("createGauge", (timestamp, emittedAppId, emittedPlugin, emittedName, emittedDesc, emittedHelp, emittedLabels) => {
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(emittedName).to.equal(name);
        expect(emittedDesc).to.equal(description);
        expect(emittedHelp).to.equal(help);
        expect(emittedLabels).to.deep.equal(labels);
        done();
      });

      pluginMetrics.createGauge(name, description, help, labels);
    });

    it("should set gauge value and emit set event", (done) => {
      const name = "test_gauge";
      const value = 10;
      const labels = { label1: "value1" };

      mockMetrics.metricsBus.once("updateGauge", (timestamp, event, emittedAppId, emittedPlugin, emittedName, emittedValue, emittedLabels) => {
        expect(event).to.equal("set");
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(emittedName).to.equal(name);
        expect(emittedValue).to.equal(value);
        expect(emittedLabels).to.deep.equal(labels);
        done();
      });

      const gauge = pluginMetrics.createGauge(name, "desc", "help");
      gauge.set(value, labels);
    });
  });

  describe("createHistogram", () => {
    it("should create a histogram and emit creation event", (done) => {
      const name = "test_histogram";
      const description = "Test histogram";
      const help = "Help text";
      const boundaries = [0.1, 0.5, 1];
      const labels = ["label1", "label2"];

      mockMetrics.metricsBus.once("createHistogram", (timestamp, emittedAppId, emittedPlugin, emittedName, emittedDesc, emittedHelp, emittedBoundaries, emittedLabels) => {
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(emittedName).to.equal(name);
        expect(emittedDesc).to.equal(description);
        expect(emittedHelp).to.equal(help);
        expect(emittedBoundaries).to.deep.equal(boundaries);
        expect(emittedLabels).to.deep.equal(labels);
        done();
      });

      pluginMetrics.createHistogram(name, description, help, boundaries, labels);
    });

    it("should record histogram value and emit record event", (done) => {
      const name = "test_histogram";
      const value = 0.75;
      const labels = { label1: "value1" };

      mockMetrics.metricsBus.once("updateHistogram", (timestamp, event, emittedAppId, emittedPlugin, emittedName, emittedValue, emittedLabels) => {
        expect(event).to.equal("record");
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(emittedName).to.equal(name);
        expect(emittedValue).to.equal(value);
        expect(emittedLabels).to.deep.equal(labels);
        done();
      });

      const histogram = pluginMetrics.createHistogram(name, "desc", "help");
      histogram.record(value, labels);
    });
  });

  describe("createTrace", () => {
    it("should create a trace and emit start trace event", (done) => {
      const name = "test_trace";
      const attributes = { attr1: "value1" };

      mockMetrics.metricsBus.once("startTrace", (timestamp, emittedAppId, emittedPlugin, traceId, emittedName, emittedAttrs) => {
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(traceId).to.be.a("string");
        expect(emittedName).to.equal(name);
        expect(emittedAttrs).to.deep.equal(attributes);
        done();
      });

      pluginMetrics.createTrace(name, attributes);
    });
  });

  describe("createSpan", () => {
    it("should create a span from existing trace", (done) => {
      const trace: DTrace = { t: "trace-id", s: "span-id" };
      const name = "test_span";
      const attributes = { attr1: "value1" };

      mockMetrics.metricsBus.once("startSpan", (timestamp, emittedAppId, emittedPlugin, traceId, parentSpanId, spanId, emittedName, emittedAttrs) => {
        expect(emittedAppId).to.equal(appId);
        expect(emittedPlugin).to.equal(pluginName);
        expect(traceId).to.equal(trace.t);
        expect(parentSpanId).to.equal(trace.s);
        expect(spanId).to.be.a("string");
        expect(emittedName).to.equal(name);
        expect(emittedAttrs).to.deep.equal(attributes);
        done();
      });

      pluginMetrics.createSpan(trace, name, attributes);
    });
  });

  describe("createTimer", () => {
    it("should create a timer that measures elapsed time", (done) => {
      const timer = pluginMetrics.createTimer();
      setTimeout(() => {
        const elapsed = timer.stop();
        expect(elapsed).to.be.a("number");
        expect(elapsed).to.be.greaterThan(0);
        done();
      }, 10);
    });

    it("should throw error when metrics not ready", () => {
      pluginMetrics = new PluginMetrics(appId, pluginName, createMockMetrics(false));
      expect(() => pluginMetrics.createTimer()).to.throw(BSBError);
    });
  });
});
