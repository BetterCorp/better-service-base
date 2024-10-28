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

import { EventEmitter } from "events";
import { IPluginLogger } from "../../../interfaces/logging";

export default class broadcast extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }
  public dispose() {
    this.removeAllListeners();
  }

  public async onBroadcast(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    this.log.debug("onBroadcast:listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${pluginName}-${event}`, listener);
  }

  public async emitBroadcast(
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    this.log.debug("emitBroadcast: emitting {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.emit(`${pluginName}-${event}`, args);
  }
}
