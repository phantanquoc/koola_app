import React from 'react';
import { KoolaText } from '../ui';
import { useTranslationPrefs } from '../services/translation/translationPrefs';
import { useAutoTranslate } from '../services/translation/useAutoTranslate';

/**
 * Italic muted subtitle rendered directly beneath MessageText inside the chat
 * bubble wrapper. Shows a translated version of the message when available,
 * collapsed to one truncated line by default and expanded on tap.
 *
 * Renders null when:
 *   - no translation state exists AND no request is in flight
 *   - the auto-translate predicate filtered this message out (same language,
 *     own message, system message, trivial input)
 *
 * Never touches bubble geometry — sizing, alignment, insets, and metadata strip
 * are owned by the parent MessageItem. This component only occupies vertical
 * space when it actually has content to show.
 */

export interface TranslatedTextProps {
  message: {
    _id: string | number;
    text?: string;
    user?: { _id?: string | number };
    system?: boolean;
  };
  currentUserId: string;
}

const TranslatedText: React.FC<TranslatedTextProps> = ({ message, currentUserId }) => {
  const { preferredLanguage, autoTranslateEnabled } = useTranslationPrefs();

  const messageId = String(message._id);
  const text = typeof message.text === 'string' ? message.text : '';
  const isOwn = String(message.user?._id ?? '') === currentUserId;
  const isSystem = Boolean(message.system);

  const { translatedText, isLoading, error, collapsed, toggle } = useAutoTranslate({
    messageId,
    text,
    isOwn,
    isSystem,
    preferredLanguage,
    autoTranslateEnabled,
  });

  // Nothing to render: no result yet, no in-flight request, and no error slot.
  if (!isLoading && !translatedText && !error) return null;

  // Silent-failure contract (design.md D6): auto-translate errors leave no
  // visible trace. The manual "Dịch" context-menu path handles its own Toast.
  if (error) return null;

  if (isLoading) {
    return (
      <KoolaText
        variant="caption"
        tone="muted"
        style={{ fontStyle: 'italic', marginTop: 4 }}
        numberOfLines={1}>
        Đang dịch…
      </KoolaText>
    );
  }

  return (
    <KoolaText
      variant="caption"
      tone="muted"
      onPress={toggle}
      style={{ fontStyle: 'italic', marginTop: 4 }}
      numberOfLines={collapsed ? 1 : undefined}>
      {translatedText}
    </KoolaText>
  );
};

export default React.memo(TranslatedText);
