// THIS FILE IS SUBJECT TO COPYRIGHT FROM THE SOURCE - https://github.com/BetterCorp/Node-Tools.git 
// @bettercorp/tools
import {CleanStringStrength, MergeObjectsKey, SimpleStatu} from "../interfaces";

export class Tools {
  public static readonly regexes = {
    exhard: /(?![A-Za-z0-9])[\W_]/g,
    hard: /(?![,-:~_])[\W]/g,
    soft: /(?![,-:~ +_.@])[\W]/g,
    url: /(?![,-:~ +_.@\/\?=&%])[\W]/g,
    ip: /(?![.0-9:%/])[\W_]/g,
    email: /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/g,
  };

  public static cleanString(objectToClean: any): string;
  public static cleanString(objectToClean: any, maxLimit: number): string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: RegExp,
  ): string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: CleanStringStrength,
  ): string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: RegExp,
      returnNullAndUndefined: true,
  ): undefined | null | string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: RegExp,
      returnNullAndUndefined: false,
  ): string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: CleanStringStrength,
      returnNullAndUndefined: true,
  ): undefined | null | string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: CleanStringStrength,
      returnNullAndUndefined: false,
  ): string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: CleanStringStrength.custom,
      returnNullAndUndefined: true,
      customRegex: RegExp,
  ): undefined | null | string;
  public static cleanString(
      objectToClean: any,
      maxLimit: number,
      strength: CleanStringStrength.custom,
      returnNullAndUndefined: false,
      customRegex: RegExp,
  ): string;
  public static cleanString<T extends boolean = false>(
      objectToClean: any,
      maxLimit: number                       = 255,
      strength: RegExp | CleanStringStrength = CleanStringStrength.hard,
      returnNullAndUndefined: boolean        = false,
      customRegex?: RegExp,
  ): undefined | null | string {
    let regx = Tools.regexes.hard;
    if ((
            strength as RegExp
        ).test !== undefined) {
      regx = strength as RegExp;
    }
    else {
      switch (strength) {
        case CleanStringStrength.exhard:
          regx = Tools.regexes.exhard;
          break;
        case CleanStringStrength.soft:
          regx = Tools.regexes.soft;
          break;
        case CleanStringStrength.url:
          regx = Tools.regexes.url;
          break;
        case CleanStringStrength.ip:
          regx = Tools.regexes.ip;
          break;
        case CleanStringStrength.email:
          regx = Tools.regexes.email;
          break;
        case CleanStringStrength.custom:
          if (Tools.isUndefined(customRegex)) {
            throw "No custom regex provided!";
          }
          regx = customRegex;
          break;
      }
    }
    let data = `${objectToClean}`
        .trim()
        .replace(regx, "")
        .trim()
        .substring(0, maxLimit ?? 255);
    if (data === "undefined") {
      return returnNullAndUndefined === true ? undefined : "";
    }
    if (data === "null") {
      return returnNullAndUndefined === true ? null : "";
    }
    return data;
  }

  public static autoCapitalizeWords(data: string): string {
    const words = data.split(" ");

    for (let i = 0 ; i < words.length ; i++) {
      words[i] = words[i][0].toUpperCase() + words[i].substring(1);
    }

    return words.join(" ");
  }

  static enumKeys<O extends object, K extends keyof O = keyof O>(obj: O): K[] {
    return Object.keys(obj)
                 .filter((k) => Number.isNaN(+k)) as K[];
  }

  private static _flattenObject<T = unknown, TR = object>(obj: T): TR {
    // CREDITS: https://gist.github.com/penguinboy/762197
    let tempA: any = {};
    for (let i in obj) {
      if (Tools.isObject(obj[i]) || Tools.isArray(obj[i])) {
        let tempB = this._flattenObject<unknown, TR>(obj[i]);
        for (let j in tempB) {
          tempA[i + "." + j] = tempB[j];
        }
      }
      else {
        tempA[i] = obj[i];
      }
    }
    return tempA;
  }

  public static flattenObject<T = unknown, TR = object>(obj: T): TR {
    if (!this.isObject(obj)) {
      throw "Not a valid object!";
    }
    return this._flattenObject<T, TR>(obj);
  }

  static hierachialGetAvailibility<T>(
      listOfObjects: Array<T>,
      key: string,
      parentkey: string,
      value: T,
  ): Array<T> {
    let listToReturn = [];
    for (let thisType of listOfObjects as any) {
      if (thisType[key] === value) {
        listToReturn.push(thisType);
      }
      else if (thisType[parentkey] === value) {
        for (let iItem of this.hierachialGetAvailibility(
            listOfObjects,
            key,
            parentkey,
            thisType[key],
        )) {
          listToReturn.push(iItem);
        }
      }
    }
    return listToReturn;
  }

  static decodeBase64Image(dataString: string): any {
    let matches       = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
        response: any = {};

    if (this.isNullOrUndefined(matches) || matches!.length !== 3) {
      return new Error("Invalid input string");
    }

    response.type = matches![1];
    response.data = Buffer.from(matches![2], "base64");

    return response;
  }

  private static GetValueFromObjectBasedOnStringPathSearcher(
      workingObj: any,
      stringToGet: string,
  ): any {
    if (this.isNullOrUndefined(workingObj)) {
      return null;
    }
    if (this.isNullOrUndefined(stringToGet)) {
      return null;
    }
    // new version? requires more tests
    /*return stringToGet
     .replace(/\[([^[\]]*)]/g, ".$1.")
     .split(".")
     .filter((prop) => prop !== "")
     .reduce(
     (prev, next) => (prev instanceof Object ? prev[next] : undefined),
     workingObj
     );*/
    let splitted = stringToGet.split(".", 2);
    if (splitted.length === 1) {
      if (splitted[0] === "*") {
        let data = [];
        for (let iI of Object.keys(workingObj)) {
          if (this.isArray(workingObj[iI])) {
            for (let iX of workingObj[iI]) {
              data.push({
                _GVRef: iI,
                ...(
                    iX as any
                ),
              });
            }
          }
          else {
            data.push({
              _GVRef: iI,
              ...workingObj[iI],
            });
          }
        }
        return data;
      }
      return workingObj[splitted[0]];
    }
    return this.GetValueFromObjectBasedOnStringPath(
        workingObj[splitted[0]],
        stringToGet.replace(splitted[0] + ".", ""),
    );
  }

  public static GetValueFromObjectBasedOnStringPath(
      workingObj: any,
      stringToGet: string,
  ): any {
    if (this.isNullOrUndefined(stringToGet)) {
      return null;
    }

    let finalString = "";
    let splitObj = stringToGet.split(",");
    if (splitObj.length === 1) {
      let retData = this.GetValueFromObjectBasedOnStringPathSearcher(
          workingObj,
          stringToGet,
      );
      return this.isNullOrUndefined(retData)
             ? retData
             : JSON.parse(JSON.stringify(retData));
    }

    for (let val of splitObj) {
      if (this.isNullOrUndefined(stringToGet)) {
        continue;
      }
      let retData = this.GetValueFromObjectBasedOnStringPathSearcher(
          workingObj,
          val,
      );
      let data = this.isNullOrUndefined(retData)
                 ? retData
                 : JSON.parse(JSON.stringify(retData));
      if (this.isUndefined(data)) {
        finalString += val;
      }
      else {
        finalString += data;
      }
    }
    return finalString;
  }

  public static mergeObjects(
      src: any,
      against: any,
      initialMigration: boolean = true,
      referenceKey?: MergeObjectsKey,
  ): any {
    if (!src) {
      return against;
    }
    if (!against) {
      return src;
    }

    if (this.isNullOrUndefined(initialMigration) || initialMigration === true) {
      let clonedObj1 = JSON.parse(JSON.stringify(src));
      let obj2String = JSON.stringify(against);
      let clonedObj2 = JSON.parse(obj2String);
      return this.mergeObjects(clonedObj1, clonedObj2, false);
    }

    if (this.isArray(src) && this.isArray(against)) {
      for (let item of against) {
        src.push(item);
      }
      return src;
    }

    for (let prop of Object.keys(against)) {
      let srcProp = src[prop];
      let againstProp = against[prop];
      if (this.isObject(againstProp) && !this.isNullOrUndefined(srcProp)) {
        src[prop] = this.mergeObjects(srcProp, againstProp, false);
      }
      else {
        src[prop] = againstProp;
      }
    }

    return src;
  }

  public static StringReplaceWithObject(obj: any, str: string): string {
    let strToReplace = str;
    if (strToReplace.indexOf("{") >= 0) {
      let strSplt = strToReplace.split("{");
      let strSplt2 = strSplt[1].split("}");
      let newVal = this.GetValueFromObjectBasedOnStringPath(obj, strSplt2[0]);
      strToReplace =
          strSplt[0] +
          newVal +
          strSplt2.splice(1)
                  .join("}") +
          (
              strSplt.length > 2 ? "{" : ""
          ) +
          strSplt.splice(2)
                 .join("{");
      strToReplace = this.StringReplaceWithObject(obj, strToReplace);
    }
    return strToReplace;
  }

  public static getTimeFromMilliseconds(time: number) {
    if (time < 1000) {
      return `${time} milliseconds`;
    }
    let seconds: number = time / 1000;
    if (seconds < 60) {
      return `${seconds} seconds`;
    }
    const minutes: number = seconds / 60;
    if (minutes < 60) {
      return `${minutes} minutes`;
    }
    const hours: number = minutes / 60;
    if (hours < 60) {
      return `${hours} hours`;
    }
    return `${hours / 24} days`;
  }

  public static delay(time: number = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, time);
    });
  }

  public static async waitDelayThenThrow(
      checkFunc: Function,
      rejectFunc: Function,
      time: number    = 1000,
      timeout: number = 10,
  ): Promise<void> {
    let count = 0;
    const causeTimeout = () => {
      count = timeout + 1;
    };
    while (checkFunc(causeTimeout)) {
      count++;
      if (count > timeout && rejectFunc) {
        rejectFunc("Timeout!");
      }
      if (count > timeout) {
        throw "Timeout!";
      }
      await this.delay(time);
    }
  }

  public static isSimpleType(value: unknown): boolean {
    return (
        Tools.isBoolean(value) || Tools.isNumber(value) || Tools.isString(value)
    );
  }

  public static isString(value: unknown): value is string {
    return typeof value === "string" || value instanceof String;
  }

  public static isDate(value: unknown, matchString = true): value is Date {
    return value instanceof Date; /*
     ? true
     : matchString
     ? this.dateTimeRegex.test(`${value}`)
     : false*/
  }

  public static isArray<T = unknown>(value: unknown): value is Array<T> {
    return (
        !Tools.isNullOrUndefined(value) &&
        Tools.TypeofObjectConstructor<Array<T>>(value, "array") &&
        !Tools.isNullOrUndefined(value.length)
    );
  }

  public static isFunction(value: any): value is Function {
    return typeof value === "function";
  }

  public static isSymbol(value: any): value is symbol {
    return typeof value === "symbol";
  }

  public static isNumber(value: any): value is number {
    return typeof value === "number" && !isNaN(value);
  }

  public static isStringNumber(value: any): SimpleStatu<number> {
    if (Tools.isNumber(value)) {
      return {status: true, value: value};
    }
    try {
      const valueAsString = `${value}`;
      if (valueAsString.split(".").length > 2) {
        return {status: false};
      }
      if (valueAsString.split(",").length > 2) {
        return {status: false};
      }
      if (!/^[0-9 ,.\-]{1,}$/g.test(valueAsString)) {
        return {status: false};
      }
      let nValue = Number.parseFloat(valueAsString);
      if (Tools.isNumber(nValue)) {
        return {status: true, value: nValue};
      }
    }
    catch (EIgnore) {
    }
    return {status: false};
  }

  public static isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
  }

  public static isUndefined(value: unknown): value is undefined {
    return typeof value === "undefined";
  }

  public static isNull(value: unknown): value is null {
    if (value === null) {
      return true;
    }
    return false;
  }

  public static isObject(value: unknown): value is Object {
    return Tools.TypeofObjectConstructor<Object>(value, "object");
  }

  public static TypeofObjectConstructor<TR = unknown>(
      value: unknown,
      type: "array" | "object",
  ): value is TR {
    if (Tools.isNullOrUndefined(value)) {
      return false;
    }
    if (type === "array") {
      return typeof value === "object" && value!.constructor === Array;
    }
    if (type === "object") {
      return typeof value === "object" && value!.constructor === Object;
    }
    return false;
  }

  public static isPlainObject(value: unknown): value is Record<string, any> {
    return Tools.isObject(value);
  }

  public static isNullOrUndefined(value: unknown): value is null | undefined {
    if (Tools.isUndefined(value)) {
      return true;
    }
    if (Tools.isNull(value)) {
      return true;
    }
    return false;
  }

  public static genRandomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (
        +max - +min
    )) + +min;
  }

  public static clampNumber(min: number, max: number, value: number) {
    if (min > max) {
      throw new Error("min cannot be greater than max");
    }
    return value < min ? min : value > max ? max : value;
  }

  public static async sleep(milliseconds: number = 1000): Promise<void> {
    await new Promise((r) => setTimeout(r, milliseconds));
  }

  public static arrays = {
    mapAsync: async <Input = any, Output = any>(
        arr: Array<Input>,
        asyncCallback: { (item: Input): Promise<Output> },
    ): Promise<Array<Output>> => {
      return await Promise.all(
          arr.map(async (item: Input): Promise<Output> => {
            return await asyncCallback(item);
          }),
      );
    },
    groupListBy: <T = any>(
        groupFunc: { (object: T): string },
        list: Array<T>,
    ): Record<string, Array<T>> => {
      return list.reduce(
          (prev: any, next: any) => (
              {
                ...prev,
                [groupFunc(next)]: [
                  ...(
                      prev[groupFunc(next)] || []
                  ),
                  next,
                ],
              }
          ),
          {},
      );
    },
    collectListBy: <T = any>(
        groupFunc: { (object: T): string },
        list: Array<T>,
    ): Array<Array<T>> => {
      return Object.values(Tools.arrays.groupListBy(groupFunc, list));
    },
    /* Get the first item in the array */
    head: <T = any>(list: Array<T>): T | undefined => {
      return list[0];
    },
    /* Get the last item in the array */
    tail: <T = any>(list: Array<T>): T | undefined => {
      return list[list.length - 1];
    },
  };
}
