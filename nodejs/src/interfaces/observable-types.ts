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

import { PluginDefinition, FilterDetailed } from "./plugins.js";

/**
 * Observable event types - unified logging, metrics, and tracing events
 * @hidden
 */
export const ObservableEventTypesBase = {
  // Logging events
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  // Metrics events
  counter: "counter",
  gauge: "gauge",
  histogram: "histogram",
  // Tracing events
  spanStart: "spanStart",
  spanEnd: "spanEnd",
  spanError: "spanError",
} as const;

/**
 * @hidden
 */
export type ObservableEventTypes =
  (typeof ObservableEventTypesBase)[keyof typeof ObservableEventTypesBase];

/**
 * @hidden
 */
export type ObservableFilterDetailed = FilterDetailed<ObservableEventTypes>;

/**
 * Observable filter - controls which events go to which plugin instances
 * @hidden
 */
export type ObservableFilter =
  | ObservableFilterDetailed // eventsDetailed
  | Record<ObservableEventTypes, boolean> // eventsState
  | Record<ObservableEventTypes, Array<string>> // eventsPlugins
  | Array<ObservableEventTypes>; // events

/**
 * Observable plugin configuration
 * @hidden
 */
export interface ObservableConfig extends PluginDefinition {
  filter?: ObservableFilter;
}
