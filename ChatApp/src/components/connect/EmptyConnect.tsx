import React from 'react';
import { CATEGORY_LABELS } from '../../screens/connect/constants';
import { KoolaState } from '../../ui';
import type { BusinessSort } from '../../types';

const RELATIONSHIP_LABELS: Record<string, string> = {
  partner: 'Đối tác',
  supplier: 'Nhà cung cấp',
};

interface EmptyConnectProps {
  activeCategory?: string;
  activeRelationship?: string;
  activeProvince?: string;
  activeSort?: BusinessSort;
  onClearFilters?: () => void;
}

const EmptyConnect: React.FC<EmptyConnectProps> = ({
  activeCategory,
  activeRelationship,
  activeProvince,
  activeSort,
  onClearFilters,
}) => {
  const hasActiveFilter = Boolean(
    activeCategory || activeRelationship || activeProvince || (activeSort && activeSort !== 'latest'),
  );

  let title = 'Chưa có doanh nghiệp nào';

  if (activeCategory) {
    const categoryName = CATEGORY_LABELS[activeCategory] || activeCategory;
    title = `Chưa có doanh nghiệp nào trong ngành ${categoryName}`;
  } else if (activeRelationship) {
    const relName =
      RELATIONSHIP_LABELS[activeRelationship] || activeRelationship;
    title = `Chưa có ${relName} nào được tìm thấy`;
  } else if (activeProvince) {
    title = `Chưa có doanh nghiệp nào tại ${activeProvince}`;
  }

  // When no filters are active, show empathetic message without "change filters" instruction
  const message = hasActiveFilter
    ? 'Hãy thử thay đổi bộ lọc để tìm kết quả phù hợp.'
    : 'Kéo xuống để làm mới hoặc tìm kiếm theo từ khóa.';

  return (
    <KoolaState
      icon="handshake"
      title={title}
      message={message}
      actionLabel={hasActiveFilter ? 'Xóa bộ lọc' : undefined}
      onActionPress={hasActiveFilter ? onClearFilters : undefined}
    />
  );
};

export default EmptyConnect;
