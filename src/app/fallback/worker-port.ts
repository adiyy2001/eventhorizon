import { InjectionToken } from '@angular/core';
import {
  parseWorkerResponse,
  type WorkerRequest,
  type WorkerResponse,
} from '../../workers/protocol';

export interface WorkerPort {
  post: (request: WorkerRequest) => void;
  onResponse: (listener: (response: WorkerResponse) => void) => void;
  onFailure: (listener: (detail: string) => void) => void;
  terminate: () => void;
}

export type WorkerPortFactory = () => WorkerPort;

export interface WorkerLike {
  postMessage: (message: WorkerRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}

export const CPU_WORKER_PORTS = new InjectionToken<WorkerPortFactory>('CPU_WORKER_PORTS');

const unreadableMessage = 'the render worker sent a message the page cannot read';
const unknownWorkerError = 'the render worker stopped without a message';

export function portForWorker(worker: WorkerLike): WorkerPort {
  let responseListener: (response: WorkerResponse) => void = () => undefined;
  let failureListener: (detail: string) => void = () => undefined;

  worker.onmessage = (event) => {
    const response = parseWorkerResponse(event.data);
    if (response === null) {
      failureListener(unreadableMessage);
    } else {
      responseListener(response);
    }
  };
  worker.onmessageerror = () => {
    failureListener(unreadableMessage);
  };
  worker.onerror = (event) => {
    failureListener(event.message === '' ? unknownWorkerError : event.message);
  };

  return {
    post: (request) => {
      worker.postMessage(request);
    },
    onResponse: (listener) => {
      responseListener = listener;
    },
    onFailure: (listener) => {
      failureListener = listener;
    },
    terminate: () => {
      worker.terminate();
    },
  };
}
