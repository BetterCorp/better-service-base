declare module "benchmarkify" {
  export interface BenchmarkSuite {
    add(name: string, fn: (done: Function) => void | Promise<void>): BenchmarkSuite;
  }

  export default class Benchmarkify {
    constructor(name: string);
    printHeader(): Benchmarkify;
    createSuite(name: string): BenchmarkSuite;
    run(): Promise<void>;
  }
}
