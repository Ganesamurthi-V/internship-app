/**
 * Documents checklist — 12_Mobile_App_Spec §2, 01_PRD §4.8.
 *
 * Shows which documents have been uploaded, their verification status, and allows
 * uploading new ones. The checklist shape comes from the backend's
 * GET /api/documents?internshipId= combined with the checklist service.
 */

import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentMeta } from '@ims/shared-types';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, VERIFICATION_STATUS_LABELS } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api/client';
import { useDocuments, useMyInternship } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function DocumentsScreen() {
  const { data: internshipData } = useMyInternship();
  const internshipId = internshipData?.value?.internship?.id;

  const { data: docsData, refetch: refetchDocs } = useDocuments(internshipId);
  const documents = docsData?.value ?? [];

  const [uploading, setUploading] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { void refetchDocs(); }, [refetchDocs]));

  const pickAndUpload = async (documentType: string): Promise<void> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setUploading(documentType);

      // Step 1: Get upload URL
      const uploadData = await api.post<{ uploadUrl: string; storageKey: string }>('/documents/upload-url', {
        filename: file.name,
        mimeType: file.mimeType ?? 'application/pdf',
        sizeBytes: file.size ?? 0,
        documentType,
      });

      // Step 2: Upload directly to storage
      const fileResponse = await fetch(file.uri);
      const blob = await fileResponse.blob();

      await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.mimeType ?? 'application/pdf' },
        body: blob,
      });

      // Step 3: Confirm upload
      await api.post('/documents/complete', {
        storageKey: uploadData.storageKey,
        filename: file.name,
        mimeType: file.mimeType ?? 'application/pdf',
        sizeBytes: file.size ?? 0,
        documentType,
        internshipId,
      });

      await refetchDocs();
      Alert.alert('Uploaded', `${DOCUMENT_TYPE_LABELS[documentType as keyof typeof DOCUMENT_TYPE_LABELS] ?? documentType} uploaded successfully.`);
    } catch (error) {
      Alert.alert('Upload failed', error instanceof ApiError ? error.message : 'Could not upload. Try again.');
    } finally {
      setUploading(null);
    }
  };

  if (!internshipId) {
    return (
      <Screen>
        <Card title="No internship">
          <Text style={styles.muted}>Register an internship first to manage documents.</Text>
        </Card>
      </Screen>
    );
  }

  // Group documents by type for the checklist view
  const byType = new Map<string, DocumentMeta>();
  for (const doc of documents) {
    if (!byType.has(doc.documentType)) byType.set(doc.documentType, doc);
  }

  const requiredTypes = ['offer_letter', 'joining_proof', 'completion_certificate', 'internship_report', 'attendance_statement'] as const;

  return (
    <Screen>
      <Card title="Document Checklist" subtitle="Upload required documents for your internship">
        <Text style={styles.muted}>
          Documents are verified by your faculty coordinator. Required items must be uploaded
          before your registration can be approved.
        </Text>
      </Card>

      {requiredTypes.map((type) => {
        const doc = byType.get(type);
        const label = DOCUMENT_TYPE_LABELS[type];
        const isUploading = uploading === type;

        return (
          <Card key={type} title={label} subtitle={doc ? VERIFICATION_STATUS_LABELS[doc.verificationStatus] : 'Not uploaded'}>
            {doc ? (
              <View>
                <Text style={styles.filename}>{doc.originalFilename}</Text>
                <Text style={styles.meta}>
                  {Math.round(doc.sizeBytes / 1024)} KB • Uploaded {doc.uploadedAt.slice(0, 10)}
                </Text>
                {doc.verificationStatus === 'rejected' && doc.rejectionReason ? (
                  <Text style={styles.rejection}>Reason: {doc.rejectionReason}</Text>
                ) : null}
                <View style={styles.spacer} />
                <Button
                  label="Re-upload"
                  variant="secondary"
                  onPress={() => void pickAndUpload(type)}
                  loading={isUploading}
                />
              </View>
            ) : (
              <Button
                label="Upload"
                onPress={() => void pickAndUpload(type)}
                loading={isUploading}
              />
            )}
          </Card>
        );
      })}

      <Card title="Additional documents">
        <Text style={styles.muted}>
          Upload any other supporting documents (project report, presentation, work evidence).
        </Text>
        <View style={styles.spacer} />
        <Button
          label="Upload other document"
          variant="secondary"
          onPress={() => void pickAndUpload('other')}
          loading={uploading === 'other'}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  filename: { fontSize: fontSize.small, fontWeight: '600', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  rejection: { fontSize: fontSize.small, color: colors.danger, marginTop: spacing.xs, fontWeight: '500' },
  spacer: { height: spacing.md },
});
