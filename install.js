const FS = require( 'fs' );
const PATH = require( 'path' );
let CWD = process.cwd();

console.log(`Install CWD: ${CWD}`)

if ( CWD.indexOf( '@bettercorp' ) >= 0 ) {
  CWD = PATH.join( CWD, '../../../' );
}

console.log( `INSTALL SCRIPT FOR @bettercorp/service-base in ${CWD}` );

const packaggeJSONFile = PATH.join( CWD, './package.json' );
if ( FS.existsSync( packaggeJSONFile ) )
  if ( JSON.parse( FS.readFileSync( packaggeJSONFile ).toString() ).name.indexOf( '@bettercorp/service-base' ) === 0 )
    return console.log( 'Self install. ignoring install script.' );

const configFile = PATH.join( CWD, './sec.config.json' );
if ( !FS.existsSync( configFile ) ) {
  console.log( `Creating config file... (${configFile})` );
  FS.writeFileSync( configFile, '{"enabledPlugins": []}' );
}

const srcDir = PATH.join( CWD, './src' );
if ( !FS.existsSync( srcDir ) ) {
  console.log( `Creating SRC dir... (${srcDir})` );
  FS.mkdirSync( srcDir );
}

const isTS = FS.existsSync( PATH.join( CWD, './tsconfig.json' ) );

const srcIndex = PATH.join( CWD, `./src/index.${isTS ? 'ts' : 'js'}` );
if ( !FS.existsSync( srcIndex ) ) {
  console.log( `Creating Main index file... (${srcIndex})` );
  FS.writeFileSync( srcIndex, isTS ?
    "import ServiceBase from '@bettercorp/service-base';\n\n"+
    "const SB = new ServiceBase();\n"+
    "SB.init();\n"+
    "SB.run();" :
    'const ServiceBase = require("@bettercorp/service-base");\n\n'+
    "const SB = new (ServiceBase.default || ServiceBase)();\n"+
    "SB.init();\n"+
    "SB.run();" );
}

const pluginsDir = PATH.join( CWD, `./src/plugins` );
if ( !FS.existsSync( pluginsDir ) ) {
  console.log( `Creating plugins dir... (${pluginsDir})` );
  FS.mkdirSync( pluginsDir );
}

console.log( 'INSTALL COMPLETE FOR @bettercorp/service-base' );

console.log( 'PERFORMING PLUGIN INSTALL WITH IN-BUILT PLUGINS' );
require('./install-plugin');