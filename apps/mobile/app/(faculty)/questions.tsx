/**
 * Question management — redesigned with gradient header, drag-to-reorder,
 * and card-based layout matching the app design system.
 */

import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Question, QuestionType } from '@ims/shared-types';
import {
  ANSWER_MAX_LENGTH,
  MAX_ACTIVE_QUESTIONS,
  QUESTION_PROMPT_MAX_LENGTH,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
} from '@ims/shared-types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { ApiError } from '@/lib/api/client';
import {
  useCreateQuestion,
  useDeleteQuestion,
  useQuestions,
  useReorderQuestions,
  useUpdateQuestion,
} from '@/lib/api/hooks';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

const TYPE_OPTIONS = QUESTION_TYPES.map((type) => ({
  value: type,
  label: QUESTION_TYPE_LABELS[type],
}));

export default function QuestionsScreen() {
  const insets = useSafeAreaInsets();
  const { data: questions, isLoading, refetch } = useQuestions(false);
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const reorderQuestions = useReorderQuestions();

  const [showForm, setShowForm] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [helpText, setHelpText] = useState('');
  const [type, setType] = useState<QuestionType>('long_text');
  const [required, setRequired] = useState(true);
  const [choiceOptions, setChoiceOptions] = useState<string[]>(['', '']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const active = (questions ?? []).filter((q) => q.isActive);

  const resetForm = (): void => {
    setPrompt('');
    setHelpText('');
    setType('long_text');
    setRequired(true);
    setChoiceOptions(['', '']);
    setErrors({});
    setShowForm(false);
    setEditingId(null);
  };

  const onSave = async (): Promise<void> => {
    setErrors({});
    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      setErrors({ prompt: 'Write the question.' });
      return;
    }

    const options =
      type === 'choice'
        ? choiceOptions.map((opt) => opt.trim()).filter((opt) => opt.length > 0)
        : undefined;

    if (type === 'choice' && (!options || options.length < 2)) {
      setErrors({ options: 'Add at least two options.' });
      return;
    }

    try {
      if (editingId) {
        await updateQuestion.mutateAsync({
          questionId: editingId,
          prompt: trimmed,
          helpText: helpText.trim().length > 0 ? helpText.trim() : null,
          type,
          required,
          options: options ?? null,
          maxLength: type === 'long_text' ? ANSWER_MAX_LENGTH : null,
        });
      } else {
        await createQuestion.mutateAsync({
          prompt: trimmed,
          helpText: helpText.trim().length > 0 ? helpText.trim() : null,
          type,
          required,
          sortOrder: (active.length + 1) * 10,
          options: options ?? null,
          minLength: null,
          maxLength: type === 'long_text' ? ANSWER_MAX_LENGTH : null,
          departmentId: null, // Backend auto-assigns faculty's department
          referenceDocId: null,
        });
      }
      resetForm();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setErrors(error.fields);
        else setErrors({ _: error.message });
      } else {
        setErrors({ _: 'Could not save the question.' });
      }
    }
  };

  const onEdit = (question: Question): void => {
    setMenuOpenId(null);
    // Pre-fill the form with the question's current values
    setPrompt(question.prompt);
    setHelpText(question.helpText ?? '');
    setType(question.type);
    setRequired(question.required);
    setChoiceOptions(question.options && question.options.length > 0 ? [...question.options] : ['', '']);
    setShowForm(true);
    // Store the editing question id so we can update instead of create
    setEditingId(question.id);
  };

  const onRemove = (question: Question): void => {
    Alert.alert(
      'Remove this question?',
      'If students have already answered it, it is retired instead of deleted so their answers stay readable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const result = await deleteQuestion.mutateAsync(question.id);
                Alert.alert(result.deleted ? 'Deleted' : 'Retired', result.message);
              } catch (error) {
                Alert.alert(
                  'Could not remove',
                  error instanceof Error ? error.message : 'Try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  const onDragEnd = useCallback(
    ({ data }: { data: Question[] }) => {
      const order = data.map((q, index) => ({
        id: q.id,
        sortOrder: (index + 1) * 10,
      }));
      void reorderQuestions.mutateAsync(order);
    },
    [reorderQuestions],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive: isDragging, getIndex }: RenderItemParams<Question>) => {
      const index = (getIndex() ?? 0) + 1;
      return (
        <ScaleDecorator>
          <View style={[styles.questionCard, isDragging && styles.questionCardDragging]}>
            {/* Drag handle */}
            <Pressable onLongPress={drag} style={styles.dragHandle} accessibilityLabel="Drag to reorder">
              <MaterialIcons name="drag-indicator" size={22} color={colors.textMuted} />
            </Pressable>

            {/* Number */}
            <View style={styles.numberCircle}>
              <Text style={styles.numberText}>{index}</Text>
            </View>

            {/* Content */}
            <View style={styles.questionContent}>
              <Text style={styles.questionPrompt}>{item.prompt}</Text>
              {item.helpText ? <Text style={styles.questionHelp}>{item.helpText}</Text> : null}

              {/* Badges */}
              <View style={styles.badgeRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{QUESTION_TYPE_LABELS[item.type]}</Text>
                </View>
                <View style={[styles.requiredBadge, item.required ? styles.requiredBadgeActive : styles.optionalBadge]}>
                  <MaterialIcons
                    name={item.required ? 'check-circle' : 'stars'}
                    size={12}
                    color={item.required ? colors.success : colors.warning}
                  />
                  <Text style={[styles.requiredBadgeText, { color: item.required ? colors.success : colors.warning }]}>
                    {item.required ? 'Required' : 'Optional'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Three-dot menu button */}
            <Pressable style={styles.moreButton} onPress={() => setMenuOpenId(item.id)}>
              <MaterialIcons name="more-vert" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [],
  );

  const ListHeader = (
    <>
      {/* Add question card */}
      <Pressable
        style={styles.addCard}
        onPress={() => setShowForm(true)}
        disabled={active.length >= MAX_ACTIVE_QUESTIONS}
      >
        <View style={styles.addIconCircle}>
          <MaterialIcons name="add" size={20} color={colors.primary} />
        </View>
        <Text style={styles.addText}>Add a question</Text>
        <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
      </Pressable>

      {/* Create form */}
      {showForm && (
        <View style={styles.formCard}>
          <Card title="New question">
            <TextField
              label="Question"
              value={prompt}
              onChangeText={setPrompt}
              multiline
              placeholder="e.g. What did you work on today?"
              maxLength={QUESTION_PROMPT_MAX_LENGTH}
              error={errors.prompt}
              required
            />
            <TextField
              label="Help text"
              value={helpText}
              onChangeText={setHelpText}
              placeholder="Optional guidance shown under the question"
              error={errors.helpText}
            />
            <ChipGroup
              label="Answer type"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(next) => setType(next)}
            />

            {type === 'choice' ? (
              <View style={styles.optionsSection}>
                <Text style={styles.optionsLabel}>
                  Options <Text style={styles.requiredStar}>*</Text>
                </Text>
                {choiceOptions.map((option, index) => (
                  <View key={index} style={styles.optionRow}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label=""
                        value={option}
                        onChangeText={(text) => {
                          const next = [...choiceOptions];
                          next[index] = text;
                          setChoiceOptions(next);
                        }}
                        placeholder={`Option ${index + 1}`}
                      />
                    </View>
                    {choiceOptions.length > 2 ? (
                      <Pressable
                        onPress={() => setChoiceOptions(choiceOptions.filter((_, i) => i !== index))}
                        style={styles.removeOptionBtn}
                      >
                        <MaterialIcons name="close" size={18} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {choiceOptions.length < 10 && (
                  <Pressable
                    style={styles.addOptionBtn}
                    onPress={() => setChoiceOptions([...choiceOptions, ''])}
                  >
                    <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} />
                    <Text style={styles.addOptionText}>Add option</Text>
                  </Pressable>
                )}
                {errors.options ? <Text style={styles.fieldError}>{errors.options}</Text> : null}
              </View>
            ) : null}

            <ChipGroup
              label="Is an answer required?"
              options={[
                { value: 'yes', label: 'Required' },
                { value: 'no', label: 'Optional' },
              ]}
              value={required ? 'yes' : 'no'}
              onChange={(next) => setRequired(next === 'yes')}
            />

            {errors._ ? (
              <Text style={styles.formError}>{errors._}</Text>
            ) : null}

            <View style={{ gap: 8, marginTop: 12 }}>
              <Button label={editingId ? 'Save changes' : 'Add question'} onPress={() => void onSave()} loading={createQuestion.isPending || updateQuestion.isPending} />
              <Button label="Cancel" variant="secondary" onPress={resetForm} />
            </View>
          </Card>
        </View>
      )}

      {/* Retired section header */}
      {null}
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Gradient Header */}
      <LinearGradient
        colors={['#414fb8', '#5b6abf', '#7b85d4']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Questions</Text>
            <Text style={styles.headerSubtitle}>
              {active.length} of {MAX_ACTIVE_QUESTIONS} active questions. These are what{'\n'}every student answers each day.
            </Text>
          </View>
          <View style={styles.settingsButton}>
            <MaterialIcons name="settings" size={24} color="#ffffff" />
          </View>
        </View>
      </LinearGradient>

      {/* Draggable list */}
      <DraggableFlatList
        data={active}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={onDragEnd}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        containerStyle={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Context menu modal */}
      <Modal
        visible={menuOpenId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpenId(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpenId(null)}>
          <View style={styles.menuCard}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const question = active.find((q) => q.id === menuOpenId);
                if (question) onEdit(question);
              }}
            >
              <MaterialIcons name="edit" size={20} color={colors.primary} />
              <Text style={styles.menuItemText}>Edit</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const question = active.find((q) => q.id === menuOpenId);
                setMenuOpenId(null);
                if (question) onRemove(question);
              }}
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 6, lineHeight: 18 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 100 },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
    ...shadow.card,
  },
  addIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eceef8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  formCard: { marginBottom: 12 },
  questionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    ...shadow.card,
  },
  questionCardDragging: {
    opacity: 0.92,
    elevation: 8,
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  dragHandle: {
    paddingRight: 8,
    paddingTop: 4,
    justifyContent: 'center',
  },
  numberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eceef8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  numberText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  questionContent: { flex: 1 },
  questionPrompt: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 20 },
  questionHelp: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#eceef8',
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  requiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  requiredBadgeActive: { backgroundColor: colors.successBg },
  optionalBadge: { backgroundColor: colors.warningBg },
  requiredBadgeText: { fontSize: 11, fontWeight: '700' },
  moreButton: {
    paddingLeft: 4,
    paddingTop: 4,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 8,
    width: 200,
    ...shadow.card,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  menuItemText: { fontSize: 15, fontWeight: '600', color: colors.text },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  optionsSection: { marginBottom: 12 },
  optionsLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  requiredStar: { color: colors.danger },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  removeOptionBtn: { padding: 6 },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  addOptionText: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  fieldError: { marginTop: 4, fontSize: 12, color: colors.danger },
  formError: { fontSize: 13, color: colors.danger, fontWeight: '600', marginTop: 8 },
});
