// THIS FILE IS SUBJECT TO COPYRIGHT FROM THE SOURCE - https://github.com/BetterCorp/Node-Tools.git 
// @bettercorp/tools
import {CleanStringStrength, MergeObjectsKey, SimpleStatu} from "../interfaces";

/**
 * Just a bunch of utility functions - some are used within the framework, others are just general purpose.
 * You can use any of these functions instead of writing your own or importing from an additional library.
 * 
 * This class only has static methods, so don't going creating instances of it.
 * 
 * If you want to use it, like for isNullOrUndefined, you can just call it directly on the class: `Tools.isNullOrUndefined(value)`.
 * @category Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html | API: Tools}
 */
export class Tools {
  /**
   * @hidden
   */
  constructor() {
    throw new Error("This class is not meant to be instantiated");
  }

  /**
   * Predefined regular expressions for common string cleaning operations.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#regexes | API: Tools#regexes}
   */
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
  /**
   * Clean and sanitize a string by removing unwanted characters based on specified strength.
   * @param objectToClean - The object/string to clean
   * @param maxLimit - Maximum character limit (default: 255)
   * @param strength - Cleaning strength or custom regex (default: CleanStringStrength.hard)
   * @param returnNullAndUndefined - Whether to return null/undefined for those values (default: false)
   * @param customRegex - Custom regex when using CleanStringStrength.custom
   * @returns The cleaned string, or null/undefined if returnNullAndUndefined is true
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#cleanString | API: Tools#cleanString}
   */
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

  /**
   * Automatically capitalize the first letter of each word in a string.
   * @param data - The string to capitalize
   * @returns The string with each word capitalized
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#autoCapitalizeWords | API: Tools#autoCapitalizeWords}
   */
  public static autoCapitalizeWords(data: string): string {
    const words = data.split(" ");

    for (let i = 0 ; i < words.length ; i++) {
      words[i] = words[i][0].toUpperCase() + words[i].substring(1);
    }

    return words.join(" ");
  }

  /**
   * Get the string keys from an enum object, filtering out numeric keys.
   * @param obj - The enum object
   * @returns Array of string keys
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#enumKeys | API: Tools#enumKeys}
   */
  static enumKeys<O extends object, K extends keyof O = keyof O>(obj: O): K[] {
    return Object.keys(obj)
                 .filter((k) => Number.isNaN(+k)) as K[];
  }

  /**
   * @hidden
   */
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

  /**
   * Flatten a nested object into a single level with dot notation keys.
   * @param obj - The object to flatten
   * @returns The flattened object
   * @throws Error if the input is not a valid object
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#flattenObject | API: Tools#flattenObject}
   */
  public static flattenObject<T = unknown, TR = object>(obj: T): TR {
    if (!this.isObject(obj)) {
      throw "Not a valid object!";
    }
    return this._flattenObject<T, TR>(obj);
  }

  /**
   * Get hierarchical availability of objects based on key-parent relationships.
   * @param listOfObjects - Array of objects to search through
   * @param key - The key property name
   * @param parentkey - The parent key property name
   * @param value - The value to match against
   * @returns Array of matching objects including hierarchical children
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#hierachialGetAvailibility | API: Tools#hierachialGetAvailibility}
   */
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

  /**
   * Decode a base64 data URL string and extract the image type and data.
   * @param dataString - Base64 data URL string (e.g., "data:image/png;base64,...")
   * @returns Object with type and data properties, or Error if invalid
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#decodeBase64Image | API: Tools#decodeBase64Image}
   */
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

  /**
   * Get a value from a nested object using a string path (e.g., "user.profile.name").
   * Supports comma-separated paths for concatenation and "*" wildcard for all properties.
   * @param workingObj - The object to search in
   * @param stringToGet - Dot-notation path string or comma-separated paths
   * @returns The value at the specified path, or null if not found
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#GetValueFromObjectBasedOnStringPath | API: Tools#GetValueFromObjectBasedOnStringPath}
   */
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

  /**
   * Merge two objects deeply, with the second object taking precedence.
   * @param src - Source object to merge into
   * @param against - Object to merge from (takes precedence)
   * @param initialMigration - Whether to clone objects before merging (default: true)
   * @param referenceKey - Optional reference key for merge operations
   * @returns The merged object
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#mergeObjects | API: Tools#mergeObjects}
   */
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

