import { broadcast } from "./broadcast";
import { emit } from "./emit";
import { emitAndReturn } from "./emitAndReturn";
import { emitStreamAndReceiveStream } from "./emitStreamAndReceiveStream";
import {
  BSBEventsConstructor,
  BSBEventsRef,
  PluginLogger,
} from "../../../../base";
import { SBLogging, SmartFunctionCallSync } from "../../../../serviceBase";

export const newSBLogging = () => {
  const sbLogging = new SBLogging(
    "test-app",
    "development",
    process.cwd(),
    {} as any
  );
  for (const logger of (sbLogging as any).loggers) {
    SmartFunctionCallSync(logger, logger.dispose);
  }
  (sbLogging as any).loggers = [];
  return sbLogging;
};
export const generateNullLogging = () => {
  const sbLogging = newSBLogging();
  return new PluginLogger("development", "test-plugin", sbLogging);
};
export const getEventsConstructorConfig = (
  config: any
): BSBEventsConstructor => {
  return {
    appId: "test-app",
    packageCwd: process.cwd(),
    pluginCwd: process.cwd(),
    cwd: process.cwd(),
    mode: "development",
    pluginName: "test-plugin",
    sbLogging: newSBLogging(),
    config: config,
  };
};

export const RunEventsPluginTests = (
  eventsPlugin: typeof BSBEventsRef,
  config: any = undefined
) => {
  broadcast(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emit(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitAndReturn(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitStreamAndReceiveStream(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) await refP.init();
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
};
