'use strict';

const { CodeGenerator, withAppBuildGradle } = require('expo/config-plugins');

const TAG = 'with-android-abi-splits';

/**
 * Generates one APK per architecture instead of a universal APK containing every
 * native library, and gives each one its own versionCode. The architecture list itself
 * comes from `reactNativeArchitectures`, which expo-build-properties writes from
 * `android.buildArchs` in app.json.
 *
 * CodeGenerator.mergeContents owns a tagged section, so repeated `expo prebuild` calls
 * update the block instead of duplicating it.
 *
 * `applicationVariants` and `versionCodeOverride` are the older AGP variant API. They are
 * deprecated but present and working in AGP 8.12, which is what Expo SDK 57 pins via
 * react-native's version catalog. If a future AGP removes them the build will fail loudly
 * at configuration time rather than silently shipping duplicate versionCodes.
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
    }

    // A distinct versionCode per ABI. Play Store rejects an upload whose versionCode
    // already exists, and with splits enabled every APK would otherwise carry the same one,
    // so only the first could ever be published.
    //
    // The ordering matters beyond uniqueness. A device matching more than one APK installs
    // the highest versionCode, and an arm64-v8a phone also runs armeabi-v7a — so the 64-bit
    // entry has to outrank the 32-bit build of the same family, or those devices would be
    // served the 32-bit APK indefinitely. Cross-family ordering is irrelevant because no
    // device matches both ARM and x86.
    //
    // Filters are looked up by name to avoid importing com.android.build.OutputFile, which
    // would have to go at the very top of the file and cannot be injected into this block.
    def abiVersionOffsets = ['armeabi-v7a': 1, 'arm64-v8a': 2, 'x86': 3, 'x86_64': 4]
    applicationVariants.all { variant ->
        variant.outputs.each { output ->
            def abi = output.getFilter('ABI')
            if (abi != null) {
                output.versionCodeOverride =
                    (abiVersionOffsets.get(abi) ?: 0) * 1000000 + variant.versionCode
            }
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
