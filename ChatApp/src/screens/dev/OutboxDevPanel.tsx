/**
 * OutboxDevPanel.tsx
 *
 * __DEV__ only — not registered in production builds.
 *
 * Sections:
 *   1. Counters — all 6 outbox_metrics counters + dead_letter_rate
 *   2. Dead-Letter list — each row with op_type, conversation_id, last_error, Retry/Discard
 *   3. Pause/Resume toggle — reflects outboxProcessor.isPaused()
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import * as outboxRepository from '../../services/db/outboxRepository';
import * as outboxProcessor from '../../services/sync/outboxProcessor';
import * as messageRepository from '../../services/db/messageRepository';

interface DeadLetterRow {
  id: string;
  op_type: string;
  conversation_id: string;
  message_id: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface Metrics {
  enqueued_total: number;
  inflight_started_total: number;
  done_total: number;
  dead_letter_total: number;
  retry_total: number;
  watchdog_reset_total: number;
  dead_letter_rate: number;
  sample: number;
}

function loadMetrics(): Metrics {
  const raw = outboxRepository.getMetrics();
  const { rate, sample } = outboxRepository.getDeadLetterRate();
  return {
    enqueued_total: raw['enqueued_total'] ?? 0,
    inflight_started_total: raw['inflight_started_total'] ?? 0,
    done_total: raw['done_total'] ?? 0,
    dead_letter_total: raw['dead_letter_total'] ?? 0,
    retry_total: raw['retry_total'] ?? 0,
    watchdog_reset_total: raw['watchdog_reset_total'] ?? 0,
    dead_letter_rate: rate,
    sample,
  };
}

const OutboxDevPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics>(loadMetrics);
  const [deadLetterRows, setDeadLetterRows] = useState<DeadLetterRow[]>([]);
  const [paused, setPaused] = useState(outboxProcessor.isPaused());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setMetrics(loadMetrics());
    setDeadLetterRows(outboxRepository.getDeadLetterRows());
    setPaused(outboxProcessor.isPaused());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleTogglePause = useCallback(() => {
    if (outboxProcessor.isPaused()) {
      outboxProcessor.resume();
    } else {
      outboxProcessor.pause();
    }
    setPaused(outboxProcessor.isPaused());
  }, []);

  const handleRetry = useCallback((row: DeadLetterRow) => {
    outboxRepository.markPendingForRetry(row.id);
    if (row.message_id) {
      // Flip the messages row back to pending so UI updates immediately
      try {
        messageRepository.markPendingFromRetry(row.message_id);
      } catch {}
    }
    refresh();
  }, [refresh]);

  const handleDiscard = useCallback((row: DeadLetterRow) => {
    Alert.alert(
      'Discard',
      `Discard outbox row ${row.id.slice(0, 8)}...?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            // Hard-delete the outbox row
            outboxRepository.deleteRow(row.id);
            if (row.message_id) {
              try {
                messageRepository.deleteById(row.message_id);
              } catch {}
            }
            refresh();
          },
        },
      ],
    );
  }, [refresh]);

  const ratePercent = (metrics.dead_letter_rate * 100).toFixed(1);
  const rateColor =
    metrics.dead_letter_rate >= 0.05
      ? '#EF4444'
      : metrics.dead_letter_rate >= 0.03
      ? '#F97316'
      : metrics.dead_letter_rate >= 0.02
      ? '#EAB308'
      : '#10B981';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.title}>Outbox Dev Panel</Text>
      <Text style={styles.subtitle}>(DEV only — not visible in production)</Text>

      {/* ─── Pause/Resume ─────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Processor</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[styles.value, paused ? styles.paused : styles.running]}>
            {paused ? 'PAUSED' : 'RUNNING'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.button, paused ? styles.buttonResume : styles.buttonPause]}
          onPress={handleTogglePause}
          accessibilityLabel={paused ? 'Resume outbox processor' : 'Pause outbox processor'}>
          <Text style={styles.buttonText}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Counters ─────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Counters</Text>
        {(
          [
            ['enqueued_total', metrics.enqueued_total],
            ['inflight_started_total', metrics.inflight_started_total],
            ['done_total', metrics.done_total],
            ['dead_letter_total', metrics.dead_letter_total],
            ['retry_total', metrics.retry_total],
            ['watchdog_reset_total', metrics.watchdog_reset_total],
          ] as [string, number][]
        ).map(([key, val]) => (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{key}:</Text>
            <Text style={styles.value}>{val}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.label}>dead_letter_rate:</Text>
          <Text style={[styles.value, { color: rateColor }]}>
            {ratePercent}% (sample={metrics.sample})
          </Text>
        </View>
      </View>

      {/* ─── Dead-Letter Rows ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Dead-Letter Rows ({deadLetterRows.length})
        </Text>
        {deadLetterRows.length === 0 && (
          <Text style={styles.emptyText}>No dead-letter rows</Text>
        )}
        {deadLetterRows.map((row) => {
          let errorCode = 'unknown';
          try {
            const parsed = JSON.parse(row.last_error ?? '{}') as { code?: string };
            errorCode = parsed.code ?? 'unknown';
          } catch {}
          return (
            <View key={row.id} style={styles.deadLetterRow}>
              <Text style={styles.deadLetterOp}>{row.op_type}</Text>
              <Text style={styles.deadLetterDetail}>
                conv: {row.conversation_id.slice(0, 12)}...
              </Text>
              {row.message_id && (
                <Text style={styles.deadLetterDetail}>
                  msg: {row.message_id.slice(0, 12)}...
                </Text>
              )}
              <Text style={styles.deadLetterError}>error: {errorCode}</Text>
              <View style={styles.deadLetterActions}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonResume]}
                  onPress={() => handleRetry(row)}
                  accessibilityLabel="Retry this outbox row">
                  <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPause]}
                  onPress={() => handleDiscard(row)}
                  accessibilityLabel="Discard this outbox row">
                  <Text style={styles.buttonText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.bottomPad} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', margin: 16, marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#9CA3AF', marginHorizontal: 16, marginBottom: 8 },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, color: '#6B7280' },
  value: { fontSize: 13, fontWeight: '600', color: '#111827' },
  paused: { color: '#EF4444' },
  running: { color: '#10B981' },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  buttonPause: { backgroundColor: '#EF4444' },
  buttonResume: { backgroundColor: '#10B981' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  deadLetterRow: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginTop: 8,
  },
  deadLetterOp: { fontSize: 13, fontWeight: '700', color: '#EF4444', marginBottom: 4 },
  deadLetterDetail: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  deadLetterError: { fontSize: 12, color: '#F97316', marginBottom: 8 },
  deadLetterActions: { flexDirection: 'row', gap: 8 },
  bottomPad: { height: 40 },
});

export default OutboxDevPanel;
