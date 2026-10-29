/**
 * GroupCreateModal.spec.tsx
 *
 * chat-home-start-popup (task 6.2) — dismissal + draft lifecycle:
 * - backdrop / ✕ close an idle form and the draft is cleared for the next open
 * - while a create request is in flight the ✕ stays ENABLED and asks to
 *   confirm ("Huỷ tạo nhóm?"); cancelling keeps the form open, confirming
 *   closes it and the late success does not navigate
 * - a successful create closes the form and navigates to the new conversation
 * - a late rejection of a discarded create is ignored (no error card, no Alert,
 *   no navigation, `creating` released)
 * - the form no longer suppresses the tab dock itself
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — jest.mock factories and react-test-renderer are untyped here
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render, act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { ThemeProvider } from '../../ui/ThemeProvider';

jest.mock('react-native-vector-icons/MaterialIcons', () => {
  const ReactActual = jest.requireActual('react');
  const Stub = (props: { name: string }) =>
    ReactActual.createElement('Icon', { name: props.name });
  return { __esModule: true, default: Stub };
});

let mockConfirmSpy: jest.Mock;

jest.mock('../../ui/KoolaConfirmHost', () => ({
  koolaConfirm: (options: unknown) => mockConfirmSpy(options),
}));

jest.mock('../../services/api/apiService', () => ({
  conversationsApi: {
    createGroup: jest.fn(),
  },
  usersApi: {
    searchUsers: jest.fn(),
  },
}));

// The modal must not own dock suppression any more (the overlay owner /
// Settings do). Any use of the hook from inside the modal is a regression.
jest.mock('../../navigation/MainNavigator', () => ({
  useTabDockSuppression: jest.fn(() => {
    throw new Error('GroupCreateModal must not suppress the tab dock itself');
  }),
}));

import GroupCreateModal from '../GroupCreateModal';
import { conversationsApi, usersApi } from '../../services/api/apiService';

const ALICE = {
  _id: 'u-alice',
  displayName: 'Alice',
  email: 'alice@koola.dev',
  avatar: null,
  isOnline: true,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (err: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

// The theme provider hydrates from AsyncStorage on mount with a floating
// promise; stub it so no state update lands outside `act`.
jest.mock('../../services/storage/asyncStorage', () => ({
  asyncStorage: {
    getThemeMode: jest.fn(async () => 'system'),
    setThemeMode: jest.fn(async () => undefined),
  },
}));

function renderModal(props: Record<string, unknown>) {
  let tree: unknown;
  act(() => {
    tree = render(
      React.createElement(Wrapper, null, React.createElement(GroupCreateModal, props)),
    );
  });
  act(() => {
    jest.runAllTimers();
  });
  return tree;
}

function findAllByLabel(tree: unknown, label: string) {
  return tree.root.findAllByProps({ accessibilityLabel: label });
}

function pressFirst(tree: unknown, label: string) {
  const nodes = findAllByLabel(tree, label);
  expect(nodes.length).toBeGreaterThan(0);
  act(() => {
    // Every host + composite instance shares the same handler.
    nodes[0].props.onPress();
  });
}

function typeName(tree: unknown, text: string) {
  const input = tree.root.findAll(
    (node) =>
      typeof node.props.onChangeText === 'function' &&
      node.props.placeholder === 'Tên nhóm',
  )[0];
  expect(input).toBeTruthy();
  act(() => {
    input.props.onChangeText(text);
  });
}

async function pickAlice(tree: unknown) {
  // The query effect schedules a 250ms debounce, then the search promise
  // resolves — advance timers first, then flush the microtask chain.
  act(() => {
    userQueryInput(tree).props.onChangeText('alice');
    jest.advanceTimersByTime(300);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
    jest.runAllTimers();
  });
  const row = findAllByLabel(tree, 'Chọn Alice')[0];
  expect(row).toBeTruthy();
  act(() => {
    row.props.onPress();
  });
}

function userQueryInput(tree: unknown) {
  const input = tree.root.findAll(
    (node) =>
      typeof node.props.onChangeText === 'function' &&
      node.props.placeholder === 'Tìm theo tên hoặc email',
  )[0];
  expect(input).toBeTruthy();
  return input;
}

/**
 * Draft state as rendered: controlled input values, the selected counter and
 * the ids of the selected chips (a chip's remove button is labelled
 * "Bỏ <name> khỏi nhóm").
 */
