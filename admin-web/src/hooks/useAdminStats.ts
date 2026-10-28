import { useQuery } from '@tanstack/react-query';
import apiClient from '../apiClient';

export interface AdminStats {
  totalPersonal: number;
  totalBusiness: number;
  pendingVerification: number;
  verifiedBusinesses: number;
  rejectedBusinesses: number;
  bannedUsers: number;
  platformAdmins: number;
  archivedUsers: number;
  slaOver72: number;
  slaDay1_3: number;
  slaFresh: number;
  expiringSoon: number;
  archivedBusinesses: number;
}

/**
 * GET /admin/stats — dùng chung key `['admin-stats']` với Businesses/Users nên
 * sidebar không tạo thêm request khi đang ở hai trang đó.
 *
 * Sidebar cần con số này để nói *việc gì đang chờ*, thay vì để người vận hành
 * mở từng trang đếm. `staleTime` 60s: badge không cần tươi hơn thế.
 */
export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => (await apiClient.get<AdminStats>('/admin/stats')).data,
    staleTime: 60_000,
  });
}
