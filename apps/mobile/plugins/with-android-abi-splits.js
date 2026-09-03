'use strict';

const { CodeGenerator, withAppBuildGradle } = require('expo/config-plugins');

const TAG = 'with-android-abi-splits';

/**
 * Generates one APK per architecture instead of a universal APK containing every
 * native library. The architecture list itself comes from `reactNativeArchitectures`,
 * which expo-build-properties writes from `android.buildArchs` in app.json.
 *
 * CodeGenerator.mergeContents owns a tagged section, so repeated `expo prebuild` calls
 * update the block instead of duplicating it.
 */
module.exports = function withAndroidAbiSplits(config, options = {}) {
  const universalApk = options.universalApk === true;

  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(`${TAG} only supports a Groovy app/build.gradle file.`);
    }

    const splitsBlock = `    splits {
        abi {
            enable true
            reset()
            include(*(findProperty('reactNativeArchitectures') ?: 'armeabi-v7a,arm64-v8a,x86,x86_64')
                .split(',')
                .collect { it.trim() } as String[])
            universalApk ${universalApk}
        }
    }`;

    gradleConfig.modResults.contents = CodeGenerator.mergeContents({
      src: gradleConfig.modResults.contents,
      newSrc: splitsBlock,
      tag: TAG,
      anchor: /^android\s*\{/m,
      offset: 1,
      comment: '//',
    }).contents;

    return gradleConfig;
  });
};
