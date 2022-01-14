module.exports = (pkBase) => {
  const fs = require('fs');
  const path = require('path');
  const cwdPackJson = path.join(process.cwd(), './package.json');
  const cwdPackLockJson = path.join(process.cwd(), './package-lock.json');

  let packageJSON = JSON.parse(fs.readFileSync(cwdPackJson).toString());
  let packageLockJSON = null;
  if (fs.existsSync(cwdPackLockJson)) {
    packageLockJSON = JSON.parse(fs.readFileSync(cwdPackLockJson).toString());
  }
  let args = process.argv;
  let version = packageJSON.version;
  let buildTag = '';
  for (let arg of args) {
    //console.log(`FARG: ${arg}`)
    if (arg.indexOf('--version=') >= 0) {
      version = arg.split('--version=')[1].trim();
      //console.log(`-FARG: ${arg} = '${version}'`)
    }
    if (arg.indexOf('--branch=') >= 0) {
      buildTag = arg.split('--branch=')[1].trim().replace(/(?![-])[\W]/g, '');
      //console.log(`-FARG: ${arg} = '${buildTag}'`)
    }
  }
  let versionSplit = version.split('-');
  let versionKeys = versionSplit[0].split('.');
  let major = versionKeys[0];
  let minor = versionKeys[1];
  let tag = '';
  let packageTag = 'latest';
  if (versionSplit.length > 1) {
    tag = `-${tag}`;
    packageTag = tag;
  }
  if (buildTag != '' && buildTag != 'master') {
    tag = `-${buildTag}`
    packageTag = buildTag;
  }
  let now = new Date();
  let month = `${now.getMonth()+1}`;
  if (month.length == 1)
    month = `0${month}`
  let day = `${now.getDate()}`;
  if (day.length == 1)
    day = `0${day}`
  let hour = `${now.getHours()}`;
  if (hour.length == 1)
    hour = `0${hour}`
  let minutes = `${now.getMinutes()}`;
  if (minutes.length == 1)
    minutes = `0${minutes}`
  let seconds = `${now.getSeconds()}`;
  if (seconds.length == 1)
    seconds = `0${seconds}`
  let micro = `${now.getFullYear()}${month}${day}${hour}${minutes}${seconds}`;
  packageJSON.version = `${major}.${minor}.${micro}${tag}`;
  if (packageLockJSON !== null) {
    packageLockJSON.version = packageJSON.version;
  }

  if (pkBase !== false) {
    let exportsVars = [];
    const exportsDir = path.join(process.cwd(), './_exports');
    if (!fs.existsSync(exportsDir))
      fs.mkdirSync(exportsDir);
    exportsVars.push(`PACKAGE_VERSION=${packageJSON.version}`);
    console.log(`CWD:E: ${exportsDir}`);
    exportsVars.push(`PACKAGE_TAG=${packageTag}`);
    exportsVars.push(`PACKAGE_NAME=${packageJSON.name.replace(pkBase, '')}`);
    let bsbVersion = null;
    if (packageJSON.name === "@bettercorp/service-base") {
      bsbVersion = packageJSON.version;
    } else {
      bsbVersion = packageJSON.dependencies["@bettercorp/service-base"].substring(1);
    }
    let bsbVTag = bsbVersion.split('-');
    exportsVars.push(`BSB_FULL_VERSION=${bsbVersion}`);
    exportsVars.push(`BSB_VERSION=${bsbVTag[0]}`);
    let isNotLatest = bsbVTag.length > 1;
    exportsVars.push(`BSB_TAG=${isNotLatest ? bsbVTag[1] : ''}`);
    exportsVars.push(`BSB_TAGN=${isNotLatest ? bsbVTag[1] : 'latest'}`);
    exportsVars.push(`BSB_DTAG=${isNotLatest ? '-' + bsbVTag[1] : ''}`);
    exportsVars.push(`BSB_DTAGN=${isNotLatest ? '-' + bsbVTag[1] : '-latest'}`);
    if (packageJSON.name.indexOf(pkBase) >= 0) {
      exportsVars.push(`RUN_DOCKER=true`)
    }
    for (let varEx of exportsVars) {
      console.log(`EXPORT [${varEx}]`);
      let varEXpl = varEx.split('=');
      fs.writeFileSync(path.join(exportsDir, varEXpl[0]), varEXpl[1]);
    }
    fs.writeFileSync(path.join(exportsDir, './.env'), exportsVars.join('\n'));
  }
  fs.writeFileSync(cwdPackJson, JSON.stringify(packageJSON));
  if (packageLockJSON !== null)
    fs.writeFileSync(cwdPackLockJson, JSON.stringify(packageLockJSON));
  console.log(`Package versioned as ${packageJSON.version}`);
};