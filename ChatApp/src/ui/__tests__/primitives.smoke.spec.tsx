/**
 * Render-smoke test: ensures each migrated primitive renders without error
 * in both light and dark palettes.
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';

// Mock AsyncStorage before any component imports
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

// Mock useColorScheme to control system theme
let mockColorScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

import { ThemeProvider } from '../ThemeProvider';
import { KoolaText } from '../KoolaText';
import { KoolaSurface } from '../KoolaSurface';
import { KoolaButton } from '../KoolaButton';
import { KoolaIconButton } from '../KoolaIconButton';
import { KoolaTextInput } from '../KoolaTextInput';
import { KoolaBadge } from '../KoolaBadge';
import { KoolaChip } from '../KoolaChip';
import { KoolaDivider } from '../KoolaDivider';
import { KoolaSkeleton } from '../KoolaSkeleton';
import { KoolaState } from '../KoolaState';

// Helper: wrap component in ThemeProvider
const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

const primitives = [
  { name: 'KoolaText', el: <KoolaText>Hello</KoolaText> },
  { name: 'KoolaSurface', el: <KoolaSurface /> },
  { name: 'KoolaButton', el: <KoolaButton title="Test" onPress={() => {}} /> },
  { name: 'KoolaIconButton', el: <KoolaIconButton icon="close" onPress={() => {}} /> },
  { name: 'KoolaTextInput', el: <KoolaTextInput placeholder="type" /> },
  { name: 'KoolaBadge', el: <KoolaBadge label="New" /> },
  { name: 'KoolaChip', el: <KoolaChip label="Tag" onPress={() => {}} /> },
  { name: 'KoolaDivider', el: <KoolaDivider /> },
  { name: 'KoolaSkeleton', el: <KoolaSkeleton /> },
  { name: 'KoolaState', el: <KoolaState title="Empty" message="No items" /> },
];

describe('Primitive smoke render', () => {
  for (const { name, el } of primitives) {
    it(`${name} renders in light palette without error`, () => {
      mockColorScheme = 'light';
      let tree: ReturnType<typeof render> | undefined;
      act(() => {
        tree = render(<Wrapper>{el}</Wrapper>);
      });
      expect(tree?.toJSON()).not.toBeNull();
    });

    it(`${name} renders in dark palette without error`, () => {
      mockColorScheme = 'dark';
      let tree: ReturnType<typeof render> | undefined;
      act(() => {
        tree = render(<Wrapper>{el}</Wrapper>);
      });
      expect(tree?.toJSON()).not.toBeNull();
    });
  }
});
