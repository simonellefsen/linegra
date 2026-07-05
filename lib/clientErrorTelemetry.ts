// Roadmap V2 — capture window.onerror / unhandledrejection / ErrorBoundary crashes.

import { hashClientErrorStack } from './clientErrorHash';
import { isSupabaseConfigured, supabase } from './supabase';

export type ClientErrorKind = 'error' | 'rejection' | 'boundary';

export interface RecordClientErrorInput {
  kind: ClientErrorKind;
  message: string;
  stack?: string | null;
  route?: string;
  source?: string | null;
  userAgent?: string | null;
}

const STORAGE_KEY = 'linegra_client_error_rate';
const HOURLY_LIMIT_PER_SIGNATURE = 3;
const HOUR_MS = 60 * 60 * 1000;

type RateStore = Record<string, number[]>;

const readRateStore = (): RateStore => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RateStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeRateStore = (store: RateStore): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota errors — server-side dedupe still applies.
  }
};

export const shouldRecordClientError = (
  stackHash: string,
  now = Date.now(),
  store: RateStore = readRateStore()
): boolean => {
  const hourAgo = now - HOUR_MS;
  const recent = (store[stackHash] ?? []).filter((timestamp) => timestamp > hourAgo);
  return recent.length < HOURLY_LIMIT_PER_SIGNATURE;
};

export const markClientErrorRecorded = (
  stackHash: string,
  now = Date.now(),
  store: RateStore = readRateStore()
): RateStore => {
  const hourAgo = now - HOUR_MS;
  const recent = (store[stackHash] ?? []).filter((timestamp) => timestamp > hourAgo);
  recent.push(now);
  return { ...store, [stackHash]: recent };
};

const currentRoute = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
};

const truncateUserAgent = (userAgent: string | null | undefined): string | null => {
  const trimmed = userAgent?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
};

export const recordClientError = async (input: RecordClientErrorInput): Promise<void> => {
  if (!isSupabaseConfigured()) return;

  const message = input.message?.trim().slice(0, 500) || 'Unknown error';
  const stackHash = hashClientErrorStack(input.stack);
  if (!shouldRecordClientError(stackHash)) return;

  const nextStore = markClientErrorRecorded(stackHash);
  writeRateStore(nextStore);

  try {
    const { error } = await supabase.rpc('record_client_error', {
      payload_kind: input.kind,
      payload_message: message,
      payload_stack_hash: stackHash,
      payload_route: input.route ?? currentRoute(),
      payload_source: input.source ?? null,
      payload_user_agent: truncateUserAgent(input.userAgent ?? navigator.userAgent),
    });
    if (error) {
      console.warn('record_client_error failed', error.message);
    }
  } catch (err) {
    console.warn('record_client_error failed', err);
  }
};

export const installClientErrorReporting = (): void => {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const stack =
      event.error instanceof Error
        ? event.error.stack
        : typeof event.error === 'string'
          ? event.error
          : undefined;
    void recordClientError({
      kind: 'error',
      message: event.message || (event.error instanceof Error ? event.error.message : 'Script error'),
      stack,
      route: currentRoute(),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    const stack = reason instanceof Error ? reason.stack : typeof reason === 'string' ? reason : null;
    void recordClientError({
      kind: 'rejection',
      message,
      stack,
      route: currentRoute(),
    });
  });
};
