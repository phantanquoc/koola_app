/**
 * useConversationQuickActions.spec.ts
 *
 * Optimistic pin/mute with rollback + toasts, pin-limit toast, clear only
 * after koolaConfirm confirm (task 7.2). Rendered through a harness component
 * (no hook-testing library in the project).
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — jest.mock factories use untyped rest params that tsc would otherwise flag
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render, act } from 'react-test-renderer';
import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../../../services/db/connection';
import { runMigrations } from '../../../services/db/migrations';
import * as conversationRepository from '../../../services/db/conversationRepository';
import { clearAll as clearBroadcaster } from '../../../services/db/invalidationBroadcaster';

const mockUpdatePrefs = jest.fn();
const mockClear = jest.fn();
jest.mock('../../../services/api/apiService', () => ({
  conversationsApi: {
    updatePrefs: (...args: unknown[]) => mockUpdatePrefs(...args),
    clear: (...args: unknown[]) => mockClear(...args),
  },
}));

const mockToastShow = jest.fn();
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

const mockConfirmCalls: Array<{ options: Record<string, unknown> }> = [];
jest.mock('../../../ui/KoolaConfirmHost', () => ({
  koolaConfirm: (options: Record<string, unknown>) => {
    mockConfirmCalls.push({ options });
  },
}));

import {
  useConversationQuickActions,
  type QuickAction,
} from '../useConversationQuickActions';
import type { Conversation } from '../../../types';

let db: ReturnType<typeof open>;
let _dbCounter = 0;

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    _id: `c_${Math.random().toString(36).slice(2)}`,
    type: 'direct',
    members: [],
    createdBy: 'me',
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function seedRows(convs: Conversation[]) {
  conversationRepository.upsertMany(
    convs.map((c) => ({
      id: c._id,
      type: c.type,
      name: c.name ?? null,
      avatarKey: c.avatar ?? null,
      members: c.members,
      lastMessagePreview: c.lastMessagePreview ?? null,
      lastMessageAt: c.lastMessageAt ?? 0,
      unreadCount: c.unreadCount ?? 0,
      pinned: c.pinned ?? false,
      archived: false,
      mutedUntil: c.mutedUntil ?? null,
      clearedAt: c.clearedAt ?? null,
      updatedAt: c.updatedAt,
    })),
  );
}

type HookApi = ReturnType<typeof useConversationQuickActions>;

function renderHookApi() {
  const results: HookApi[] = [];
  const Harness: React.FC<{ initial: Conversation[] }> = ({ initial }) => {
    const [convs, set] = React.useState<Conversation[]>(initial);
    results.push(
      useConversationQuickActions({ localFirstEnabled: true, setConversations: set }),
    );
    (results as unknown as { __convs?: Conversation[] }).__convs = convs;
    return null;
  };
  let tree!: { unmount: () => void };
  act(() => {
    tree = render(
      React.createElement(Harness, { initial: [] }),
    ) as typeof tree;
  });
  return {
    get current(): HookApi {
      return results[results.length - 1];
    },
    get convs(): Conversation[] {
      return (results as unknown as { __convs: Conversation[] }).__convs;
    },
    unmount: () => tree.unmount(),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  _dbCounter++;
  db = open({ name: `test_quick_actions_${_dbCounter}` });
  _setDbForTesting(db as any);
  runMigrations();
  clearBroadcaster();
  jest.clearAllMocks();
  mockConfirmCalls.length = 0;
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

describe('useConversationQuickActions', () => {
  it('pin applies optimistically then reconciles with the server response', async () => {
    const conv = makeConv();
    seedRows([conv]);
    mockUpdatePrefs.mockResolvedValue({
      conversationId: conv._id,
      pinned: true,
      mutedUntil: null,
      clearedAt: null,
    });
    const h = renderHookApi();

    await act(async () => {
      h.current.togglePin(conv);
    });
    // Optimistic write landed immediately.
    expect(conversationRepository.getById(conv._id)?.pinned).toBe(true);
    await flush();

    expect(mockUpdatePrefs).toHaveBeenCalledWith(conv._id, { pinned: true });
    expect(conversationRepository.getById(conv._id)?.pinned).toBe(true);
    expect(mockToastShow).not.toHaveBeenCalled();
    h.unmount();
  });

  it('rolls back and toasts on API failure', async () => {
    const conv = makeConv();
    seedRows([conv]);
    mockUpdatePrefs.mockRejectedValue(new Error('network'));
    const h = renderHookApi();

    await act(async () => {
      h.current.togglePin(conv);
    });
    await flush();

    expect(conversationRepository.getById(conv._id)?.pinned).toBe(false);
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Không thể cập nhật hội thoại. Thử lại.' }),
    );
    h.unmount();
  });

  it('shows the pin-limit toast when the server rejects the 6th pin', async () => {
    const conv = makeConv();
    seedRows([conv]);
    mockUpdatePrefs.mockRejectedValue({
      response: { data: { code: 'PIN_LIMIT_REACHED' } },
    });
    const h = renderHookApi();

    await act(async () => {
      h.current.togglePin(conv);
    });
    await flush();

    expect(conversationRepository.getById(conv._id)?.pinned).toBe(false);
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Chỉ ghim tối đa 5 hội thoại' }),
    );
    h.unmount();
  });

  it('mute sends the duration and unmute sends off', async () => {
    const conv = makeConv();
    seedRows([conv]);
    mockUpdatePrefs.mockResolvedValue({
      conversationId: conv._id,
      pinned: false,
      mutedUntil: new Date(Date.now() + 8 * 3600_000).toISOString(),
      clearedAt: null,
    });
    const h = renderHookApi();

    await act(async () => {
      h.current.muteFor(conv, '8h');
    });
    await flush();
    expect(mockUpdatePrefs).toHaveBeenCalledWith(conv._id, {
      muteDuration: '8h',
    });

    mockUpdatePrefs.mockResolvedValue({
      conversationId: conv._id,
      pinned: false,
      mutedUntil: null,
      clearedAt: null,
    });
    await act(async () => {
      h.current.unmute({ ...conv, mutedUntil: new Date(Date.now() + 1000).toISOString() });
    });
    await flush();
    expect(mockUpdatePrefs).toHaveBeenCalledWith(conv._id, {
      muteDuration: 'off',
    });
    h.unmount();
  });

  it('clear asks for confirm first and only calls the API after confirm', async () => {
    const conv = makeConv();
    seedRows([conv]);
    const clearedIso = new Date().toISOString();
    mockClear.mockResolvedValue({
      conversationId: conv._id,
      pinned: false,
      mutedUntil: null,
      clearedAt: clearedIso,
    });
    const h = renderHookApi();

    act(() => {
      h.current.clearConversation(conv);
    });
    // Sheet shown via koolaConfirm — API not yet called.
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockConfirmCalls).toHaveLength(1);
    expect(mockConfirmCalls[0].options).toMatchObject({
      title: 'Xoá hội thoại?',
      destructive: true,
    });

    await act(async () => {
      (mockConfirmCalls[0].options.onConfirm as () => void)();
    });
    await flush();

    expect(mockClear).toHaveBeenCalledWith(conv._id);
    expect(conversationRepository.getById(conv._id)).toBeNull();
    h.unmount();
  });

  it('clear failure leaves rows untouched and toasts', async () => {
    const conv = makeConv();
    seedRows([conv]);
    mockClear.mockRejectedValue(new Error('500'));
    const h = renderHookApi();

    act(() => {
      h.current.clearConversation(conv);
    });
    await act(async () => {
      (mockConfirmCalls[0].options.onConfirm as () => void)();
    });
    await flush();

    expect(conversationRepository.getById(conv._id)).not.toBeNull();
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Không thể xoá hội thoại. Thử lại.' }),
    );
    h.unmount();
  });

  it('quickAction routes pin / mute / clear; muted mute-action unmutes', async () => {
    const conv = makeConv();
    seedRows([conv]);
    mockUpdatePrefs.mockResolvedValue({
      conversationId: conv._id,
      pinned: true,
      mutedUntil: null,
      clearedAt: null,
    });
    const h = renderHookApi();

    await act(async () => {
      h.current.quickAction(conv, 'pin' as QuickAction);
    });
    await flush();
    expect(mockUpdatePrefs).toHaveBeenCalledWith(conv._id, { pinned: true });

    // Muted → unmute immediately.
    await act(async () => {
      h.current.quickAction(
        { ...conv, mutedUntil: new Date(Date.now() + 1000).toISOString() },
        'mute' as QuickAction,
      );
    });
    await flush();
    expect(mockUpdatePrefs).toHaveBeenCalledWith(conv._id, {
      muteDuration: 'off',
    });

    // Unmuted → opens the sheet on the mute view (no API call yet).
    const before = mockUpdatePrefs.mock.calls.length;
    act(() => {
      h.current.quickAction(conv, 'mute' as QuickAction);
    });
    expect(mockUpdatePrefs.mock.calls.length).toBe(before);
    expect(h.current.sheetTarget?._id).toBe(conv._id);
    h.unmount();
  });
});