function queryDraftState(tree: unknown) {
  const valueOf = (placeholder: string) =>
    tree.root.findAll(
      (node) =>
        typeof node.props.onChangeText === 'function' &&
        node.props.placeholder === placeholder,
    )[0]?.props.value;
  const counts: string[] = [];
  tree.root.findAll((node) => {
    const children = node.props.children;
    // KoolaText splits "Đã chọn " / "0" / " thành viên" into siblings.
    if (Array.isArray(children) && children[0] === 'Đã chọn ') {
      counts.push(`Đã chọn ${children[1]}`);
    }
    return false;
  });
  const selectedIds = tree.root
    .findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Bỏ ') &&
        node.props.accessibilityLabel.endsWith(' khỏi nhóm'),
    )
    .map((node) => node.props.accessibilityLabel as string);
  return {
    name: valueOf('Tên nhóm'),
    query: valueOf('Tìm theo tên hoặc email'),
    selectedCount: counts.length > 0 ? Number(counts[0].replace(/\D/g, '')) : null,
    selectedIds: Array.from(new Set(selectedIds)),
  };
}

function pressCreate(tree: unknown) {
  const button = findAllByLabel(
    tree,
    'Tạo nhóm mới với các thành viên đã chọn',
  )[0];
  expect(button).toBeTruthy();
  act(() => {
    button.props.onPress();
  });
}

