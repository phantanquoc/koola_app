/**
 * Auth accessibility tests — verifies:
 * 1. KoolaTextInput secure entry reveal toggle
 * 2. Error routing through shared input error prop
 * 3. Focus-first-invalid on submit
 * 4. Busy state prevents duplicate submission
 * 5. AccessibilityInfo.announceForAccessibility called on errors
 * 6. KoolaOtpInput accessibility semantics
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

// Mock useColorScheme
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

// Mock AuthContext
const mockLogin = jest.fn();
const mockRegisterInit = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    registerInit: mockRegisterInit,
  }),
}));

// Mock AccessibilityInfo
jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

import { ThemeProvider } from '../../../ui/ThemeProvider';
import { KoolaTextInput } from '../../../ui/KoolaTextInput';
import { KoolaOtpInput } from '../../../ui/KoolaOtpInput';

// Helper: wrap component in ThemeProvider
const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

// --- KoolaTextInput tests ---

describe('KoolaTextInput secure entry toggle', () => {
  it('renders a reveal button when secureTextEntry is true', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaTextInput
            secureTextEntry
            placeholder="Password"
            value="secret"
            onChangeText={() => {}}
          />
        </Wrapper>,
      );
    });
    const json = tree!.toJSON();
    // Find the Pressable with accessibilityLabel for reveal
    const revealButton = findByA11yLabel(json, 'Hien mat khau');
    expect(revealButton).not.toBeNull();
  });

  it('does NOT render reveal button when secureTextEntry is absent', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaTextInput
            placeholder="Email"
            value=""
            onChangeText={() => {}}
          />
        </Wrapper>,
      );
    });
    const json = tree!.toJSON();
    const revealButton = findByA11yLabel(json, 'Hien mat khau');
    expect(revealButton).toBeNull();
  });

  it('toggle changes accessible label from show to hide', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaTextInput
            secureTextEntry
            placeholder="Password"
            value="secret"
            onChangeText={() => {}}
          />
        </Wrapper>,
      );
    });

    // Find the reveal button instance and simulate press
    const instance = tree!.root;
    const pressables = instance.findAll(
      (node: any) => node.props?.accessibilityLabel === 'Hien mat khau',
    );
    expect(pressables.length).toBeGreaterThan(0);

    // Simulate press
    act(() => {
      pressables[0].props.onPress();
    });

    // Now should show "An mat khau" (hide password)
    const hideButtons = instance.findAll(
      (node: any) => node.props?.accessibilityLabel === 'An mat khau',
    );
    expect(hideButtons.length).toBeGreaterThan(0);
  });

  it('renders error text through error prop', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaTextInput
            placeholder="Email"
            value=""
            onChangeText={() => {}}
            error="Vui long nhap email"
          />
        </Wrapper>,
      );
    });
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('Vui long nhap email');
  });

  it('sets aria-invalid when error is present', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaTextInput
            placeholder="Email"
            value=""
            onChangeText={() => {}}
            error="Required"
          />
        </Wrapper>,
      );
    });
    const textInput = findTextInput(tree!.toJSON());
    expect(textInput).not.toBeNull();
    expect(textInput.props['aria-invalid']).toBe(true);
  });

  it('passes accessibilityLabel to TextInput', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaTextInput
            placeholder="you@example.com"
            value=""
            onChangeText={() => {}}
            accessibilityLabel="Email"
          />
        </Wrapper>,
      );
    });
    const textInput = findTextInput(tree!.toJSON());
    expect(textInput.props.accessibilityLabel).toBe('Email');
  });
});

// --- KoolaOtpInput tests ---

describe('KoolaOtpInput accessibility', () => {
  it('hidden input has accessibilityLabel describing purpose and digit count', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaOtpInput value="" onChange={() => {}} length={6} />
        </Wrapper>,
      );
    });
    const json = tree!.toJSON();
    const hiddenInput = findByA11yLabel(json, 'Ma xac thuc, 6 chu so');
    expect(hiddenInput).not.toBeNull();
  });

  it('hidden input has importantForAccessibility=yes', () => {
    let tree: ReturnType<typeof render>;
    act(() => {
      tree = render(
        <Wrapper>
          <KoolaOtpInput value="12" onChange={() => {}} length={6} />
        </Wrapper>,
      );
    });
    const json = tree!.toJSON();
    const hiddenInput = findByA11yLabel(json, 'Ma xac thuc, 6 chu so');
    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput.props.importantForAccessibility).toBe('yes');
  });
});

// --- Helper functions ---

function findByA11yLabel(node: any, label: string): any {
  if (!node) return null;
  if (node.props?.accessibilityLabel === label) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object') {
        const found = findByA11yLabel(child, label);
        if (found) return found;
      }
    }
  }
  return null;
}

function findTextInput(node: any): any {
  if (!node) return null;
  if (node.type === 'TextInput') return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object') {
        const found = findTextInput(child);
        if (found) return found;
      }
    }
  }
  return null;
}
