export type TierId = 'basic' | 'pro' | 'plus' | 'ultra';

export interface UpgradeTier {
  id: TierId;
  name: string;
  subtitle: string;
  priceMonthly: number;
  priceYearly: number;
  badge?: string;
  popular?: boolean;
  icon: string;
  gradient: [string, string];
  /** Dark-mode variant of gradient for ultra (luxury gold->black). */
  gradientDark?: [string, string];
  features: string[];
  cta: string;
}

export const UPGRADE_TIERS: readonly UpgradeTier[] = [
  {
    id: 'basic',
    name: 'Cơ bản',
    subtitle: 'Miễn phí',
    priceMonthly: 0,
    priceYearly: 0,
    icon: 'person',
    gradient: ['#E5E7EB', '#9CA3AF'],
    features: [
      'Nhắn tin không giới hạn',
      '5GB lưu trữ',
      'Nhóm tối đa 50 thành viên',
      'Hỗ trợ tiêu chuẩn',
    ],
    cta: 'Gói hiện tại',
  },
  {
    id: 'pro',
    name: 'Pro',
    subtitle: 'Cho cá nhân năng động',
    priceMonthly: 49000,
    priceYearly: 490000,
    badge: 'Phổ biến',
    popular: true,
    icon: 'bolt',
    gradient: ['#FF8A1A', '#2563EB'],
    features: [
      '100GB lưu trữ',
      'Nhóm 200 thành viên',
      'Gọi video HD',
      'Không quảng cáo',
      'Chủ đề tùy chỉnh',
    ],
    cta: 'Chọn Pro',
  },
  {
    id: 'plus',
    name: 'Plus',
    subtitle: 'Cho đội nhóm chuyên nghiệp',
    priceMonthly: 99000,
    priceYearly: 990000,
    icon: 'auto-awesome',
    gradient: ['#7C3AED', '#2563EB'],
    features: [
      '500GB lưu trữ',
      'Nhóm 500 thành viên',
      'Trợ lý AI',
      'Phân tích nâng cao',
      'Hỗ trợ ưu tiên',
    ],
    cta: 'Chọn Plus',
  },
  {
    id: 'ultra',
    name: 'Ultra',
    subtitle: 'Sức mạnh không giới hạn',
    priceMonthly: 199000,
    priceYearly: 1990000,
    icon: 'diamond',
    gradient: ['#F59E0B', '#0F1419'],
    gradientDark: ['#FBBF24', '#1A1200'],
    features: [
      'Lưu trữ không giới hạn',
      'Nhóm 1000+ thành viên',
      'Mã hóa nâng cao',
      'API & Tích hợp',
      'Hỗ trợ VIP 24/7',
    ],
    cta: 'Chọn Ultra',
  },
] as const;

export function formatPrice(price: number): string {
  if (price === 0) return 'Miễn phí';
  return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
}

export function getTierPrice(tier: UpgradeTier, billing: 'monthly' | 'yearly'): number {
  return billing === 'yearly' ? tier.priceYearly : tier.priceMonthly;
}

/** For compare table — quick list of key features across tiers */
export const COMPARE_FEATURES: readonly { label: string; values: Record<TierId, boolean | string> }[] = [
  { label: 'Lưu trữ', values: { basic: '5GB', pro: '100GB', plus: '500GB', ultra: 'Không giới hạn' } },
  { label: 'Thành viên nhóm', values: { basic: '50', pro: '200', plus: '500', ultra: '1000+' } },
  { label: 'Gọi video HD', values: { basic: false, pro: true, plus: true, ultra: true } },
  { label: 'Trợ lý AI', values: { basic: false, pro: false, plus: true, ultra: true } },
  { label: 'Hỗ trợ VIP', values: { basic: false, pro: false, plus: false, ultra: true } },
];
