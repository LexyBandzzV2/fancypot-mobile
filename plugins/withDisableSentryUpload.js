/**
 * Expo config plugin: force-disable Sentry's build-time upload.
 *
 * The Sentry React Native config plugin adds two Xcode "Run Script" build
 * phases (source-map upload in "Bundle React Native code and images", and
 * "Upload Debug Symbols to Sentry"). Both try to run `sentry-cli`, which
 * fails the whole EAS build when no Sentry org/auth token is configured
 * ("An organization ID or slug is required").
 *
 * Setting SENTRY_DISABLE_AUTO_UPLOAD=true in eas.json `env` is supposed to
 * skip these, but that variable does not reliably reach the Xcode build-phase
 * shell in this project. Instead of depending on env propagation, we inject
 * the flag as an `export` at the very top of each Sentry build-phase script,
 * so it is unconditionally set when the script runs.
 *
 * Runtime crash reporting (via EXPO_PUBLIC_SENTRY_DSN) is unaffected — this
 * only turns off the optional build-time source-map / debug-symbol upload.
 *
 * This plugin must run AFTER "@sentry/react-native" in app.json's plugins
 * array so the phases already exist when we patch them.
 */
const { withXcodeProject } = require('expo/config-plugins');

const EXPORT_LINE = 'export SENTRY_DISABLE_AUTO_UPLOAD=true';

module.exports = function withDisableSentryUpload(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const phases =
      xcodeProject.hash.project.objects['PBXShellScriptBuildPhase'] || {};

    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase !== 'object' || !phase.shellScript) continue;

      // shellScript is stored as a JSON-encoded (quoted, escaped) string.
      let decoded;
      try {
        decoded = JSON.parse(phase.shellScript);
      } catch (e) {
        continue;
      }

      // Anchor on the React Native bundle script (the phase that actually
      // fails), which is present BOTH before and after Sentry wraps it — so
      // this works regardless of whether we run before or after Sentry's mod.
      // Also catch the standalone "Upload Debug Symbols to Sentry" phase.
      const isSentryOrBundlePhase =
        decoded.includes('react-native-xcode.sh') ||
        decoded.includes('sentry-xcode') ||
        decoded.toLowerCase().includes('sentry-cli') ||
        decoded.includes('@sentry/react-native');
      if (!isSentryOrBundlePhase) continue;
      if (decoded.includes('SENTRY_DISABLE_AUTO_UPLOAD=true')) continue;

      phase.shellScript = JSON.stringify(`${EXPORT_LINE}\n${decoded}`);
    }

    return config;
  });
};
