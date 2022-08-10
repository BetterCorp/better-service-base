const fs = require("fs");

exports.convert = (file, generatedFile) => {
  if (!fs.existsSync(file)) return null;
  let lines = fs
    .readFileSync(file)
    .toString()
    .split("\n")
    .map((x) => x.trim());

  let indexStartForName = -1;
  let indexEndForName = -1;
  for (let index = 0; index < lines.length; index++) {
    if (indexStartForName !== -1) {
      if (lines[index].indexOf("=>") >= 0) {
        indexEndForName = index;
        break;
      }
      continue;
    }
    if (lines[index].indexOf(`export default`) === 0) {
      indexStartForName = index;
      if (lines[index].indexOf("=>") >= 0) {
        indexEndForName = index;
        break;
      }
    }
  }

  let interfaceName = lines[indexEndForName]
    .split("):")[1]
    .split("=>")[0]
    .trim();

  const getDefinitions = (interfaceName) => {
    let indexStartForDef = -1;
    let indexEndForDef = -1;
    for (let index = 0; index < lines.length; index++) {
      if (indexStartForDef !== -1) {
        if (lines[index] === "}") {
          indexEndForDef = index - 1;
          break;
        }
        continue;
      }
      if (lines[index].indexOf(`export interface ${interfaceName} {`) === 0) {
        indexStartForDef = index + 1;
      }
    }

    let definitions = {};
    for (let index = indexStartForDef; index <= indexEndForDef; index++) {
      let mainDef = lines[index].split(";", 2);
      let propDef = mainDef[0].trim().split(":", 2);
      let propName = propDef[0].trim();
      let required = true;
      if (propName[propName.length - 1] === "?") {
        required = false;
        propName = propName.substring(0, propName.length - 1);
      }
      definitions[propName] = {
        type: propDef[1].trim(),
        required,
        name: null,
        description: null,
      };
      let attrDef = mainDef[1].trim();
      if (attrDef.indexOf("//") === 0) {
        attrDef = attrDef.substring(2).trim().split(":", 2);
        definitions[propName].name = attrDef[0].trim();
        if (attrDef.length > 1)
          definitions[propName].description = attrDef[1].trim();
      }
    }

    return definitions;
  };

  let definitions = getDefinitions(interfaceName);
  let extraDefinitions = {};
  for (let deff of Object.keys(definitions)) {
    let knownTypes = [
      "boolean",
      "number",
      "string",
      "any",
      "null",
      "undefined",
    ];
    if (knownTypes.indexOf(definitions[deff].type) >= 0) continue;
    let typeToFind = null;
    if (definitions[deff].type.indexOf("Array<") === 0) {
      let iType = definitions[deff].type.split("<")[1].split(">")[0].trim();
      if (knownTypes.indexOf(iType) >= 0) continue;
      typeToFind = iType;
    } else {
      typeToFind = definitions[deff].type;
    }
    extraDefinitions[typeToFind] = getDefinitions(typeToFind);
  }

  return {
    interfaceName,
    definitions,
    extraDefinitions,
    defaultValues: require(generatedFile).default(),
  };
};
