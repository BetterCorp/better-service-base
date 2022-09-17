import { ServiceBase } from "./serviceBase/serviceBase";
const runApp = async () => {
  const CWD = process.env.APP_DIR || process.cwd();
  const SB = new ServiceBase(true, false, CWD);
  await SB.setupSelf();
  await SB.setupPlugins(CWD);
  await SB.setupConfig();
  await SB.setupLogger();
  await SB.setupEvents();
  await SB.setupServices();
  SB.dispose(0, "OK")
};
runApp();
