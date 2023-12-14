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
