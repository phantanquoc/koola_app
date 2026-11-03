/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { MusicStorageService } from './music-storage.service';

// `jest.mock` is hoisted above the const declarations below, so the factory
// must read the mocks lazily instead of closing over them at hoist time.
const minioMocks: {
  presignedPutObject: jest.Mock;
  presignedGetObject: jest.Mock;
  statObject: jest.Mock;
  getObject: jest.Mock;
} = {
  presignedPutObject: jest.fn(),
  presignedGetObject: jest.fn(),
  statObject: jest.fn(),
  getObject: jest.fn(),
};

jest.mock('../../media/minio-client', () => ({
  BUCKET: 'chat-media',
  getMinioPublicClient: () => ({
    get presignedPutObject() {
      return minioMocks.presignedPutObject;
    },
    get presignedGetObject() {
      return minioMocks.presignedGetObject;
    },
  }),
  minioClient: {
    get statObject() {
      return minioMocks.statObject;
    },
    get getObject() {
      return minioMocks.getObject;
    },
  },
}));

const { presignedPutObject, presignedGetObject, statObject, getObject } =
  minioMocks;

async function build() {
  const moduleRef = await Test.createTestingModule({
    providers: [MusicStorageService],
  }).compile();
  return moduleRef.get(MusicStorageService);
}

beforeEach(() => jest.clearAllMocks());

describe('presignUpload', () => {
  beforeEach(() => presignedPutObject.mockResolvedValue('https://put.example/x'));

  it('signs a key under music-catalog with an extension from the MIME', async () => {
    const svc = await build();
    const out = await svc.presignUpload('audio/mpeg', 1024);

    expect(out.audioKey.startsWith('music-catalog/')).toBe(true);
    expect(out.audioKey.endsWith('.mp3')).toBe(true);
    expect(out.uploadUrl).toBe('https://put.example/x');
    expect(presignedPutObject).toHaveBeenCalledWith(
      'chat-media',
      out.audioKey,
      900,
    );
  });

  it.each([
    ['audio/mpeg', '.mp3'],
    ['audio/wav', '.wav'],
    ['audio/ogg', '.ogg'],
    ['audio/mp4', '.m4a'],
    ['audio/aac', '.aac'],
  ])('maps %s to %s', async (mime, ext) => {
    const svc = await build();
    const out = await svc.presignUpload(mime, 1024);
    expect(out.audioKey.endsWith(ext)).toBe(true);
  });

  it('rejects a non-audio MIME before signing', async () => {
    const svc = await build();
    await expect(svc.presignUpload('image/png', 1024)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(presignedPutObject).not.toHaveBeenCalled();
  });

  it('rejects an oversize file before signing', async () => {
    const svc = await build();
    await expect(
      svc.presignUpload('audio/mpeg', 101 * 1024 * 1024),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(presignedPutObject).not.toHaveBeenCalled();
  });

  it('rejects a non-positive size', async () => {
    const svc = await build();
    await expect(svc.presignUpload('audio/mpeg', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('surfaces storage failure as 503', async () => {
    presignedPutObject.mockRejectedValueOnce(new Error('down'));
    const svc = await build();
    await expect(svc.presignUpload('audio/mpeg', 1024)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('never touches a media collection — it writes nothing', async () => {
    // The service has no Mongo dependency at all; this guards the contract.
    const svc = await build();
    await svc.presignUpload('audio/mpeg', 1024);
    expect(Object.keys(svc as object)).not.toContain('mediaModel');
  });
});

describe('statSize', () => {
  it('returns the size of an existing object', async () => {
    statObject.mockResolvedValueOnce({ size: 2048 });
    const svc = await build();
    await expect(svc.statSize('music-catalog/a.mp3')).resolves.toBe(2048);
  });

  it('returns null when the object is missing', async () => {
    statObject.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'NotFound' }));
    const svc = await build();
    await expect(svc.statSize('music-catalog/a.mp3')).resolves.toBeNull();
  });

  it('raises 503 when storage is unreachable', async () => {
    statObject.mockRejectedValueOnce(Object.assign(new Error('econnrefused'), { code: 'ECONNREFUSED' }));
    const svc = await build();
    await expect(svc.statSize('music-catalog/a.mp3')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('readObject', () => {
  async function* streamOf(...chunks: string[]) {
    for (const c of chunks) yield Buffer.from(c);
  }

  it('concatenates the stream into one buffer', async () => {
    getObject.mockResolvedValueOnce(streamOf('ab', 'cd'));
    const svc = await build();
    await expect(svc.readObject('music-catalog/a.mp3')).resolves.toEqual(
      Buffer.from('abcd'),
    );
  });
});

describe('presignPlayback', () => {
  it('signs for one hour', async () => {
    presignedGetObject.mockResolvedValueOnce('https://get.example/a');
    const svc = await build();
    await expect(svc.presignPlayback('music-catalog/a.mp3')).resolves.toBe(
      'https://get.example/a',
    );
    expect(presignedGetObject).toHaveBeenCalledWith(
      'chat-media',
      'music-catalog/a.mp3',
      3600,
    );
  });
});
