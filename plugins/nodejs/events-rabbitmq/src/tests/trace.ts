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

import { DTrace, IPluginObservable } from "@bsb/base";
import { Observable } from "@bsb/base";
import { PluginObservable } from "@bsb/base";
import { ResourceContext } from "@bsb/base";

/**
 * @hidden
 */
export function createFakeDTrace(trace?: string, span?: string): DTrace {
  return {
    t: trace ?? "",
    s: span ?? "",
  };
}

/**
 * Create a test Observable with minimal setup for testing
 * @param trace - Optional trace ID (default: 'test-trace')
 * @param span - Optional span ID (default: 'test-span')
 * @param pluginName - Optional plugin name (default: 'test-plugin')
 * @returns Observable for testing
 * @hidden
 */
export function createTestObservable(
  trace?: string,
  span?: string,
  pluginName: string = "test-plugin",
): Observable {
  const dTrace = createFakeDTrace(trace ?? "test-trace", span ?? "test-span");

  const resource: ResourceContext = {
    "service.name": pluginName,
    "service.version": "1.0.0-test",
    "service.instance.id": "test-instance",
    "deployment.environment": "test",
  };

  const backend: IPluginObservable = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    createCounter: () => ({ increment: () => {} }),
    createGauge: () => ({ set: () => {}, increment: () => {}, decrement: () => {} }),
    createHistogram: () => ({ record: () => {} }),
    createTimer: () => ({ stop: () => 0 }),
    createTrace: () => ({
      id: "test-trace-id",
      trace: createFakeDTrace("test-trace", "test-span"),
      error: () => {},
      end: () => {},
    }),
    createSpan: (parentTrace: DTrace, name: string) => ({
      id: "child-span-" + name,
      trace: createFakeDTrace(parentTrace.t, "child-span-" + name),
      error: () => {},
      end: () => {},
    }),
  } as any;

  return new PluginObservable(dTrace, resource, backend, {});
}
