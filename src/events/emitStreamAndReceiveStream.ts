import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { CEvents } from '../interfaces/events';

export default class emitStreamAndReceiveStream extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 1000;
  private uSelf: CEvents;

  constructor(uSelf: CEvents) {
    super();
    this.uSelf = uSelf;
  }

  receiveStream(callerPluginName: string, listener: { (error: Error | null, stream: Readable): void; }, timeoutSeconds: number = 60): Promise<string> {
    const streamId = `${ randomUUID() }=${ timeoutSeconds }`;
    this.uSelf.log.info(`SR: ${ callerPluginName } listening to ${ streamId }`);
    const self = this;
    return new Promise((resolve) => {
      let receiptTimeoutHandler: NodeJS.Timeout = setTimeout(() => {
        const err = new Error('Receive Receipt Timeout');
        listener(err, null!);
        self.emit(`${ streamId }-error`, err);
        self.removeAllListeners(streamId);
      }, self.staticCommsTimeout);
      self.once(streamId, (stream: Readable): void => {
        clearTimeout(receiptTimeoutHandler);
        self.emit(`${ streamId }-emit`);
        stream.on('error', (e) => {
          self.emit(`${ streamId }-error`, e);
        });
        stream.on('end', () => {
          self.emit(`${ streamId }-end`);
        });
        listener(null, stream);
      });
      resolve(streamId);
    });
  }

  sendStream(callerPluginName: string, streamId: string, stream: Readable): Promise<void> {
    const self = this;
    this.uSelf.log.info(`SS: ${ callerPluginName } emitting ${ '_self' }-${ streamId }`);
    return new Promise((resolve, rejectI) => {
      const timeout = Number.parseInt(streamId.split('=')[1]);
      const clearSessions = (e?: Error) => {
        stream.destroy(e);
        if (receiptTimeoutHandler !== null)
          clearTimeout(receiptTimeoutHandler);
        receiptTimeoutHandler = null;
        clearTimeout(timeoutHandler);
        self.removeAllListeners(`${ streamId }-emit`);
        self.removeAllListeners(`${ streamId }-end`);
        self.removeAllListeners(`${ streamId }-error`);
      };
      const reject = (e: Error) => {
        clearSessions(e);
        rejectI(e);
      };
      let receiptTimeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
        reject(new Error('Send Receipt Timeout'));
      }, self.staticCommsTimeout);
      let timeoutHandler = setTimeout(() => {
        reject(new Error('Stream Timeout'));
      }, timeout * 1000);
      self.once(`${ streamId }-emit`, () => {
        if (receiptTimeoutHandler !== null)
          clearTimeout(receiptTimeoutHandler);
        receiptTimeoutHandler = null;
      });
      self.once(`${ streamId }-end`, () => {
        clearSessions();
        resolve();
      });
      self.once(`${ streamId }-error`, (e: Error) => reject(e));
      self.emit(streamId, stream);
    });
  }
}