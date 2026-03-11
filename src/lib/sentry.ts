import * as Sentry from '@sentry/browser';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = (import.meta as Record<string, Record<string, unknown>>).env?.PUBLIC_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: (import.meta as Record<string, Record<string, unknown>>).env?.MODE === 'production' ? 'production' : 'development',
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Strip PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => ({
          ...b,
          data: undefined,
        }));
      }
      return event;
    },
  });
  initialized = true;
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  console.error('[Sentry]', error);
  if (!initialized) return;
  Sentry.captureException(error, { extra: context });
}
