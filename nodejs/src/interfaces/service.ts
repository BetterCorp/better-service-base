export interface ServiceEventsBase {
  [key: string]: (...args: any[]) => Promise<any> | any;
}
export interface ServiceEventsDefault {
  [key: string]: () => never;
}
