/**
 * Admin Questions — view all questions across departments with a filter.
 * Admin can see which department owns each question and filter by department.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Department, Question } from '@ims/shared-types';
import { QUESTION_TYPE_LABELS } from '@ims/shared-types';
import { useDepartments, useQuestions } from '@/lib/api/hooks';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

export default function AdminQuestionsScreen() {
  const insets = useSafeAreaInsets();
  const { data: departments } = useDepartments();
  const { data: questions, isLoading, refetch, isRefetching } = useQuestions(false);

  const [selectedDept, setSelectedDept] = useState<string | 'all'>('all');
  const [showPicker, setShowPicker] = useState(false);

  // Filter questions by selected department
  const filtered = (questions ?? []).filter((q) => {
    if (selectedDept === 'all') return true;
    if (selectedDept === 'global') return q.departmentId === null;
    return q.departmentId === selectedDept;
  });

  const active = filtered.filter((q) => q.isActive);
  const retired = filtered.filter((q) => !q.isActive);

  const selectedDeptName =
    selectedDept === 'all'
      ? 'All Departments'
      : selectedDept === 'global'
        ? 'Global (All Students)'
        : departments?.find((d) => d.id === selectedDept)?.name ?? 'Unknown';

  // Group counts for the header
  const deptCounts = (departments ?? []).map((dept) => ({
    ...dept,
    count: (questions ?? []).filter((q) => q.departmentId === dept.id && q.isActive).length,
  }));
  const globalCount = (questions ?? []).filter((q) => q.departmentId === null && q.isActive).length;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Questions</Text>
        <Text style={styles.headerSubtitle}>
          View questions across all departments
        </Text>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatValue}>{(questions ?? []).filter((q) => q.isActive).length}</Text>
            <Text style={styles.headerStatLabel}>Active</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatValue}>{departments?.length ?? 0}</Text>
            <Text style={styles.headerStatLabel}>Departments</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatValue}>{(questions ?? []).filter((q) => !q.isActive).length}</Text>
            <Text style={styles.headerStatLabel}>Retired</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {/* Department Filter */}
        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>Filter by department</Text>
          <Pressable style={styles.dropdown} onPress={() => setShowPicker(!showPicker)}>
            <MaterialIcons name="business" size={18} color={colors.primary} />
            <Text style={styles.dropdownText} numberOfLines={1}>{selectedDeptName}</Text>
            <MaterialIcons name={showPicker ? 'expand-less' : 'expand-more'} size={22} color={colors.textMuted} />
          </Pressable>

          {showPicker && (
            <View style={styles.dropdownList}>
              <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                <Pressable style={styles.dropdownItem} onPress={() => { setSelectedDept('all'); setShowPicker(false); }}>
                  <Text style={[styles.dropdownItemText, selectedDept === 'all' && styles.dropdownItemActive]}>
                    All Departments
                  </Text>
                  <Text style={styles.dropdownCount}>{(questions ?? []).filter((q) => q.isActive).length}</Text>
                </Pressable>

                {globalCount > 0 && (
                  <Pressable style={styles.dropdownItem} onPress={() => { setSelectedDept('global'); setShowPicker(false); }}>
                    <Text style={[styles.dropdownItemText, selectedDept === 'global' && styles.dropdownItemActive]}>
                      Global (All Students)
                    </Text>
                    <Text style={styles.dropdownCount}>{globalCount}</Text>
                  </Pressable>
                )}

                {deptCounts.map((dept) => (
                  <Pressable key={dept.id} style={styles.dropdownItem} onPress={() => { setSelectedDept(dept.id); setShowPicker(false); }}>
                    <Text style={[styles.dropdownItemText, selectedDept === dept.id && styles.dropdownItemActive]} numberOfLines={1}>
                      {dept.name}
                    </Text>
                    <Text style={styles.dropdownCount}>{dept.count}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Active Questions */}
        {isLoading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : active.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="help-outline" size={32} color={colors.textFaint} />
            </View>
            <Text style={styles.emptyTitle}>No questions</Text>
            <Text style={styles.emptyBody}>
              {selectedDept === 'all'
                ? 'No questions have been created yet.'
                : `No active questions for ${selectedDeptName}.`}
            </Text>
          </View>
        ) : (
          active.map((question, index) => (
            <QuestionCard key={question.id} question={question} index={index + 1} departments={departments ?? []} />
          ))
        )}

        {/* Retired Questions */}
        {retired.length > 0 && (
          <>
            <Text style={styles.retiredHeader}>Retired ({retired.length})</Text>
            {retired.map((question) => (
              <QuestionCard key={question.id} question={question} departments={departments ?? []} retired />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function QuestionCard({ question, index, departments, retired }: { question: Question; index?: number; departments: Department[]; retired?: boolean }) {
  const deptName = question.departmentId
    ? departments.find((d) => d.id === question.departmentId)?.name ?? 'Unknown Dept'
    : 'Global';

  return (
    <View style={[styles.card, retired && { opacity: 0.6 }]}>
      <View style={styles.cardRow}>
        {index ? (
          <View style={styles.numberCircle}>
            <Text style={styles.numberText}>{index}</Text>
          </View>
        ) : (
          <View style={styles.numberCircle}>
            <MaterialIcons name="archive" size={14} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.questionPrompt}>{question.prompt}</Text>
          {question.helpText ? <Text style={styles.questionHelp}>{question.helpText}</Text> : null}

          {/* Badges */}
          <View style={styles.badgeRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{QUESTION_TYPE_LABELS[question.type]}</Text>
            </View>
            <View style={[styles.requiredBadge, question.required ? styles.requiredActive : styles.optionalBadge]}>
              <MaterialIcons
                name={question.required ? 'check-circle' : 'stars'}
                size={11}
                color={question.required ? colors.success : colors.warning}
              />
              <Text style={[styles.requiredText, { color: question.required ? colors.success : colors.warning }]}>
                {question.required ? 'Required' : 'Optional'}
              </Text>
            </View>
          </View>

          {/* Department tag */}
          <View style={styles.deptTag}>
            <MaterialIcons name="business" size={12} color={colors.primary} />
            <Text style={styles.deptTagText}>{deptName}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  headerStats: { flexDirection: 'row', backgroundColor: '#ffffff15', borderRadius: 14, padding: 14, marginTop: 16, alignItems: 'center' },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerStatLabel: { fontSize: 10, color: '#ffffffcc', marginTop: 2 },
  headerStatDivider: { width: 1, height: 28, backgroundColor: '#ffffff30' },
  content: { padding: 16, paddingBottom: 100, gap: 10 },

  // Filter
  filterCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, ...shadow.card, marginBottom: 4 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  dropdownText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  dropdownList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff', marginTop: 8, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dropdownItemText: { fontSize: 13, color: colors.text, flex: 1 },
  dropdownItemActive: { color: colors.primary, fontWeight: '700' },
  dropdownCount: { fontSize: 12, fontWeight: '700', color: colors.primary, backgroundColor: '#eceef8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  // Cards
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, ...shadow.card },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  numberCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  questionPrompt: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 20 },
  questionHelp: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, backgroundColor: '#eceef8' },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  requiredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  requiredActive: { backgroundColor: colors.successBg },
  optionalBadge: { backgroundColor: colors.warningBg },
  requiredText: { fontSize: 11, fontWeight: '700' },
  deptTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: '#eceef8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  deptTagText: { fontSize: 11, fontWeight: '600', color: colors.primary },

  // Retired
  retiredHeader: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },

  // Empty
  muted: { fontSize: 13, color: colors.textMuted, padding: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
