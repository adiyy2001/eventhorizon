import { type WorkerRequest, type WorkerResponse } from '../../../workers/protocol';
import { TileHandler } from '../../../workers/tile-handler';
import { type RendererClock } from '../cpu-renderer';
import { type WorkerPort } from '../worker-port';

export class ManualClock implements RendererClock {
  time = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  now = (): number => this.time;

  schedule = (callback: () => void, delayMilliseconds: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.timers.set(handle, { at: this.time + delayMilliseconds, callback });
    return handle;
  };

  cancel = (handle: number): void => {
    this.timers.delete(handle);
  };

  get pendingTimers(): number {
    return this.timers.size;
  }

  advance(milliseconds: number): void {
    this.time += milliseconds;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.time)
      .sort(([, first], [, second]) => first.at - second.at);
    due.forEach(([handle, timer]) => {
      this.timers.delete(handle);
      timer.callback();
    });
  }
}

export class LoopbackPort implements WorkerPort {
  readonly queue: WorkerRequest[] = [];
  readonly posted: WorkerRequest[] = [];
  terminated = false;
  private responseListener: (response: WorkerResponse) => void = () => undefined;
  private failureListener: (detail: string) => void = () => undefined;

  constructor(private readonly handler: TileHandler = new TileHandler(() => 0)) {}

  post = (request: WorkerRequest): void => {
    this.queue.push(request);
    this.posted.push(request);
  };

  onResponse = (listener: (response: WorkerResponse) => void): void => {
    this.responseListener = listener;
  };

  onFailure = (listener: (detail: string) => void): void => {
    this.failureListener = listener;
  };

  terminate = (): void => {
    this.terminated = true;
  };

  answerNext(): void {
    const request = this.queue.shift();
    if (request !== undefined) {
      this.responseListener(this.handler.handle(request));
    }
  }

  answerWith(response: WorkerResponse): void {
    this.responseListener(response);
  }

  crash(detail: string): void {
    this.failureListener(detail);
  }
}

export class LoopbackPool {
  readonly ports: LoopbackPort[] = [];

  create = (): WorkerPort => {
    const port = new LoopbackPort();
    this.ports.push(port);
    return port;
  };

  get queued(): number {
    return this.ports.reduce((total, port) => total + port.queue.length, 0);
  }

  get postedCount(): number {
    return this.ports.reduce((total, port) => total + port.posted.length, 0);
  }

  answerAll(): void {
    while (this.queued > 0) {
      this.answerOnePerPort();
    }
  }

  answerOnePerPort(): void {
    this.ports.forEach((port) => {
      port.answerNext();
    });
  }
}
