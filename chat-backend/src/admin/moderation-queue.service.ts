import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { AdminReportService } from './admin-report.service';

export type ModerationQueueKind =
  | 'report'
  | 'story-reports'
  | 'message-reports'
  | 'business-verification';

export interface ModerationQueueItem {
  kind: ModerationQueueKind;
  id: string;
  /** Số càng cao càng gấp — UI sort sẵn từ server. */
  priority: number;
  reportedCount: number;
  createdAt: string;
  title: string;
  subtitle: string;
  link: string;
}

/** Một đối tượng bị báo cáo nhiều lần — gom từ aggregate, không N+1. */
interface ReportCluster {
  targetType: string;
  targetId: string;
  count: number;
  firstAt: Date;
}

const MAX_ITEMS = 200;
const CLUSTER_THRESHOLD = 3;

// Điểm ưu tiên: nội dung bị nhiều người báo cùng lúc nguy hiểm hơn một báo
// cáo lẻ; hồ sơ doanh nghiệp chờ duyệt chặn người bán kiếm tiền nên đứng trên
// báo cáo lẻ nhưng dưới nội dung đang lan truyền.
const PRIORITY = {
  'story-reports': 90,
  'message-reports': 85,
  'business-verification': 70,
  report: 50,
} as const;

@Injectable()
export class ModerationQueueService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Message.name) private readonly msgModel: Model<Message>,
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    private readonly reportService: AdminReportService,
  ) {}

  async getQueue(limit = 50): Promise<ModerationQueueItem[]> {
    const take = Math.min(Math.max(limit, 1), MAX_ITEMS);

    const [clusters, pendingReports, pendingBusinesses] = await Promise.all([
      this.clusterPendingReports(),
      this.reportService.list({ status: 'pending', page: 1, limit: MAX_ITEMS }),
      this.userModel
        .find({
          accountType: 'business',
          verificationStatus: 'pending',
          deletedAt: null,
        })
        .sort({ createdAt: 1 })
        .limit(MAX_ITEMS)
        .select('displayName createdAt')
        .lean(),
    ]);

    const urgent = clusters
      .filter(
        (c) =>
          c.count >= CLUSTER_THRESHOLD &&
          (c.targetType === 'story' || c.targetType === 'message'),
      )
      // Giữ mục bị báo nhiều nhất khi cắt — $in vài nghìn id sẽ làm chậm
      // query mà hàng đợi cũng chỉ hiện 200 mục.
      .sort(
        (a, b) =>
          b.count - a.count || a.firstAt.getTime() - b.firstAt.getTime(),
      )
      .slice(0, MAX_ITEMS);
    const urgentKeys = new Set(
      urgent.map((c) => `${c.targetType}:${c.targetId}`),
    );

    const [clusterItems, reportItems, businessItems] = await Promise.all([
      this.buildClusterItems(urgent),
      Promise.resolve(this.buildReportItems(pendingReports.data, urgentKeys)),
      Promise.resolve(
        pendingBusinesses.map<ModerationQueueItem>((b) => ({
          kind: 'business-verification',
          id: String(b._id),
          priority: PRIORITY['business-verification'],
          reportedCount: 0,
          createdAt: new Date(
            (b as unknown as { createdAt: Date }).createdAt,
          ).toISOString(),
          title: b.displayName || 'Doanh nghiệp chưa đặt tên',
          subtitle: 'Hồ sơ doanh nghiệp chờ xác minh',
          link: `/businesses/${String(b._id)}`,
        })),
      ),
    ]);

    return [...clusterItems, ...reportItems, ...businessItems]
      .sort(
        (a, b) =>
          b.priority - a.priority || a.createdAt.localeCompare(b.createdAt),
      )
      .slice(0, take);
  }

  /** Gom báo cáo pending theo đối tượng — một query cho cả bảng. */
  private async clusterPendingReports(): Promise<ReportCluster[]> {
    const rows = await this.reportModel.aggregate<{
      _id: { targetType: string; targetId: string };
      count: number;
      firstAt: Date;
    }>([
      { $match: { status: 'pending' } },
      {
        $group: {
          _id: { targetType: '$targetType', targetId: '$targetId' },
          count: { $sum: 1 },
          firstAt: { $min: '$createdAt' },
        },
      },
    ]);
    return rows.map((r) => ({
      targetType: r._id.targetType,
      targetId: String(r._id.targetId),
      count: r.count,
      firstAt: r.firstAt,
    }));
  }

  private async buildClusterItems(
    clusters: ReportCluster[],
  ): Promise<ModerationQueueItem[]> {
    if (clusters.length === 0) return [];

    const storyIds = clusters
      .filter(
        (c) => c.targetType === 'story' && Types.ObjectId.isValid(c.targetId),
      )
      .map((c) => c.targetId);
    const messageIds = clusters
      .filter(
        (c) => c.targetType === 'message' && Types.ObjectId.isValid(c.targetId),
      )
      .map((c) => c.targetId);

    const [stories, messages] = await Promise.all([
      storyIds.length
        ? this.storyModel
            .find({ _id: { $in: storyIds } })
            .select('caption isActive')
            .lean()
        : [],
      messageIds.length
        ? this.msgModel
            .find({ _id: { $in: messageIds } })
            .select('content type')
            .lean()
        : [],
    ]);
    const storyById = new Map(stories.map((s) => [String(s._id), s]));
    const msgById = new Map(messages.map((m) => [String(m._id), m]));

    return clusters.flatMap<ModerationQueueItem>((c) => {
      if (c.targetType === 'story') {
        const story = storyById.get(c.targetId);
        // Story đã bị gỡ thì không còn gì để kiểm duyệt — báo cáo cũ vẫn còn
        // nhưng đẩy lên hàng đợi chỉ làm nhiễu.
        if (!story || story.isActive === false) return [];
        return [
          {
            kind: 'story-reports',
            id: c.targetId,
            priority: PRIORITY['story-reports'],
            reportedCount: c.count,
            createdAt: c.firstAt.toISOString(),
            title: story.caption?.trim()
              ? story.caption.trim().slice(0, 80)
              : '[Story]',
            subtitle: `${c.count} báo cáo đang chờ xử lý`,
            link: `/reports?targetType=story`,
          },
        ];
      }
      const msg = msgById.get(c.targetId);
      if (!msg) return [];
      return [
        {
          kind: 'message-reports',
          id: c.targetId,
          priority: PRIORITY['message-reports'],
          reportedCount: c.count,
          createdAt: c.firstAt.toISOString(),
          title: msg.content?.trim()
            ? msg.content.trim().slice(0, 80)
            : '[Tin nhắn]',
          subtitle: `${c.count} báo cáo đang chờ xử lý`,
          link: `/reports?targetType=message`,
        },
      ];
    });
  }

  private buildReportItems(
    reports: Awaited<ReturnType<AdminReportService['list']>>['data'],
    urgentKeys: Set<string>,
  ): ModerationQueueItem[] {
    return reports.flatMap<ModerationQueueItem>((report) => {
      // ReportDocument không khai báo createdAt (timestamps do Mongoose thêm),
      // nên đọc qua kiểu hẹp thay vì any.
      const r = report as unknown as {
        _id: unknown;
        targetType: string;
        targetId: string;
        reason: string;
        targetName?: string;
        createdAt: Date;
      };
      // Đã gộp thành mục cụm ở trên — hiện lại từng báo cáo là đếm trùng.
      if (urgentKeys.has(`${r.targetType}:${String(r.targetId)}`)) return [];
      return [
        {
          kind: 'report',
          id: String(r._id),
          priority: PRIORITY.report,
          reportedCount: 1,
          createdAt: new Date(r.createdAt).toISOString(),
          title: r.targetName ?? 'Đối tượng không còn tồn tại',
          subtitle: r.reason,
          link: `/reports/${String(r._id)}`,
        },
      ];
    });
  }
}
