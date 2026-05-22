'use client';

import { EventEmitter } from 'events';
import { type FirestorePermissionError } from './errors';

type ErrorEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

// A simple, type-safe event emitter for handling specific error types.
// We are using the 'events' package, which is a Node.js core module polyfilled by Next.js for the client.
class TypedEventEmitter<T extends Record<string, (...args: any[]) => void>> {
  private emitter = new EventEmitter();

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    return this.emitter.emit(event as string | symbol, ...args);
  }

  on<K extends keyof T>(event: K, listener: T[K]): this {
    this.emitter.on(event as string | symbol, listener);
    return this;
  }
}

export const errorEmitter = new TypedEventEmitter<ErrorEvents>();
