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

// import { PluginEvents, BSBService } from '../../base';
// import { SBEvents } from '../../serviceBase';


// describe('PluginEvents', () => {
//   let pluginEvents: PluginEvents;
//   let sbEvents: SBEvents;
//   let bsbService: BSBService;

//   beforeEach(() => {
//     // Initialize your SBEvents and BSBService here
//     sbEvents = new SBEvents();
//     bsbService = new BSBService();
//     pluginEvents = new PluginEvents("development",);
//   });

//   describe('onBroadcast', () => {
//     it('should register an event listener', async () => {
//       const event = 'testEvent';
//       const listener = async () => {};

//       await pluginEvents.onBroadcast(event, listener);

//       // Here you need to check if the listener has been registered correctly
//       // This depends on your implementation of SBEvents and BSBService
//     });
//   });

//   describe('emitBroadcast', () => {
//     it('should emit an event', async () => {
//       const event = 'testEvent';
//       const args = ['arg1', 'arg2'];

//       await pluginEvents.emitBroadcast(event, ...args);

//       // Here you need to check if the event has been emitted correctly
//       // This depends on your implementation of SBEvents and BSBService
//     });
//   });

//   // Similar tests can be written for onEvent, emitEvent, onEventSpecific, emitEventSpecific
// });
