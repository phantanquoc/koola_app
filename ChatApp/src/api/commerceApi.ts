import ENV from '../config/env';

export interface RemoteProduct {
  _id: string;
  name: string;
  price: number;
  category: string;
  imageKey?: string | null;
}

export async function fetchProducts(params?: { page?: number; limit?: number; category?: string }): Promise<RemoteProduct[]> {
  try {
    const base = ENV.API_URL;
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.category) q.set('category', params.category);
    const url = `${base}/commerce/products${q.toString() ? `?${q.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    return (json.data ?? json) as RemoteProduct[];
  } catch {
    return [];
  }
}

export async function fetchServices(params?: { page?: number; limit?: number }): Promise<any[]> {
  try {
    const base = ENV.API_URL;
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const url = `${base}/commerce/services${q.toString() ? `?${q.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    return (json.data ?? json) as any[];
  } catch {
    return [];
  }
}
