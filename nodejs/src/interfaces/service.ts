export interface ServiceEventsBase {
  [key: string]: (...args: any[]) => Promise<any> | any;
}

export interface ServiceEventsCallableBase {
  [key: string]: (traceId: string, ...args: any[]) => Promise<any> | any;
}
export interface ServiceEventsDefault {
  [key: string]: () => never;
}
