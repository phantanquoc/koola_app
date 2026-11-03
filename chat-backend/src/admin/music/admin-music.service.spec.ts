/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AdminMusicService } from './admin-music.service';
import { MusicStorageService } from './music-storage.service';
import { AdminAuditService } from '../admin-audit.service';
import { MusicTrack } from '../../moments/schemas/music-track.schema';
import { Story } from '../../moments/schemas/story.schema';
import { Post } from '../../moments/schemas/post.schema';
import { readDurationMs } from './audio-metadata';

// The wrapper is the only module that touches the ESM-only music-metadata
// package, which jest cannot load. Mocking it keeps every spec resolvable.
jest.mock('./audio-metadata', () => ({ readDurationMs: jest.fn() }));

const mockReadDurationMs = readDurationMs as jest.MockedFunction<
  typeof readDurationMs
>;

const OID = '507f1f77bcf86cd799439011';
const OID2 = '507f1f77bcf86cd799439012';

function leanChain(result: unknown) {
  const chain: any = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn().mockResolvedValue(result),
  };
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    find: jest.fn().mockReturnValue(leanChain([])),
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    ...overrides,
  };
}

function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    presignUpload: jest.fn(),
    statSize: jest.fn().mockResolvedValue(1024),
    readObject: jest.fn().mockResolvedValue(Buffer.from('audio')),
    presignPlayback: jest.fn().mockResolvedValue('https://signed.example/a.mp3'),
    ...overrides,
  };
}

const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AdminAuditService;

function makeCountingModel(count = 0) {
  return { countDocuments: jest.fn().mockResolvedValue(count) };
}

async function build(model: any, storage: any, counts = { stories: 0, posts: 0 }) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminMusicService,
      { provide: getModelToken(MusicTrack.name), useValue: model },
      { provide: getModelToken(Story.name), useValue: makeCountingModel(counts.stories) },
      { provide: getModelToken(Post.name), useValue: makeCountingModel(counts.posts) },
      { provide: MusicStorageService, useValue: storage },
      { provide: AdminAuditService, useValue: audit },
    ],
  }).compile();
  return moduleRef.get(AdminMusicService);
}

beforeEach(() => jest.clearAllMocks());

// ─── Listing / filters ───────────────────────────────────────────────────────

