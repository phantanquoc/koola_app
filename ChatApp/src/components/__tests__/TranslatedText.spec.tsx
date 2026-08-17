/**
 * TranslatedText — rendering contract.
 *
 * Verifies the subtitle lifecycle:
 *   - renders null when no translation state exists
 *   - renders "Đang dịch…" while loading
 *   - renders null on error (silent-failure per design D6)
 *   - renders collapsed single line by default and expands on tap
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — jest.mock factories use untyped rest params that tsc would otherwise flag
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render, act } from 'react-test-renderer';
import { ThemeProvider } from '../../ui/ThemeProvider';

const mockUseAutoTranslate = jest.fn();
const mockUseTranslationPrefs = jest.fn(() => ({
  preferredLanguage: 'vi',
  autoTranslateEnabled: true,
}));

jest.mock('../../services/translation/useAutoTranslate', () => ({
  useAutoTranslate: (...args) => mockUseAutoTranslate(...args),
}));

jest.mock('../../services/translation/translationPrefs', () => ({
  useTranslationPrefs: (...args) => mockUseTranslationPrefs(...args),
}));

import TranslatedText from '../TranslatedText';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'm1',
    text: 'Hello world',
    user: { _id: 'other' },
    system: false,
    ...overrides,
  };
}

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

function renderWithTheme(element: React.ReactElement) {
  return render(<Wrapper>{element}</Wrapper>);
}

describe('TranslatedText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTranslationPrefs.mockReturnValue({ preferredLanguage: 'vi', autoTranslateEnabled: true });
  });

  it('renders null when there is no translation state, no loading, and no error', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: '',
      isLoading: false,
      error: false,
      collapsed: true,
      toggle: jest.fn(),
    });

    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    // Wrapper renders ThemeProvider → outer View; find inner null: toJSON returns outer wrapper with no subtitle
    // The TranslatedText itself returns null, so the only rendered output is the ThemeProvider wrapper's children null
    const json = tree.toJSON() as any;
    // When TranslatedText returns null, the wrapper still renders but the subtitle node is absent
    const text = JSON.stringify(json);
    expect(text).not.toContain('Đang dịch');
    expect(text).not.toContain('Xin chào');
  });

  it('renders null on error (silent-failure contract)', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: '',
      isLoading: false,
      error: true,
      collapsed: true,
      toggle: jest.fn(),
    });

    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toContain('Xin chào');
    expect(text).not.toContain('Đang dịch');
  });

  it('renders "Đang dịch…" while loading', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: '',
      isLoading: true,
      error: false,
      collapsed: true,
      toggle: jest.fn(),
    });

    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Đang dịch');
  });

  it('renders translated text collapsed to one line by default and expands on tap', () => {
    const toggle = jest.fn();
    mockUseAutoTranslate.mockReturnValue({
      translatedText: 'Xin chào thế giới',
      isLoading: false,
      error: false,
      collapsed: true,
      toggle,
    });

    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Xin chào thế giới');

    // Tap should invoke toggle — find the KoolaText node with onPress
    const root = tree.root;
    const pressable = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    expect(pressable.length).toBeGreaterThan(0);
    act(() => {
      pressable[0].props.onPress();
    });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('forwards messageId/text/isOwn/isSystem derivation to useAutoTranslate', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: '',
      isLoading: false,
      error: false,
      collapsed: true,
      toggle: jest.fn(),
    });

    renderWithTheme(
      <TranslatedText
        message={{ _id: 'm-42', text: 'Hello', user: { _id: 'me' }, system: false } as any}
        currentUserId="me"
      />,
    );

    expect(mockUseAutoTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'm-42',
        text: 'Hello',
        isOwn: true,
        isSystem: false,
        preferredLanguage: 'vi',
        autoTranslateEnabled: true,
      }),
    );
  });

  it('snapshot — loading state', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: '',
      isLoading: true,
      error: false,
      collapsed: true,
      toggle: jest.fn(),
    });
    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('snapshot — collapsed translated text', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: 'Xin chào thế giới, đây là bản dịch.',
      isLoading: false,
      error: false,
      collapsed: true,
      toggle: jest.fn(),
    });
    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('snapshot — expanded translated text', () => {
    mockUseAutoTranslate.mockReturnValue({
      translatedText: 'Xin chào thế giới, đây là bản dịch đã mở rộng.',
      isLoading: false,
      error: false,
      collapsed: false,
      toggle: jest.fn(),
    });
    const tree = renderWithTheme(<TranslatedText message={makeMessage() as any} currentUserId="me" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
