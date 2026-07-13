import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { KoolaState } from './KoolaState';

// ─── KoolaEmptyState ─────────────────────────────────────────────────────────

export interface KoolaEmptyStateProps {
  title?: string;
  message?: string;
  icon?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const KoolaEmptyState: React.FC<KoolaEmptyStateProps> = ({
  title = 'Không có dữ liệu',
  message,
  icon = 'inbox',
  actionLabel,
  onActionPress,
  style,
}) => (
  <KoolaState
    icon={icon}
    title={title}
    message={message}
    actionLabel={actionLabel}
    onActionPress={onActionPress}
    style={style}
  />
);

// ─── KoolaErrorState ─────────────────────────────────────────────────────────

export interface KoolaErrorStateProps {
  title?: string;
  message?: string;
  icon?: string;
  actionLabel?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const KoolaErrorState: React.FC<KoolaErrorStateProps> = ({
  title = 'Đã xảy ra lỗi',
  message = 'Vui lòng thử lại sau',
  icon = 'error-outline',
  actionLabel = 'Thử lại',
  onRetry,
  style,
}) => (
  <KoolaState
    icon={icon}
    title={title}
    message={message}
    actionLabel={actionLabel}
    onActionPress={onRetry}
    style={style}
    accessibilityRole="alert"
    accessibilityLiveRegion="assertive"
  />
);

// ─── KoolaOfflineState ───────────────────────────────────────────────────────

export interface KoolaOfflineStateProps {
  title?: string;
  message?: string;
  icon?: string;
  actionLabel?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const KoolaOfflineState: React.FC<KoolaOfflineStateProps> = ({
  title = 'Không có kết nối',
  message = 'Kiểm tra kết nối mạng và thử lại',
  icon = 'wifi-off',
  actionLabel = 'Thử lại',
  onRetry,
  style,
}) => (
  <KoolaState
    icon={icon}
    title={title}
    message={message}
    actionLabel={actionLabel}
    onActionPress={onRetry}
    style={style}
    accessibilityRole="alert"
    accessibilityLiveRegion="polite"
  />
);

// ─── KoolaLoadingState ──────────────────────────────────────────────────────

export interface KoolaLoadingStateProps {
  title?: string;
  message?: string;
  style?: StyleProp<ViewStyle>;
}

export const KoolaLoadingState: React.FC<KoolaLoadingStateProps> = ({
  title = 'Đang tải',
  message,
  style,
}) => (
  <KoolaState
    loading
    title={title}
    message={message}
    style={style}
    accessibilityLiveRegion="polite"
  />
);