describe('list', () => {
  it('defaults to active only and sorts newest first', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());

    await svc.list({});

    const [filter] = model.find.mock.calls[0];
    expect(filter).toEqual({ isActive: true });
    const chain = model.find.mock.results[0].value;
    expect(chain.sort).toHaveBeenCalledWith({ addedAt: -1 });
  });

  it('returns both states for status=all', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());

    await svc.list({ status: 'all' });

    expect(model.find.mock.calls[0][0]).toEqual({});
  });

  it('searches title OR artist as a case-insensitive substring', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());

    await svc.list({ q: 'Scot' });

    const filter: any = model.find.mock.calls[0][0];
    const [titleRe] = filter.$or[0].title ? [filter.$or[0].title] : [null];
    expect(titleRe).toBeInstanceOf(RegExp);
    expect((titleRe as RegExp).flags).toContain('i');
    expect((titleRe as RegExp).test('Scott Buckley')).toBe(true);
    expect((titleRe as RegExp).test('Seattle')).toBe(false);
    expect(filter.$or).toHaveLength(2);
  });

  it('treats regex metacharacters literally', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());

    await svc.list({ q: 'a.*b' });

    const re: RegExp = (model.find.mock.calls[0][0] as any).$or[0].title;
    expect(re.test('a.*b')).toBe(true);
    expect(re.test('axxb')).toBe(false);
  });

  it('combines licenseType with status', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());

    await svc.list({ status: 'inactive', licenseType: 'cc-by' as any });

    expect(model.find.mock.calls[0][0]).toEqual({
      isActive: false,
      licenseType: 'cc-by',
    });
  });

  it('rejects a sort outside the allow-list', async () => {
    const svc = await build(makeModel(), makeStorage());
    await expect(svc.list({ sort: 'password:asc' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a malformed sort direction', async () => {
    const svc = await build(makeModel(), makeStorage());
    await expect(svc.list({ sort: 'title:sideways' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('honours an allow-listed sort', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());

    await svc.list({ sort: 'usageCount:desc' });

    expect(model.find.mock.results[0].value.sort).toHaveBeenCalledWith({
      usageCount: -1,
    });
  });
});

// ─── Stats ───────────────────────────────────────────────────────────────────

describe('stats', () => {
  it('counts every lifecycle state regardless of the list default', async () => {
    // Regression: `stats` once reused the list's default filter, so `all`
    // silently equalled `active` and all !== active + inactive.
    const model = makeModel({
      countDocuments: jest
        .fn()
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(1),
      aggregate: jest.fn().mockResolvedValue([]),
    });
    const svc = await build(model, makeStorage());

    await svc.stats();

    // The first count (all) must not carry isActive.
    expect(model.countDocuments.mock.calls[0][0]).toEqual({});
  });

  it('counts every lifecycle state and every license bucket', async () => {
    const model = makeModel({
      countDocuments: jest
        .fn()
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(3),
      aggregate: jest
        .fn()
        .mockResolvedValue([{ _id: 'cc0', count: 4 }, { _id: 'cc-by', count: 6 }]),
    });
    const svc = await build(model, makeStorage());

    await expect(svc.stats()).resolves.toEqual({
      all: 10,
      active: 7,
      inactive: 3,
      byLicense: {
        cc0: 4,
        'cc-by': 6,
        'epidemic-sound': 0,
        'owned-by-koola': 0,
      },
    });
  });
});

// ─── Detail ──────────────────────────────────────────────────────────────────

describe('findOne', () => {
  it('presigns playback URLs on every read (no caching)', async () => {
    const track = {
      _id: OID,
      title: 'T',
      audioKey: 'music-catalog/a.mp3',
      previewKey: 'music-catalog/a.mp3',
      isActive: true,
    };
    const model = makeModel({
      findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(track) }),
    });
    const storage = makeStorage();
    const svc = await build(model, storage);

    await svc.findOne(OID);
    await svc.findOne(OID);

    expect(storage.presignPlayback).toHaveBeenCalledTimes(4); // 2 audio + 2 preview
  });

  it('returns an inactive track intact', async () => {
    const track = {
      _id: OID,
      audioKey: 'music-catalog/a.mp3',
      previewKey: 'music-catalog/a.mp3',
      isActive: false,
      licenseUrl: 'https://lic',
    };
    const model = makeModel({
      findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(track) }),
    });
    const svc = await build(model, makeStorage());

    const got: any = await svc.findOne(OID);
    expect(got.isActive).toBe(false);
    expect(got.licenseUrl).toBe('https://lic');
    expect(got.audioUrl).toBe('https://signed.example/a.mp3');
  });

  it('reports how many live stories and posts still use the track', async () => {
    const track = {
      _id: OID,
      audioKey: 'music-catalog/a.mp3',
      previewKey: 'music-catalog/a.mp3',
      isActive: true,
    };
    const model = makeModel({
      findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(track) }),
    });
    const svc = await build(model, makeStorage(), { stories: 3, posts: 2 });

    const got: any = await svc.findOne(OID);

    expect(got.usage).toEqual({ stories: 3, posts: 2, total: 5 });
  });

  it('404s an unknown id', async () => {
    const svc = await build(makeModel(), makeStorage());
    await expect(svc.findOne(OID2)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a malformed id without querying', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());
    await expect(svc.findOne('not-an-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(model.findById).not.toHaveBeenCalled();
  });
});

// ─── Export ──────────────────────────────────────────────────────────────────

describe('exportAll', () => {
  it('includes inactive rows', async () => {
    const model = makeModel({
      countDocuments: jest.fn().mockResolvedValue(2),
    });
    model.find.mockReturnValue(
      leanChain([
        { _id: OID, isActive: true },
        { _id: OID2, isActive: false },
      ]),
    );
    const svc = await build(model, makeStorage());

    const out = await svc.exportAll();
    expect(out.data).toHaveLength(2);
    expect(out.truncated).toBe(false);
  });

  it('declares truncation at the cap', async () => {
    const model = makeModel({
      countDocuments: jest.fn().mockResolvedValue(6000),
    });
    model.find.mockReturnValue(leanChain([{ _id: OID }]));
    const svc = await build(model, makeStorage());

    const out = await svc.exportAll();
    expect(out.truncated).toBe(true);
    expect(out.total).toBe(6000);
  });

  it('carries no presigned URL in the payload', async () => {
    const model = makeModel({ countDocuments: jest.fn().mockResolvedValue(1) });
    model.find.mockReturnValue(leanChain([{ _id: OID, audioKey: 'k.mp3' }]));
    const storage = makeStorage();
    const svc = await build(model, storage);

    const out = await svc.exportAll();
    expect(storage.presignPlayback).not.toHaveBeenCalled();
    expect(JSON.stringify(out.data)).not.toContain('X-Amz-Signature');
  });
});

// ─── Create ──────────────────────────────────────────────────────────────────

const createBody = {
  title: 'Rainy',
  artist: 'Purrple Cat',
  audioKey: 'music-catalog/a.mp3',
  licenseType: 'cc0' as any,
  licenseUrl: 'https://cc0',
  sourceUrl: 'https://src',
};

describe('create', () => {
  it('rejects a key with no object behind it', async () => {
    const storage = makeStorage({ statSize: jest.fn().mockResolvedValue(null) });
    const svc = await build(makeModel(), storage);

    await expect(svc.create(createBody as any, 'admin', null)).rejects.toThrow(
      /chưa được tải lên/,
    );
    expect(storage.readObject).not.toHaveBeenCalled();
  });

  it('rejects unparseable audio', async () => {
    mockReadDurationMs.mockRejectedValueOnce(new Error('bad'));
    const svc = await build(makeModel(), makeStorage());

    await expect(svc.create(createBody as any, 'admin', null)).rejects.toThrow(
      /Không đọc được file âm thanh/,
    );
  });

  it('derives duration server-side and aliases previewKey', async () => {
    mockReadDurationMs.mockResolvedValueOnce(214_000);
    const model = makeModel({
      create: jest.fn().mockResolvedValue({ _id: OID }),
    });
    const svc = await build(model, makeStorage());

    await svc.create(createBody as any, 'admin', '1.2.3.4');

    const written = model.create.mock.calls[0][0];
    expect(written.durationMs).toBe(214_000);
    expect(written.previewKey).toBe('music-catalog/a.mp3');
    expect(written.addedBy).toBe('admin');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create_music_track', targetId: OID }),
    );
  });

  it('rejects cc-by without attribution', async () => {
    const svc = await build(makeModel(), makeStorage());
    await expect(
      svc.create({ ...createBody, licenseType: 'cc-by' } as any, 'admin', null),
    ).rejects.toThrow(/attribution/);
  });

  it('rejects a client-supplied durationMs', async () => {
    const model = makeModel();
    const svc = await build(model, makeStorage());
    // The DTO whitelist rejects it at the HTTP boundary; the service refuses
    // it too so a future DTO loosening cannot reintroduce a client-declared
    // duration that disagrees with the file.
    await expect(
      svc.create({ ...createBody, durationMs: 1000 } as any, 'admin', null),
    ).rejects.toThrow(/durationMs/);
    expect(model.create).not.toHaveBeenCalled();
  });
});

