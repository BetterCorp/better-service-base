import ServiceBase from "./ServiceBase";
const runApp = async () => {
  const CWD = process.env.APP_DIR || process.cwd();
  const SB = new ServiceBase(CWD);
  await SB.config();
  await SB.construct();
  await SB.init();
  await SB.run();
};
runApp();