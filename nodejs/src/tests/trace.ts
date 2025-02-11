import { DTrace } from '../interfaces';

/**
 * @hidden
 */
export function createFakeDTrace(trace?: string, span?: string): DTrace {
  return {
    t: trace ?? '',
    s: span ?? '',
  };
}
