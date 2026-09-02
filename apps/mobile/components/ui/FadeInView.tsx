/**
 * Content entrance animation.
 *
 * Fades a screen's content in and lifts it a few points as it arrives, so a dashboard
 * settles into place instead of appearing fully formed the instant its data lands. The
 * navigation transition moves the screen; this moves what is inside it.
 *
 * WHY React Native's `Animated` AND NOT REANIMATED
 *
 * Reanimated is installed and works, but a one-shot opacity and translate needs none of
 * it. `Animated` with `useNativeDriver` runs this entirely on the UI thread too, and it
 * carries no babel plugin or worklet requirements — which keeps a purely cosmetic touch
 * from becoming something that can break a build.
 *
 * Both animated properties are native-driver safe. Adding a width or a colour here would
 * silently force the animation back onto the JS thread and make it stutter under load,
 * which is exactly the jank this is meant to remove.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { motion } from '@/constants/theme';

interface FadeInViewProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Milliseconds to wait before starting. For staggering sibling blocks. */
  delay?: number;
}

export function FadeInView({ children, style, delay = 0 }: FadeInViewProps) {
  // A ref, not state: this value is handed to the native driver and must survive every
  // re-render without restarting the animation.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.enter,
      delay,
      // Decelerating: fast to begin, easing to a stop. Linear motion is what reads as
      // mechanical rather than smooth.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();

    // Stopped rather than left running, so a screen unmounted mid-animation does not
    // write to a detached view.
    return () => animation.stop();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.enterOffset, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