// ─── Update ──────────────────────────────────────────────────────────────────

describe('update', () => {
  it.each(['audioKey', 'previewKey', 'durationMs', 'sourceUrl', 'licenseType', 'licenseUrl', 'addedBy', 'addedAt'])(
    'refuses immutable field %s',
    async (field) => {
      const svc = await build(makeModel(), makeStorage());
      await expect(
        svc.update(OID, { [field]: 'x' } as any, 'admin', null),
      ).rejects.toThrow(new RegExp(field));
    },
  );

  it('writes one audit entry for an allowed patch', async () => {
    const model = makeModel({
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: OID, title: 'New' }),
    });
    const svc = await build(model, makeStorage());

    await svc.update(OID, { title: 'New' } as any, 'admin', null);

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update_music_track' }),
    );
  });

  it('404s a missing track', async () => {
    const svc = await build(makeModel(), makeStorage());
    await expect(
      svc.update(OID, { title: 'New' } as any, 'admin', null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

describe('deactivate / restore', () => {
  it('deactivates and audits once', async () => {
    const model = makeModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: OID, isActive: true }),
      }),
    });
    const svc = await build(model, makeStorage());

    await svc.deactivate(OID, 'admin', null);

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: OID },
      { $set: { isActive: false } },
    );
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a repeat writes no second audit', async () => {
    const model = makeModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: OID, isActive: false }),
      }),
    });
    const svc = await build(model, makeStorage());

    await svc.deactivate(OID, 'admin', null);

    expect(model.updateOne).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('restores and audits once', async () => {
    const model = makeModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: OID, isActive: false }),
      }),
    });
    const svc = await build(model, makeStorage());

    await svc.restore(OID, 'admin', null);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'restore_music_track' }),
    );
  });

  it('restore on an active track is a no-op', async () => {
    const model = makeModel({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: OID, isActive: true }),
      }),
    });
    const svc = await build(model, makeStorage());

    await svc.restore(OID, 'admin', null);

    expect(model.updateOne).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('404s an unknown id in both directions', async () => {
    const svc = await build(makeModel(), makeStorage());
    await expect(svc.deactivate(OID2, 'a', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.restore(OID2, 'a', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