describe('GroupCreateModal — dismissal and draft lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    mockConfirmSpy = jest.fn();
    (usersApi.searchUsers as jest.Mock).mockResolvedValue({
      items: [ALICE],
      hasMore: false,
      nextCursor: null,
    });
    (conversationsApi.createGroup as jest.Mock).mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders null when not visible', () => {
    const tree = renderModal({
      visible: false,
      onClose: jest.fn(),
      onCreated: jest.fn(),
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('backdrop closes an idle form and the draft does not leak into the next open', async () => {
    const onClose = jest.fn();
    const props = { visible: true, onClose, onCreated: jest.fn() };

    const first = renderModal(props);
    typeName(first, 'Nhóm của tôi');
    await pickAlice(first);
    expect(queryDraftState(first)).toEqual({
      name: 'Nhóm của tôi',
      query: 'alice',
      selectedCount: 1,
      selectedIds: ['Bỏ Alice khỏi nhóm'],
    });

    pressFirst(first, 'Đóng tạo nhóm');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockConfirmSpy).not.toHaveBeenCalled();
    act(() => {
      first.unmount();
    });

    // Second open: same component instance, fresh draft.
    const second = renderModal(props);
    const nameInput = second.root.findAll(
      (node) =>
        typeof node.props.onChangeText === 'function' &&
        node.props.placeholder === 'Tên nhóm',
    )[0];
    expect(nameInput.props.value).toBe('');
    expect(queryDraftState(second)).toEqual({
      name: '',
      query: '',
      selectedCount: 0,
      selectedIds: [],
    });
    expect(findAllByLabel(second, 'Bỏ chọn Alice')).toHaveLength(0);
  });

  it('✕ stays enabled while creating and asks before discarding; cancelling keeps the form open', async () => {
    const pending = deferred<{ conversation: { _id: string } }>();
    (conversationsApi.createGroup as jest.Mock).mockReturnValue(pending.promise);
    const onClose = jest.fn();
    const onCreated = jest.fn();

    const tree = renderModal({ visible: true, onClose, onCreated });
    typeName(tree, 'Nhóm của tôi');
    await pickAlice(tree);

    await act(async () => {
      pressCreate(tree);
    });

    const closeNodes = findAllByLabel(tree, 'Đóng tạo nhóm');
    expect(closeNodes.length).toBeGreaterThan(0);
    closeNodes.forEach((node) => {
      expect(node.props.disabled).not.toBe(true);
    });

    pressFirst(tree, 'Đóng tạo nhóm');
    expect(mockConfirmSpy).toHaveBeenCalledTimes(1);
    const confirmOptions = mockConfirmSpy.mock.calls[0][0];
    expect(confirmOptions.title).toBe('Huỷ tạo nhóm?');
    expect(confirmOptions.cancelLabel).toBe('Tiếp tục tạo');
    expect(confirmOptions.confirmLabel).toBe('Huỷ và đóng');
    // Not closed yet — the user has not confirmed.
    expect(onClose).not.toHaveBeenCalled();

    // Cancel path: nothing happens, the form is still there.
    act(() => {
      confirmOptions.onCancel?.();
    });
    expect(onClose).not.toHaveBeenCalled();

    // Confirm path closes the form.
    act(() => {
      confirmOptions.onConfirm();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // The late success must not navigate or resurrect anything.
    await act(async () => {
      pending.resolve({ conversation: { _id: 'conv-late' } });
      await Promise.resolve();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('hardware Back while creating asks first (owner forwards its guarded close)', async () => {
    const pending = deferred<{ conversation: { _id: string } }>();
    (conversationsApi.createGroup as jest.Mock).mockReturnValue(pending.promise);
    const onClose = jest.fn();
    const requestCloseRef = jest.fn();

    const tree = renderModal({
      visible: true,
      onClose,
      onCreated: jest.fn(),
      requestCloseRef,
    });
    typeName(tree, 'Nhóm của tôi');
    await pickAlice(tree);
    await act(async () => {
      pressCreate(tree);
    });
    expect(mockConfirmSpy).not.toHaveBeenCalled();

    // The owner's Back handler calls the ref it was given, not a raw onClose.
    // The ref is re-published on every render (its identity follows `creating`),
    // so read the latest function the modal handed over.
    const guardedClose = requestCloseRef.mock.calls
      .map((call: unknown[]) => call[0])
      .filter((fn: unknown) => typeof fn === 'function')
      .pop();
    expect(typeof guardedClose).toBe('function');
    act(() => {
      guardedClose();
    });

    expect(mockConfirmSpy).toHaveBeenCalledTimes(1);
    expect(mockConfirmSpy.mock.calls[0][0].title).toBe('Huỷ tạo nhóm?');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      mockConfirmSpy.mock.calls[0][0].onConfirm();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('discarding an in-flight create does not leave "creating" stuck on the next open', async () => {
    const pending = deferred<{ conversation: { _id: string } }>();
    (conversationsApi.createGroup as jest.Mock).mockReturnValue(pending.promise);
    const onClose = jest.fn();
    const onCreated = jest.fn();

    // The modal is always mounted (Chat Home keeps it in the tree): `visible`
    // only switches the render branch.
    const tree = renderModal({ visible: true, onClose, onCreated });
    typeName(tree, 'Nhóm của tôi');
    await pickAlice(tree);
    await act(async () => {
      pressCreate(tree);
    });

    // ✕ → confirm discard while the request is still in flight.
    pressFirst(tree, 'Đóng tạo nhóm');
    expect(mockConfirmSpy).toHaveBeenCalledTimes(1);
    act(() => {
      mockConfirmSpy.mock.calls[0][0].onConfirm();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // The owner hides the overlay (it keeps the modal mounted)…
    act(() => {
      tree.update(
        React.createElement(
          Wrapper,
          null,
          React.createElement(GroupCreateModal, { visible: false, onClose, onCreated }),
        ),
      );
    });
    // …and the user re-opens BEFORE the discarded promise settles.
    act(() => {
      tree.update(
        React.createElement(
          Wrapper,
          null,
          React.createElement(GroupCreateModal, { visible: true, onClose, onCreated }),
        ),
      );
    });
    act(() => {
      jest.runAllTimers();
    });

    // No loading state: the create button is enabled and the form is clean.
    const createButton = findAllByLabel(
      tree,
      'Tạo nhóm mới với các thành viên đã chọn',
    )[0];
    expect(createButton.props.loading).toBeFalsy();
    expect(queryDraftState(tree)).toEqual({
      name: '',
      query: '',
      selectedCount: 0,
      selectedIds: [],
    });

    // ✕ on the fresh session closes WITHOUT a confirm.
    mockConfirmSpy.mockClear();
    pressFirst(tree, 'Đóng tạo nhóm');
    expect(mockConfirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);

    // The late success of the discarded request neither navigates nor flips
    // `creating` on (which would trap the next open behind the confirm).
    act(() => {
      tree.update(
        React.createElement(
          Wrapper,
          null,
          React.createElement(GroupCreateModal, { visible: false, onClose, onCreated }),
        ),
      );
    });
    await act(async () => {
      pending.resolve({ conversation: { _id: 'conv-late' } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onCreated).not.toHaveBeenCalled();

    act(() => {
      tree.update(
        React.createElement(
          Wrapper,
          null,
          React.createElement(GroupCreateModal, { visible: true, onClose, onCreated }),
        ),
      );
    });
    const reopenedButton = findAllByLabel(
      tree,
      'Tạo nhóm mới với các thành viên đã chọn',
    )[0];
    expect(reopenedButton.props.loading).toBeFalsy();
    mockConfirmSpy.mockClear();
    pressFirst(tree, 'Đóng tạo nhóm');
    expect(mockConfirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('a late rejection of a discarded create shows no error, no alert and no navigation', async () => {
    const pending = deferred<{ conversation: { _id: string } }>();
    (conversationsApi.createGroup as jest.Mock).mockReturnValue(pending.promise);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const onCreated = jest.fn();

    const tree = renderModal({ visible: true, onClose, onCreated });
    typeName(tree, 'Nhóm của tôi');
    await pickAlice(tree);
    await act(async () => {
      pressCreate(tree);
    });

    // Discard while the request is in flight (✕ → confirm).
    pressFirst(tree, 'Đóng tạo nhóm');
    expect(mockConfirmSpy).toHaveBeenCalledTimes(1);
    act(() => {
      mockConfirmSpy.mock.calls[0][0].onConfirm();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // …and the OLD promise rejects after the discard.
    await act(async () => {
      pending.reject(new Error('boom'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    // The error card belongs to no live session.
    expect(
      tree.root.findAll((node) => node.props.children === 'boom'),
    ).toHaveLength(0);

    // Re-opening paints a clean form and ✕ closes without a confirm — i.e.
    // `creating` was released by the discarded request, not left stuck on.
    act(() => {
      tree.update(
        React.createElement(
          Wrapper,
          null,
          React.createElement(GroupCreateModal, { visible: true, onClose, onCreated }),
        ),
      );
    });
    const createButton = findAllByLabel(
      tree,
      'Tạo nhóm mới với các thành viên đã chọn',
    )[0];
    expect(createButton.props.loading).toBeFalsy();
    mockConfirmSpy.mockClear();
    pressFirst(tree, 'Đóng tạo nhóm');
    expect(mockConfirmSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('a successful create clears the draft, closes and reports the conversation', async () => {
    (conversationsApi.createGroup as jest.Mock).mockResolvedValue({
      conversation: { _id: 'conv-1' },
    });
    const onClose = jest.fn();
    const onCreated = jest.fn();

    const tree = renderModal({ visible: true, onClose, onCreated });
    typeName(tree, 'Nhóm mới');
    await pickAlice(tree);
    await act(async () => {
      pressCreate(tree);
    });

    expect(conversationsApi.createGroup).toHaveBeenCalledWith('Nhóm mới', [
      ALICE._id,
    ]);
    expect(onCreated).toHaveBeenCalledWith({ _id: 'conv-1' });
    expect(onClose).toHaveBeenCalledTimes(1);
    // resetState ran with the success: the draft is cleared.
    const nameInput = tree.root.findAll(
      (node) =>
        typeof node.props.onChangeText === 'function' &&
        node.props.placeholder === 'Tên nhóm',
    )[0];
    expect(nameInput.props.value).toBe('');
  });

  it('publishes its guarded close to the owner through requestCloseRef', () => {
    const requestCloseRef = jest.fn();
    const onClose = jest.fn();
    const tree = renderModal({
      visible: true,
      onClose,
      onCreated: jest.fn(),
      requestCloseRef,
    });

    expect(requestCloseRef).toHaveBeenCalledTimes(1);
    const guardedClose = requestCloseRef.mock.calls[0][0];
    expect(typeof guardedClose).toBe('function');
    act(() => {
      guardedClose();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      tree.unmount();
    });
    // Unmount clears the owner's reference.
    expect(requestCloseRef).toHaveBeenLastCalledWith(null);
  });
});
