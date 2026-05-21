import React from 'react';
import { KoolaState } from '../../ui';

interface ListErrorStateProps {
  message?: string;
  onRetry: () => void;
}

const ListErrorState: React.FC<ListErrorStateProps> = ({
  message,
  onRetry,
}) => {
  return (
    <KoolaState
      icon="wifi-off"
      title="Không thể tải dữ liệu"
      message={message || 'Kiểm tra kết nối mạng và thử lại.'}
      actionLabel="Thử lại"
      onActionPress={onRetry}
    />
  );
};

export default ListErrorState;
