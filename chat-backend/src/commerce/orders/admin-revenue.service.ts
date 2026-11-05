import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CommerceOrder,
  CommerceOrderDocument,
} from './schemas/commerce-order.schema';
import { User, UserDocument } from '../../users/user.schema';
import { AdminRevenueQueryDto } from '../dto/admin-revenue.dto';

/** Một dòng đối soát — dùng chung cho tổng, theo ngày và theo seller. */
export interface RevenueBucket {
  gmv: number;
  orderCount: number;
  cancelledGmv: number;
  refundAmount: number;
  commission: number;
}

export interface RevenueSummary {
  from: string;
  to: string;
  totals: RevenueBucket;
  daily: (RevenueBucket & { date: string })[];
  sellers: (RevenueBucket & { sellerId: string; sellerName: string | null })[];
}

/** Múi giờ Việt Nam: ngày `YYYY-MM-DD` phải được hiểu theo giờ địa phương. */
const VN_OFFSET = '+07:00';
const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Tổng tiền một đơn: tạm tính + phí ship đã chốt (chưa chốt = 0). */
const ORDER_TOTAL = { $add: ['$subtotal', { $ifNull: ['$shipping.fee', 0] }] };

const EMPTY_BUCKET: RevenueBucket = {
  gmv: 0,
  orderCount: 0,
  cancelledGmv: 0,
  refundAmount: 0,
  commission: 0,
};

/** Gom GMV/số đơn/hoàn tiền — dùng lại cho cả 3 facet. */
const GROUP_BY = {
  gmv: { $sum: { $cond: ['$cancelled', 0, '$total'] } },
  orderCount: { $sum: 1 },
  cancelledGmv: { $sum: { $cond: ['$cancelled', '$total', 0] } },
  refundAmount: { $sum: '$refundAmount' },
} as const;

interface GroupRow {
  _id: string | null;
  gmv: number;
  orderCount: number;
  cancelledGmv: number;
  refundAmount: number;
}

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: toIsoDay(from), to: toIsoDay(to) };
}

/**
 * Đối soát GMV (#22).
 *
 * GMV = tổng đơn KHÔNG bị huỷ; đơn huỷ tách sang `cancelledGmv` để vẫn thấy
 * phần hao hụt. Hoàn tiền là metadata trên đơn (không đổi status) nên cộng
 * riêng chứ không trừ vào GMV — trừ đi là kế toán mất dấu tiền đã thu.
 *
 * Một aggregate với `$facet`: quét đơn một lần cho cả tổng/ngày/seller. Hoa
 * hồng tính theo cặp (ngày × seller) vì mỗi seller một mức `commissionRate`.
 */
@Injectable()
export class AdminRevenueService {
  constructor(
    @InjectModel(CommerceOrder.name)
    private readonly orderModel: Model<CommerceOrderDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async summary(dto: AdminRevenueQueryDto = {}): Promise<RevenueSummary> {
    const fallback = defaultRange();
    const from = dto.from ?? fallback.from;
    const to = dto.to ?? fallback.to;

    const match: Record<string, unknown> = {
      createdAt: {
        $gte: new Date(`${from}T00:00:00.000${VN_OFFSET}`),
        $lte: new Date(`${to}T23:59:59.999${VN_OFFSET}`),
      },
    };
    if (dto.sellerId) match.sellerId = dto.sellerId;

    const [result] = await this.orderModel.aggregate<{
      totals: GroupRow[];
      daily: GroupRow[];
      sellers: GroupRow[];
      daySeller: (Omit<GroupRow, '_id'> & {
        day: string;
        sellerId: string;
      })[];
    }>([
      { $match: match },
      {
        $project: {
          sellerId: 1,
          total: ORDER_TOTAL,
          cancelled: { $eq: ['$status', 'CANCELLED'] },
          refundAmount: { $ifNull: ['$refundAmount', 0] },
          // Cắt theo UTC sẽ dồn đơn 00:00–07:00 sang hôm trước.
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: VN_TZ,
            },
          },
        },
      },
      {
        $facet: {
          totals: [{ $group: { _id: null, ...GROUP_BY } }],
          daily: [{ $group: { _id: '$day', ...GROUP_BY } }, { $sort: { _id: 1 } }],
          sellers: [
            { $group: { _id: '$sellerId', ...GROUP_BY } },
            { $sort: { gmv: -1 } },
          ],
          daySeller: [
            {
              $group: {
                _id: { day: '$day', sellerId: '$sellerId' },
                gmv: GROUP_BY.gmv,
              },
            },
          ],
        },
      },
    ]);

    const sellerRows = result?.sellers ?? [];
    const rates = await this.loadCommissionRates(sellerRows.map((r) => r._id));
    const names = await this.loadSellerNames(sellerRows.map((r) => r._id));

    const sellers = sellerRows.map((row) => ({
      sellerId: String(row._id),
      sellerName: names.get(String(row._id)) || null,
      ...this.bucketOf(row, rates.get(String(row._id)) ?? 0),
    }));

    const dailyRows = result?.daily ?? [];
    const commissionByDay = new Map<string, number>();
    for (const row of result?.daySeller ?? []) {
      const commission = Math.round(
        row.gmv * (rates.get(String(row.sellerId)) ?? 0),
      );
      commissionByDay.set(row.day, (commissionByDay.get(row.day) ?? 0) + commission);
    }

    const totalsRow = result?.totals?.[0];

    return {
      from,
      to,
      totals: totalsRow
        ? {
            ...this.bucketOf(totalsRow, 0),
            // Tổng hoa hồng = tổng hoa hồng từng seller, không phải một tỉ lệ chung.
            commission: sellers.reduce((sum, s) => sum + s.commission, 0),
          }
        : { ...EMPTY_BUCKET },
      daily: dailyRows.map((row) => ({
        date: String(row._id),
        ...this.bucketOf(row, 0),
        commission: commissionByDay.get(String(row._id)) ?? 0,
      })),
      sellers,
    };
  }

  private bucketOf(row: Omit<GroupRow, '_id'>, rate: number): RevenueBucket {
    return {
      gmv: row.gmv,
      orderCount: row.orderCount,
      cancelledGmv: row.cancelledGmv,
      refundAmount: row.refundAmount,
      commission: Math.round(row.gmv * rate),
    };
  }

  /** Tỉ lệ hoa hồng theo seller; seller chưa cấu hình = 0. */
  private async loadCommissionRates(
    sellerIds: (string | null)[],
  ): Promise<Map<string, number>> {
    const valid = this.validIds(sellerIds);
    if (valid.length === 0) return new Map();
    const docs = await this.userModel
      .find({ _id: { $in: valid } })
      .select('_id commissionRate')
      .lean<{ _id: Types.ObjectId; commissionRate?: number | null }[]>();
    return new Map(docs.map((d) => [String(d._id), d.commissionRate ?? 0]));
  }

  private async loadSellerNames(
    sellerIds: (string | null)[],
  ): Promise<Map<string, string>> {
    const valid = this.validIds(sellerIds);
    if (valid.length === 0) return new Map();
    const docs = await this.userModel
      .find({ _id: { $in: valid } })
      .select('_id displayName')
      .lean<{ _id: Types.ObjectId; displayName?: string }[]>();
    return new Map(docs.map((d) => [String(d._id), d.displayName ?? '']));
  }

  private validIds(ids: (string | null)[]): Types.ObjectId[] {
    return Array.from(
      new Set(ids.filter((id): id is string => !!id && Types.ObjectId.isValid(id))),
    ).map((id) => new Types.ObjectId(id));
  }
}
