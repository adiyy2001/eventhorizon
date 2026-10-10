import { defaultSettings } from '../../core/render/settings';
import { type WorkerRequest, type WorkerResponse } from '../../workers/protocol';
import { portForWorker, type WorkerLike } from './worker-port';

const tile = { pass: 0, step: 8, column: 0, row: 0, columns: 16, rows: 16 };

const request: WorkerRequest = {
  type: 'render-tile',
  generation: 1,
  settings: defaultSettings,
  size: { width: 16, height: 16 },
  tile,
};

function fakeWorker() {
  const postMessage = vi.fn<(message: WorkerRequest) => void>();
  const terminate = vi.fn();
  const worker: WorkerLike = {
    postMessage,
    terminate,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
  return { worker, postMessage, terminate };
}

function deliver(worker: WorkerLike, data: unknown): void {
  worker.onmessage?.({ data } as MessageEvent<unknown>);
}

describe('portForWorker', () => {
  it('forwards requests and termination to the worker', () => {
    const { worker, postMessage, terminate } = fakeWorker();
    const port = portForWorker(worker);
    port.post(request);
    expect(postMessage).toHaveBeenCalledWith(request);
    port.terminate();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('hands parsed responses to the listener', () => {
    const { worker } = fakeWorker();
    const port = portForWorker(worker);
    const responses: WorkerResponse[] = [];
    port.onResponse((response) => responses.push(response));
    const done = {
      type: 'tile-done',
      generation: 1,
      tile,
      samples: new Float32Array(3),
      milliseconds: 2,
    };
    deliver(worker, done);
    expect(responses).toEqual([done]);
  });

  it('reports a message it cannot parse as a failure and not as a response', () => {
    const { worker } = fakeWorker();
    const port = portForWorker(worker);
    const responses: WorkerResponse[] = [];
    const failures: string[] = [];
    port.onResponse((response) => responses.push(response));
    port.onFailure((detail) => failures.push(detail));
    deliver(worker, { type: 'tile-done', generation: 'x' });
    expect(responses).toEqual([]);
    expect(failures).toEqual(['the render worker sent a message the page cannot read']);
  });

  it('reports a message error and a script error as failures', () => {
    const { worker } = fakeWorker();
    const port = portForWorker(worker);
    const failures: string[] = [];
    port.onFailure((detail) => failures.push(detail));
    worker.onmessageerror?.({} as MessageEvent<unknown>);
    worker.onerror?.({ message: 'Uncaught SyntaxError' } as ErrorEvent);
    worker.onerror?.({ message: '' } as ErrorEvent);
    expect(failures).toEqual([
      'the render worker sent a message the page cannot read',
      'Uncaught SyntaxError',
      'the render worker stopped without a message',
    ]);
  });

  it('ignores messages that arrive before a listener is set', () => {
    const { worker } = fakeWorker();
    portForWorker(worker);
    expect(() => {
      deliver(worker, { type: 'request-rejected', detail: 'early' });
      worker.onerror?.({ message: 'early' } as ErrorEvent);
    }).not.toThrow();
  });
});
