import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../apiClient';

export interface AdminListResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * GET list chuẩn admin: trả { data, total, page, limit }.
 * Mẫu cho mọi trang mới — thay useEffect+useState thủ công.
 */
export function useAdminList<T>(key: (string | number)[], url: string, params: Record<string, unknown>, options?: { refetchOnWindowFocus?: boolean }) {
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await apiClient.get<AdminListResult<T>>(url, { params });
      return res.data;
    },
    ...(options?.refetchOnWindowFocus !== undefined ? { refetchOnWindowFocus: options.refetchOnWindowFocus } : {}),
  });
  return useMemo(
    () => ({
      rows: query.data?.data ?? [],
      total: query.data?.total ?? 0,
      ...query,
    }),
    [query],
  );
}
