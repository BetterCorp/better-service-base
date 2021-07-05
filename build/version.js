const fs = require('fs');
let packageJSON = JSON.parse(fs.readFileSync('./package.json').toString());
let args = process.argv;
let version = packageJSON.version;
let buildTag = '';
for (let arg of args) {
  if (arg.indexOf('--version=') >= 0) {
    version = arg.split('--version=')[1].trim();
  }
  if (arg.indexOf('--branch=') >= 0) {
    buildTag = arg.split('--branch=')[1].trim().replace(/(?![-])[\W]/g,'');
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
if (buildTag != '') {
  tag = `-${buildTag}`
}
let now = new Date();
let month = now.getMonth();
if (month.length == 1)
  month = `0${month}`
let day = now.getDay();
if (day.length == 1)
  day = `0${day}`
let hour = now.getHours();
if (hour.length == 1)
  hour = `0${hour}`
let minutes = now.getMinutes();
if (minutes.length == 1)
  minutes = `0${minutes}`
let seconds = now.getSeconds();
if (seconds.length == 1)
  seconds = `0${seconds}`
let micro = `${now.getFullYear()}${month}${day}${hour}${minutes}${seconds}${tag}`;
packageJSON.version = `${major}.${minor}.${micro}`;
fs.writeFileSync('./package.json', JSON.stringify(packageJSON));
console.log(`Package versioned as ${packageJSON.version}`);