  /**
   * Replace placeholders in a string with values from an object using {key} syntax.
   * @param obj - Object containing replacement values
   * @param str - String with placeholders (e.g., "Hello {name}")
   * @returns String with placeholders replaced by object values
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#StringReplaceWithObject | API: Tools#StringReplaceWithObject}
   */
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

  /**
   * Convert milliseconds to a human-readable time string.
   * @param time - Time in milliseconds
   * @returns Human-readable time string (e.g., "5 minutes", "2 hours")
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#getTimeFromMilliseconds | API: Tools#getTimeFromMilliseconds}
   */
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

  /**
   * Create a delay/sleep for the specified number of milliseconds.
   * @param time - Time to delay in milliseconds (default: 1000)
   * @returns Promise that resolves after the specified time
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#delay | API: Tools#delay}
   */
  public static delay(time: number = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, time);
    });
  }

  /**
   * Wait with delays while checking a condition, throwing an error on timeout.
   * @param checkFunc - Function that returns true while waiting should continue
   * @param rejectFunc - Function to call on timeout (before throwing)
   * @param time - Delay between checks in milliseconds (default: 1000)
   * @param timeout - Maximum number of check attempts (default: 10)
   * @throws "Timeout!" when the timeout is exceeded
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#waitDelayThenThrow | API: Tools#waitDelayThenThrow}
   */
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

  /**
   * Check if a value is a simple primitive type (string, number, or boolean).
   * @param value - The value to check
   * @returns True if the value is a string, number, or boolean
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isSimpleType | API: Tools#isSimpleType}
   */
  public static isSimpleType(value: unknown): boolean {
    return (
        Tools.isBoolean(value) || Tools.isNumber(value) || Tools.isString(value)
    );
  }

  /**
   * Type guard to check if a value is a string.
   * @param value - The value to check
   * @returns True if the value is a string
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isString | API: Tools#isString}
   */
  public static isString(value: unknown): value is string {
    return typeof value === "string" || value instanceof String;
  }

  /**
   * Type guard to check if a value is a Date object.
   * @param value - The value to check
   * @param matchString - Currently unused parameter for potential string date matching
   * @returns True if the value is a Date instance
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isDate | API: Tools#isDate}
   */
  public static isDate(value: unknown, matchString = true): value is Date {
    return value instanceof Date; /*
     ? true
     : matchString
     ? this.dateTimeRegex.test(`${value}`)
     : false*/
  }

  /**
   * Type guard to check if a value is an array.
   * @param value - The value to check
   * @returns True if the value is an array
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isArray | API: Tools#isArray}
   */
  public static isArray<T = unknown>(value: unknown): value is Array<T> {
    return (
        !Tools.isNullOrUndefined(value) &&
        Tools.TypeofObjectConstructor<Array<T>>(value, "array") &&
        !Tools.isNullOrUndefined(value.length)
    );
  }

  /**
   * Type guard to check if a value is a function.
   * @param value - The value to check
   * @returns True if the value is a function
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isFunction | API: Tools#isFunction}
   */
  public static isFunction(value: any): value is Function {
    return typeof value === "function";
  }

  /**
   * Type guard to check if a value is a symbol.
   * @param value - The value to check
   * @returns True if the value is a symbol
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isSymbol | API: Tools#isSymbol}
   */
  public static isSymbol(value: any): value is symbol {
    return typeof value === "symbol";
  }

  /**
   * Type guard to check if a value is a valid number (not NaN).
   * @param value - The value to check
   * @returns True if the value is a number and not NaN
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isNumber | API: Tools#isNumber}
   */
  public static isNumber(value: any): value is number {
    return typeof value === "number" && !isNaN(value);
  }

  /**
   * Check if a value can be parsed as a valid number and return the parsed result.
   * @param value - The value to check and parse
   * @returns Object with status (true if valid) and value (the parsed number)
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isStringNumber | API: Tools#isStringNumber}
   */
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

  /**
   * Type guard to check if a value is a boolean.
   * @param value - The value to check
   * @returns True if the value is a boolean
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isBoolean | API: Tools#isBoolean}
   */
  public static isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
  }

  /**
   * Type guard to check if a value is undefined.
   * @param value - The value to check
   * @returns True if the value is undefined
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isUndefined | API: Tools#isUndefined}
   */
  public static isUndefined(value: unknown): value is undefined {
    return typeof value === "undefined";
  }

  /**
   * Type guard to check if a value is null.
   * @param value - The value to check
   * @returns True if the value is null
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isNull | API: Tools#isNull}
   */
  public static isNull(value: unknown): value is null {
    if (value === null) {
      return true;
    }
    return false;
  }

  /**
   * Type guard to check if a value is a plain object (not array, null, etc.).
   * @param value - The value to check
   * @returns True if the value is a plain object
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isObject | API: Tools#isObject}
   */
  public static isObject(value: unknown): value is Object {
    return Tools.TypeofObjectConstructor<Object>(value, "object");
  }

  /**
   * Type guard to check object constructor type (array or object).
   * @param value - The value to check
   * @param type - The type to check for ("array" or "object")
   * @returns True if the value matches the specified constructor type
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#TypeofObjectConstructor | API: Tools#TypeofObjectConstructor}
   */
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

  /**
   * Type guard to check if a value is a plain object with string keys.
   * @param value - The value to check
   * @returns True if the value is a plain object
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isPlainObject | API: Tools#isPlainObject}
   */
  public static isPlainObject(value: unknown): value is Record<string, any> {
    return Tools.isObject(value);
  }

  /**
   * Type guard to check if a value is null or undefined.
   * @param value - The value to check
   * @returns True if the value is null or undefined
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#isNullOrUndefined | API: Tools#isNullOrUndefined}
   */
  public static isNullOrUndefined(value: unknown): value is null | undefined {
    if (Tools.isUndefined(value)) {
      return true;
    }
    if (Tools.isNull(value)) {
      return true;
    }
    return false;
  }

  /**
   * Generate a random integer between min and max (inclusive).
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @returns Random integer between min and max
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#genRandomNumber | API: Tools#genRandomNumber}
   */
  public static genRandomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (
        +max - +min
    )) + +min;
  }

  /**
   * Clamp a number between a minimum and maximum value.
   * @param min - Minimum allowed value
   * @param max - Maximum allowed value
   * @param value - Value to clamp
   * @returns The clamped value
   * @throws Error if min is greater than max
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#clampNumber | API: Tools#clampNumber}
   */
  public static clampNumber(min: number, max: number, value: number) {
    if (min > max) {
      throw new Error("min cannot be greater than max");
    }
    return value < min ? min : value > max ? max : value;
  }

  /**
   * Sleep/delay execution for the specified number of milliseconds.
   * @param milliseconds - Time to sleep in milliseconds (default: 1000)
   * @returns Promise that resolves after the specified time
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#sleep | API: Tools#sleep}
   */
  public static async sleep(milliseconds: number = 1000): Promise<void> {
    await new Promise((r) => setTimeout(r, milliseconds));
  }

  /**
   * Collection of utility functions for working with arrays.
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#arrays | API: Tools#arrays}
   */
  public static arrays = {
    /**
     * Asynchronously map over an array with async callback functions.
     * @param arr - The array to map over
     * @param asyncCallback - Async function to call for each item
     * @returns Promise resolving to the mapped array
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#arrays | API: Tools#arrays}
     */
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
    /**
     * Group array items by a key generated from a function.
     * @param groupFunc - Function that returns a string key for grouping
     * @param list - Array to group
     * @returns Object with keys as group names and values as arrays of grouped items
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#arrays | API: Tools#arrays}
     */
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
    /**
     * Collect array items into groups using a grouping function, returning only the grouped arrays.
     * @param groupFunc - Function that returns a string key for grouping
     * @param list - Array to collect
     * @returns Array of arrays where each sub-array contains grouped items
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#arrays | API: Tools#arrays}
     */
    collectListBy: <T = any>(
        groupFunc: { (object: T): string },
        list: Array<T>,
    ): Array<Array<T>> => {
      return Object.values(Tools.arrays.groupListBy(groupFunc, list));
    },
    /**
     * Get the first item in the array.
     * @param list - The array to get the first item from
     * @returns The first item or undefined if array is empty
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#arrays | API: Tools#arrays}
     */
    head: <T = any>(list: Array<T>): T | undefined => {
      return list[0];
    },
    /**
     * Get the last item in the array.
     * @param list - The array to get the last item from
     * @returns The last item or undefined if array is empty
     * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Tools.html#arrays | API: Tools#arrays}
     */
    tail: <T = any>(list: Array<T>): T | undefined => {
      return list[list.length - 1];
    },
  };
}
