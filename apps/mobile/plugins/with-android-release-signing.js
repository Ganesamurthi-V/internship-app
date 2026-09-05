'use strict';

const { CodeGenerator, withAppBuildGradle } = require('expo/config-plugins');

const TAG = 'with-android-release-signing';

/**
 * Signs release builds with a real keystore instead of the debug one.
 *
 * The Expo/React Native template ships `release { signingConfig signingConfigs.debug }` with
 * a comment telling you to change it, and that comment is easy to leave in place. Shipping
 * it matters more than it looks: the Android debug keystore is a well-known file with the
 * password `android`, identical on every machine. An APK signed with it can be replaced by
 * anyone who builds one with the same key, and Play Store rejects it outright.
 *
 * Credentials are read as Gradle properties, never committed:
 *
 *   IMS_RELEASE_STORE_FILE       path to the keystore, absolute or relative to android/app
 *   IMS_RELEASE_STORE_PASSWORD
 *   IMS_RELEASE_KEY_ALIAS
 *   IMS_RELEASE_KEY_PASSWORD
 *
 * Locally those belong in `~/.gradle/gradle.properties`, which is outside the repository. In
 * CI, Gradle reads any `ORG_GRADLE_PROJECT_<name>` environment variable as the property
 * `<name>`, so the same build works from secrets with no file on disk:
 *
 *   ORG_GRADLE_PROJECT_IMS_RELEASE_STORE_PASSWORD=...
 *
 * WHY IT WARNS RATHER THAN FAILS
 *
 * A hard failure would be the stricter choice, but it would also break every debug build and
 * every `assembleRelease` run for testing on a project that is still pre-launch. Instead the
 * signing config is only created when all four properties are present, and its absence is
 * announced at configuration time — loudly enough to notice, without blocking work. The
 * banner names the artifact as unshippable so the state cannot be mistaken for normal.
 */
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(`${TAG} only supports a Groovy app/build.gradle file.`);
    }

    let contents = gradleConfig.modResults.contents;

    // 1. Declare the release signing config next to the template's debug one.
    const signingBlock = `        // Created only when every credential is present, so a partially configured machine
        // cannot produce an APK that is signed with something unintended.
        if (project.hasProperty('IMS_RELEASE_STORE_FILE')
                && project.hasProperty('IMS_RELEASE_STORE_PASSWORD')
                && project.hasProperty('IMS_RELEASE_KEY_ALIAS')
                && project.hasProperty('IMS_RELEASE_KEY_PASSWORD')) {
            release {
                storeFile file(IMS_RELEASE_STORE_FILE)
                storePassword IMS_RELEASE_STORE_PASSWORD
                keyAlias IMS_RELEASE_KEY_ALIAS
                keyPassword IMS_RELEASE_KEY_PASSWORD
            }
        }`;

    contents = CodeGenerator.mergeContents({
      src: contents,
      newSrc: signingBlock,
      tag: `${TAG}-config`,
      anchor: /signingConfigs\s*\{/,
      offset: 1,
      comment: '        //',
    }).contents;

    // 2. Point the release *build type* at it, replacing the template's debug assignment.
    //
    //    The search is confined to everything from `buildTypes {` onward. Scanning the whole
    //    file for `release { ... } signingConfig signingConfigs.debug` matches the `release`
    //    entry this plugin just added to `signingConfigs` above, and the next assignment
    //    after that belongs to the *debug* build type — which the template declares first.
    //    That rewrote debug to prefer the production key and left release debug-signed:
    //    both exactly backwards, and silently so.
    const buildTypesIndex = contents.indexOf('buildTypes {');
    if (buildTypesIndex === -1) {
      throw new Error(
        `${TAG}: no "buildTypes {" block in app/build.gradle. The template may have changed; ` +
          'update this plugin rather than editing android/ directly, which is gitignored.',
      );
    }

    const head = contents.slice(0, buildTypesIndex);
    const tail = contents.slice(buildTypesIndex);
    const releaseAssignment = /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;

    if (!releaseAssignment.test(tail)) {
      throw new Error(
        `${TAG}: could not find "signingConfig signingConfigs.debug" inside the release build ` +
          'type. The template may have changed; update this plugin rather than editing ' +
          'android/ directly, which is gitignored.',
      );
    }

    contents =
      head +
      tail.replace(
        releaseAssignment,
        '$1signingConfig signingConfigs.hasProperty("release") ? signingConfigs.release : signingConfigs.debug',
      );

    // 3. Say so at configuration time when a release build would be debug-signed.
    const warningBlock = `gradle.projectsEvaluated {
    if (!android.signingConfigs.hasProperty('release')) {
        logger.warn('')
        logger.warn('============================================================')
        logger.warn(' WARNING: release builds are signed with the DEBUG keystore.')
        logger.warn(' The debug key is public and its password is "android", so an')
        logger.warn(' APK built this way can be replaced by anyone and Play Store')
        logger.warn(' will refuse it. Do not distribute this artifact.')
        logger.warn('')
        logger.warn(' Set IMS_RELEASE_STORE_FILE, IMS_RELEASE_STORE_PASSWORD,')
        logger.warn(' IMS_RELEASE_KEY_ALIAS and IMS_RELEASE_KEY_PASSWORD in')
        logger.warn(' ~/.gradle/gradle.properties, or pass them from CI as')
        logger.warn(' ORG_GRADLE_PROJECT_* environment variables.')
        logger.warn('============================================================')
        logger.warn('')
    }
}`;

    contents = CodeGenerator.mergeContents({
      src: contents,
      newSrc: warningBlock,
      tag: `${TAG}-warning`,
      // Anchored on the dependencies block, which is the last top-level section the template
      // defines, so the injected code lands outside `android { }` where it belongs.
      anchor: /^dependencies\s*\{/m,
      offset: 0,
      comment: '//',
    }).contents;

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
