/**
 * Technology / skill tag input — 12_Mobile_App_Spec §3, 01_PRD §4.3.
 *
 * "Technologies/tools used (multi-tag input: Java, Python, SQL, Git, AWS, React, etc.)"
 *
 * De-duplication is case-insensitive but keeps the spelling the student typed, matching
 * `tagArraySchema` in @ims/shared-validation — so the client and the server agree on
 * what the tag list will look like after submission, and the cohort-wide technology
 * aggregation in 02_SRS §7 counts "React" and "react" as one thing.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

/** Common suggestions, offered as one-tap chips before the student types anything. */
const SUGGESTIONS = [
  'Java',
  'Python',
  'JavaScript',
  'TypeScript',
  'SQL',
  'Git',
  'React',
  'Node.js',
  'AWS',
  'Docker',
  'Linux',
  'Figma',
] as const;

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  error?: string | undefined;
  maxTags?: number;
  showSuggestions?: boolean;
}

export function TagInput({
  label,
  value,
  onChange,
  placeholder = 'Type and press enter',
  error,
  maxTags = 50,
  showSuggestions = true,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string): void => {
    const tag = raw.trim().slice(0, 60);
    if (tag.length === 0) return;
    if (value.length >= maxTags) return;

    // Case-insensitive duplicate check, matching the shared schema's behaviour.
    const exists = value.some((existing) => existing.toLowerCase() === tag.toLowerCase());
    if (exists) {
      setDraft('');
      return;
    }

    onChange([...value, tag]);
    setDraft('');
  };

  const removeTag = (index: number): void => {
    onChange(value.filter((_, position) => position !== index));
  };

  const available = SUGGESTIONS.filter(
    (suggestion) => !value.some((tag) => tag.toLowerCase() === suggestion.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.count}>
          {value.length}/{maxTags}
        </Text>
      </View>

      {value.length > 0 ? (
        <View style={styles.tagRow}>
          {value.map((tag, index) => (
            <Pressable
              key={`${tag}-${index}`}
              onPress={() => removeTag(index)}
              accessibilityRole="button"
              accessibilityLabel={`${tag}. Tap to remove.`}
              style={styles.tag}
            >
              <Text style={styles.tagText}>{tag}</Text>
              {/* Multiplication sign, which renders more evenly than a lowercase x. */}
              <Text style={styles.tagRemove}>{'\u00d7'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => addTag(draft)}
        // Commit on blur too, so a tag typed and then abandoned is not silently lost.
        onBlur={() => addTag(draft)}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, error ? styles.inputError : null]}
        returnKeyType="done"
        blurOnSubmit={false}
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel={`${label}. Type a tag and press done to add it.`}
      />

      {showSuggestions && available.length > 0 && value.length < maxTags ? (
        <View style={styles.suggestionRow}>
          {available.slice(0, 8).map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => addTag(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${suggestion}`}
              style={styles.suggestion}
            >
              <Text style={styles.suggestionText}>+ {suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text },
  count: { fontSize: fontSize.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.info,
  },
  tagText: { fontSize: fontSize.small, color: colors.info, fontWeight: '600' },
  tagRemove: { fontSize: fontSize.subtitle, color: colors.info, lineHeight: 20 },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger, borderWidth: 1.5 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  suggestion: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  suggestionText: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  error: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
});
