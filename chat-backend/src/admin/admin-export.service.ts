import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';

export const REPORT_EXPORT_MAX = 500;

export interface ReportExportRow {
  _id: unknown;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AdminExportService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
  ) {}

  /**
   * Xuất báo cáo cho đối soát pháp lý. Chỉ chọn cột của collection Report —
   * reporterId giữ để đối chiếu nhưng không join User nên file xuất không có
   * email/SĐT của người báo cáo.
   */
  async exportReports(dto: {
    status?: string;
    targetType?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ data: ReportExportRow[]; total: number; truncated: boolean }> {
    const limit = Math.min(dto.limit ?? REPORT_EXPORT_MAX, REPORT_EXPORT_MAX);
    const filter: Record<string, unknown> = {};
    if (dto.status) filter.status = dto.status;
    if (dto.targetType) filter.targetType = dto.targetType;
    // from/to tính cả biên; chỉ thêm khóa khi có giá trị — undefined trong
    // $gte/$lte làm Mongo bỏ qua cả điều kiện.
    const createdAt: Record<string, Date> = {};
    if (dto.from) createdAt.$gte = new Date(dto.from);
    if (dto.to) createdAt.$lte = new Date(dto.to);
    if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

    const [docs, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .select(
          'reporterId targetType targetId reason status resolvedBy resolvedAt createdAt',
        )
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);

    return {
      data: docs as unknown as ReportExportRow[],
      total,
      truncated: total > docs.length,
    };
  }
}
