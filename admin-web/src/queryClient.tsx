import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Shared QueryClient for admin-web (AGENTS.md §1: TanStack Query thay
 * useEffect+axios thủ công). Cache 30s, retry 1 lần — admin tool ưu tiên
 * dữ liệu tươi hơn là cache lâu.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
