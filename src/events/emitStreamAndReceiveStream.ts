import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { CEvents } from '../interfaces/events';

export default class emitAndReturn extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 1000;
  private uSelf: CEvents;

  constructor(uSelf: CEvents) {
    super();
    this.uSelf = uSelf;
  }

  receiveStream(callerPluginName: string, pluginName: string, event: string, listener: { (error: Error | null, stream: Readable): void; }): Promise<string> {
    const streamId = randomUUID();
    const streamRefId = `${ pluginName || callerPluginName }-${ event }-${ streamId }`;
    this.uSelf.log.info(`SR: ${ callerPluginName } listening to ${ pluginName || '_self' }-${ event }-${ streamId }`);
    const self = this;
    return new Promise((resolve) => {
      let receiptTimeoutHandler: NodeJS.Timeout = setTimeout(() => {
        const err = new Error('Receive Receipt Timeout');
        listener(err, null!);
        self.emit(`${ streamRefId }-error`, err);
        self.removeAllListeners(streamRefId);
      }, self.staticCommsTimeout);
      self.once(streamRefId, (stream: Readable): void => {
        clearTimeout(receiptTimeoutHandler);
        self.emit(`${ streamRefId }-emit`);
        stream.on('error', (e) => {
          self.emit(`${ streamRefId }-error`, e);
        });
        stream.on('end', () => {
          self.emit(`${ streamRefId }-end`);
        });
        listener(null, stream);
      });
      resolve(streamId);
    });
  }

  sendStream(callerPluginName: string, pluginName: string, event: string, streamId: string, stream: Readable, timeout = 60): Promise<void> {
    const self = this;
    const streamRefId = `${ pluginName || callerPluginName }-${ event }-${ streamId }`;
    this.uSelf.log.info(`SS: ${ callerPluginName } emitting ${ pluginName || '_self' }-${ event }-${ streamId }`);
    return new Promise((resolve, rejectI) => {
      const clearSessions = (e?: Error) => {
        stream.destroy(e);
        if (receiptTimeoutHandler !== null)
          clearTimeout(receiptTimeoutHandler);
        receiptTimeoutHandler = null;
        clearTimeout(timeoutHandler);
        self.removeAllListeners(`${ streamRefId }-emit`);
        self.removeAllListeners(`${ streamRefId }-end`);
        self.removeAllListeners(`${ streamRefId }-error`);
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
      self.once(`${ streamRefId }-emit`, () => {
        if (receiptTimeoutHandler !== null)
          clearTimeout(receiptTimeoutHandler);
        receiptTimeoutHandler = null;
      });
      self.once(`${ streamRefId }-end`, () => {
        clearSessions();
        resolve();
      });
      self.once(`${ streamRefId }-error`, (e: Error) => reject(e));
      self.emit(streamRefId, stream);
    });
  }
}