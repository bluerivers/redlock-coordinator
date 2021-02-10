/// <reference types="node" />
import Redlock from 'redlock';
import { EventEmitter } from 'events';

export const RedlockCoordinatorEvent = {
  ELECTED: 'elected',
  RESIGNED: 'resigned',
  ERROR: 'error',
};

export interface CompatibleLogger {
  debug(message?: any, ...optionalParams: any[]): void;
  info(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
}

export interface Options {
  key?: string;
  logger?: CompatibleLogger;
  ttl?: number;
  renew?: number;
  wait?: number;
  redlock?: Redlock.Options;
}

export interface IRedlockCoordinator extends EventEmitter {
  elect: () => Promise<void>;
  isMe: () => boolean;
  renew: () => Promise<void>;
  resign: () => Promise<void>;
}
