/**
 * MessageItem — translation slot snapshot (task 5.2).
 *
 * Verifies: the bubble preserves geometry with and without a translation,
 * and the `translation` marker on IMessage correctly gates the TranslatedText
 * mount. Snapshot form ensures no unintended layout drift.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — jest.mock factories + test scaffolding use untyped helpers
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render } from 'react-test-renderer';
import { ThemeProvider } from '../../../../ui/ThemeProvider';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Stub heavy children so snapshots stay focused on structure + the translation gate.

jest.mock('../../../../components/TranslatedText', () => {
  const ReactMock = require('react');
  return {
    __esModule: true,
    default: (props) => ReactMock.createElement('Text', { testID: 'TranslatedText', _id: props.message._id }, 'translated'),
  };
});

jest.mock('../../../../components/moments/StoryReferenceCard', () => () => null);
jest.mock('../../../../components/ReactionDisplay', () => () => null);
jest.mock('../../../../components/UserAvatar', () => () => null);

// GiftedChat Message / MessageText → passthrough stubs without react-native require
jest.mock('react-native-gifted-chat', () => {
  const ReactMock = require('react');
  return {
    Message: (props) => {
      const bubble = props.renderBubble
        ? props.renderBubble({
            currentMessage: props.currentMessage,
            nextMessage: props.nextMessage,
            previousMessage: props.previousMessage,
            position: props.position,
            onLongPress: props.onLongPress,
            renderMessageImage: props.renderMessageImage,
            renderMessageVideo: props.renderMessageVideo,
            renderCustomView: props.renderCustomView,
          })
        : null;
      return ReactMock.createElement('View', { testID: 'GiftedMessage' }, bubble);
    },
    MessageText: (props) => ReactMock.createElement('Text', { testID: 'MessageText' }, props.currentMessage?.text ?? ''),
  };
});

import MessageItem, { makeMessageItemStyles } from '../MessageItem';
import type { IMessage } from 'react-native-gifted-chat';

function makeDummyTokens() {
  const semantic: any = {
    bg: { canvas: '#fff' },
    surface: { level0: '#fafafa', level1: '#fff', level2: '#f5f5f5', overlay: 'rgba(0,0,0,0.5)' },
    text: { primary: '#111', muted: '#888', faint: '#aaa', onAction: '#fff' },
    action: { primary: '#1976d2', primaryPressed: '#1565c0', primarySoft: '#e3f2fd' },
    signal: { selected: '#1976d2', unread: '#ff4081' },
    status: { success: '#4caf50', warning: '#ff9800', danger: '#e53935' },
    border: { subtle: '#e0e0e0', strong: '#9e9e9e' },
    focus: { ring: '#1976d2' },
    link: '#1976d2',
    brand: { red: '#e53935', blue: '#1976d2', green: '#43a047' },
  };
  const component: any = {
    chatBubble: {
      own: { bg: semantic.action.primarySoft, text: semantic.text.primary },
      other: { bg: semantic.surface.level2, text: semantic.text.primary, border: semantic.border.subtle },
    },
    tab: { active: semantic.action.primary, inactive: semantic.text.muted, dock: { fill: semantic.surface.level1, tint: semantic.action.primarySoft, sheen: semantic.surface.level2, hairline: semantic.border.subtle, bottomLine: semantic.border.subtle } },
    composer: { surface: { fill: semantic.surface.level1, tint: semantic.action.primarySoft, sheen: semantic.surface.level2, hairline: semantic.border.subtle, bottomLine: semantic.border.subtle } },
    sheet: { surface: { fill: semantic.surface.level1, tint: semantic.action.primarySoft, sheen: semantic.surface.level2, hairline: semantic.border.subtle, bottomLine: semantic.border.subtle } },
  };
  return { semantic, component };
}

function makeTokensAndStyles() {
  const { semantic, component } = makeDummyTokens();
  const styles = makeMessageItemStyles(component, semantic);
  return { semantic, component, styles, tokens: { semantic, component } as any };
}

function makeMessage(overrides: Partial<IMessage & Record<string, unknown>> = {}): IMessage & Record<string, unknown> {
  return {
    _id: 'm1',
    text: 'Hello world',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    user: { _id: 'other' },
    ...overrides,
  } as IMessage & Record<string, unknown>;
}

function makeProps(overrides: Partial<React.ComponentProps<typeof MessageItem>> = {}) {
  const { styles, tokens } = makeTokensAndStyles();
  return {
    styles,
    tokens,
    currentUserId: 'me',
    isHighlighted: false,
    onRetry: jest.fn(),
    getReactionPressHandler: () => jest.fn(),
    position: 'left' as const,
    currentMessage: makeMessage(),
    previousMessage: undefined,
    nextMessage: undefined,
    user: { _id: 'me' } as any,
    ...overrides,
  } as React.ComponentProps<typeof MessageItem>;
}

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

function renderWithTheme(element: React.ReactElement) {
  return render(<Wrapper>{element}</Wrapper>);
}

describe('MessageItem — translation slot', () => {
  it('without translation: TranslatedText is not mounted', () => {
    const props = makeProps({
      currentMessage: makeMessage({ text: 'Hello', translation: undefined }),
    });
    const tree = renderWithTheme(<MessageItem {...props} />);
    const root = tree.root;
    const translated = root.findAll((n: any) => n.props?.testID === 'TranslatedText');
    expect(translated.length).toBe(0);
  });

  it('with translation marker: TranslatedText is mounted', () => {
    const props = makeProps({
      currentMessage: makeMessage({ text: 'Hello', translation: { text: 'Xin chào' } } as any),
    });
    const tree = renderWithTheme(<MessageItem {...props} />);
    const root = tree.root;
    const translated = root.findAll((n: any) => n.props?.testID === 'TranslatedText');
    expect(translated.length).toBe(1);
  });

  it('system or empty-text messages do not mount TranslatedText even with translation marker', () => {
    // No text → gate `msg.text && translation` fails
    const emptyTextProps = makeProps({
      currentMessage: makeMessage({ text: '', translation: { text: 'Xin chào' } } as any),
    });
    const emptyTree = renderWithTheme(<MessageItem {...emptyTextProps} />);
    expect(emptyTree.root.findAll((n: any) => n.props?.testID === 'TranslatedText').length).toBe(0);
  });

  it('snapshot — without translation', () => {
    const props = makeProps({
      currentMessage: makeMessage({ text: 'Hello world' }),
    });
    const tree = renderWithTheme(<MessageItem {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('snapshot — with translation', () => {
    const props = makeProps({
      currentMessage: makeMessage({ text: 'Hello world', translation: { text: 'Xin chào thế giới' } } as any),
    });
    const tree = renderWithTheme(<MessageItem {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('snapshot — failed message with translation (failed wrapper coexists with subtitle)', () => {
    const props = makeProps({
      currentMessage: makeMessage({ text: 'Hello', failed: true, translation: { text: 'Xin chào' } } as any),
    });
    const tree = renderWithTheme(<MessageItem {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
