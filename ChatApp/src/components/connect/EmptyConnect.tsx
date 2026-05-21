import React from 'react';
import { CATEGORY_LABELS } from '../../screens/connect/constants';
import { KoolaState } from '../../ui';

const RELATIONSHIP_LABELS: Record<string, string> = {
  partner: 'Đối tác',
  supplier: 'Nhà cung cấp',
};

interface EmptyConnectProps {
  activeCategory?: string;
  activeRelationship?: string;
  onClearFilters?: () => void;
}

const EmptyConnect: React.FC<EmptyConnectProps> = ({
  activeCategory,
  activeRelationship,
  onClearFilters,
}) => {
  let title = 'Chưa có doanh nghiệp nào';

  if (activeCategory) {
    const categoryName = CATEGORY_LABELS[activeCategory] || activeCategory;
    title = `Chưa có doanh nghiệp nào trong ngành ${categoryName}`;
  } else if (activeRelationship) {
    const relName =
      RELATIONSHIP_LABELS[activeRelationship] || activeRelationship;
    title = `Chưa có ${relName} nào được tìm thấy`;
  }

  const hasActiveFilter = Boolean(activeCategory || activeRelationship);

  return (
    <KoolaState
      icon="handshake"
      title={title}
      message="Hãy thử thay đổi bộ lọc để tìm kết quả phù hợp."
      actionLabel={hasActiveFilter ? 'Xóa bộ lọc' : undefined}
      onActionPress={hasActiveFilter ? onClearFilters : undefined}
    />
  );
};

export default EmptyConnect;
