import * as Sentry from '@sentry/react-native';

/**
 * Initializes Sentry error and crash reporting. In development or when no DSN is
 * configured, this is a no-op. In production, errors from real users' devices are
 * captured and surface in the Sentry dashboard for monitoring and alerting.
 *
 * Call this at module scope before any app logic runs.
 */
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (__DEV__) {
      console.info('[Sentry] Disabled — no DSN configured.');
    }
    return;
  }

  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
  });
}

/**
 * Wrapper function for Sentry's error boundary. Use to wrap your root component.
 */
export const sentryWrap = Sentry.wrap;
