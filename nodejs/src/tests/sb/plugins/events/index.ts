import { broadcast } from "./broadcast";
import { emit } from "./emit";
import { emitAndReturn } from "./emitAndReturn";
import { emitStreamAndReceiveStream } from "./emitStreamAndReceiveStream";
import {
  BSBEventsRef,
  createFakeDTrace,
} from "../../../../index";
import { getEventsConstructorConfig } from '../../../mocks';

export const RunEventsPluginTests = (
  eventsPlugin: typeof BSBEventsRef,
  config: any = undefined,
) => {
  const trace = createFakeDTrace('test-trace', 'test-span');
  broadcast(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(trace);
    }
    return refP;
  }, 10);
  emit(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(trace);
    }
    return refP;
  }, 10);
  emitAndReturn(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(trace);
    }
    return refP;
  }, 10);
  emitStreamAndReceiveStream(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(trace);
    }
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
};