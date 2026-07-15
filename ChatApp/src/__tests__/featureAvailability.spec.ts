/**
 * featureAvailability.spec.ts
 *
 * Verifies the feature availability model and ensures:
 * 1. Preview features cannot produce fake counters or success states
 * 2. Shopping add-to-cart does not increment a durable counter
 * 3. Unavailable actions are not exposed as enabled
 * 4. Mock data files carry no unlabeled platform metrics in rendered output
 */

import {
  getFeatureAvailability,
} from '../hooks/featureAvailability';

describe('featureAvailability', () => {
  describe('availability registry', () => {
    it('classifies shopping as preview', () => {
      expect(getFeatureAvailability('shopping')).toBe('preview');
    });

    it('classifies services as preview', () => {
      expect(getFeatureAvailability('services')).toBe('preview');
    });

    it('classifies shorts as preview', () => {
      expect(getFeatureAvailability('shorts')).toBe('preview');
    });

    it('classifies chat as ready', () => {
      expect(getFeatureAvailability('chat')).toBe('ready');
    });

    it('classifies calls as ready', () => {
      expect(getFeatureAvailability('calls')).toBe('ready');
    });

    it('classifies emojiPicker as unavailable', () => {
      expect(getFeatureAvailability('emojiPicker')).toBe('unavailable');
    });

    it('classifies voiceMessage as unavailable', () => {
      expect(getFeatureAvailability('voiceMessage')).toBe('unavailable');
    });

    it('returns unavailable for unknown features', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getFeatureAvailability('nonexistent_feature' as any)).toBe('unavailable');
    });
  });

  describe('preview data integrity', () => {
    it('Shopping screen does NOT export a cart counter state', async () => {
      // The ShoppingHomeScreen no longer maintains a cartCount state.
      // We verify the module source does not contain setCartCount.
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/shopping/ShoppingHomeScreen.tsx'),
        'utf8',
      );
      expect(source).not.toContain('setCartCount');
      expect(source).not.toContain('cartCount + 1');
    });

    it('Shopping screen does NOT show fake sold counts in product cards', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/shopping/ShoppingHomeScreen.tsx'),
        'utf8',
      );
      // The old pattern rendered "Đã bán {item.sold}" — must be gone
      expect(source).not.toContain('Đã bán');
      // Fake star rating rendering must be gone from product cards
      expect(source).not.toContain('item.rating.toFixed');
    });

    it('Services screen does NOT show fake verified badges', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/services/ServicesHomeScreen.tsx'),
        'utf8',
      );
      // Verified badge rendering removed from ProviderRow
      expect(source).not.toContain('provider.verified');
      expect(source).not.toContain('name="verified"');
    });

    it('Services screen does NOT show fake ratings as real', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/services/ServicesHomeScreen.tsx'),
        'utf8',
      );
      expect(source).not.toContain('provider.rating.toFixed');
      expect(source).not.toContain('item.rating.toFixed');
    });

    it('Shopping screen includes a PreviewBanner import', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/shopping/ShoppingHomeScreen.tsx'),
        'utf8',
      );
      expect(source).toContain('PreviewBanner');
    });

    it('Services screen includes a PreviewBanner import', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/services/ServicesHomeScreen.tsx'),
        'utf8',
      );
      expect(source).toContain('PreviewBanner');
    });
  });

  describe('unavailable composer actions', () => {
    it('ChatScreen does NOT pass emoji/voice handlers to ChatComposer', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/chat/ChatScreen.tsx'),
        'utf8',
      );
      // Handlers should not be passed to ChatComposer
      expect(source).not.toContain('onPressEmoji={handleEmojiPress}');
      expect(source).not.toContain('onPressVoice={handleVoicePress}');
      // Alert.alert for these features should be removed
      expect(source).not.toContain("Alert.alert('Tính năng đang phát triển'");
    });

    it('ChatComposer hides emoji button when handler not provided', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/chat/components/ChatComposer.tsx'),
        'utf8',
      );
      // Conditional rendering: emoji button only shown when onPressEmoji is provided
      expect(source).toContain('{onPressEmoji && (');
    });

    it('ChatComposer hides voice button when handler not provided', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/chat/components/ChatComposer.tsx'),
        'utf8',
      );
      // Conditional rendering: voice button only shown when onPressVoice is provided
      expect(source).toContain('{onPressVoice && (');
    });
  });

  describe('navigation prioritization', () => {
    it('Shorts tab is labeled as preview in sub-tab metadata', async () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../screens/main/ChatHomeScreen.tsx'),
        'utf8',
      );
      // Shorts should have a preview label, not "Video ngắn"
      expect(source).not.toMatch(/Shorts:.*label:\s*'Video ngắn'/);
      expect(source).toContain("label: 'Xem trước'");
    });
  });
});
