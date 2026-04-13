/* Minimal Mocha type declarations for compilation */

declare namespace Mocha {
  interface Context {
    timeout(ms: number): this;
    slow(ms: number): this;
    retries(n: number): this;
  }

  interface Suite {
    timeout(ms: number): this;
    slow(ms: number): this;
    retries(n: number): this;
  }
}

declare function describe(name: string, fn: (this: Mocha.Suite) => void | Promise<void>): void;
declare function describe(name: string, fn: () => void | Promise<void>): void;
declare function it(name: string, fn: (this: Mocha.Context) => void | Promise<void>): void;
declare function beforeEach(fn: (this: Mocha.Context) => void | Promise<void>): void;
declare function afterEach(fn: (this: Mocha.Context) => void | Promise<void>): void;
