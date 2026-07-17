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

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Prevent a plugin package entrypoint from being executed outside BSB.
 * Normal imports are unaffected.
 *
 * @example guardBsbEntrypoint(import.meta.url);
 */
export function guardBsbEntrypoint(importMetaUrl: string): void {
  if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === importMetaUrl) {
    throw new Error(
      "This is a BSB plugin and cannot be executed directly.\n" +
      "Start it with `bsb-plugin-cli start` or the package's `npm start` command.",
    );
  }
}