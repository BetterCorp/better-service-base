const fs = require('fs');
const path = require('path');
const cwdPackJson = path.join(process.cwd(), './package.json');
let packageJSON = JSON.parse(fs.readFileSync(cwdPackJson).toString());
let args = process.argv;
let version = packageJSON.version;
let buildTag = '';
let outputOnly = false;
let outputPackageName = false;
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
  if (arg.indexOf('--output') >= 0) {
    outputOnly = true;
  }
  if (arg.indexOf('--package') >= 0) {
    outputPackageName = true;
  }
}
let versionSplit = version.split('-');
let versionKeys = versionSplit[0].split('.');
let major = versionKeys[0];
let minor = versionKeys[1];
let tag = '';
if (versionSplit.length > 1) {
  tag = `-${tag}`;
}
if (buildTag != '' && buildTag != 'master') {
  tag = `-${buildTag}`
}
let now = new Date();
let month = `${now.getMonth()}`;
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
let micro = `${now.getFullYear()}${month}${day}${hour}${minutes}${seconds}${tag}`;
packageJSON.version = `${major}.${minor}.${micro}`;
if (outputPackageName) {
  console.log(packageJSON.name.split('/')[1]);
} else if (outputOnly) {
  console.log(packageJSON.version);
} else {
  fs.writeFileSync(cwdPackJson, JSON.stringify(packageJSON));
  console.log(`Package versioned as ${packageJSON.version}`);
}