import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import * as net from 'net';
import { CoturnHealthService } from './coturn-health.service';

// net.createConnection is non-configurable on modern Node, so jest.spyOn cannot
// redefine it — mock the module instead.
jest.mock('net', () => ({
  ...jest.requireActual<typeof net>('net'),
  createConnection: jest.fn(),
}));

const createConnectionMock = net.createConnection as unknown as jest.Mock<
  FakeSocket,
  [net.NetConnectOpts]
>;

function makeConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
  } as unknown as ConfigService;
}

/**
 * Minimal stand-in for net.Socket — isReachable() only uses once('connect'),
 * once('error') and destroy(), so an EventEmitter covers the whole surface.
 * Inheriting the real EventEmitter matters: it reproduces Node's "emitting
 * 'error' with no listener throws" behaviour that the error tests rely on.
 */
class FakeSocket extends EventEmitter {
  destroy = jest.fn();
}

describe('CoturnHealthService', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = new FakeSocket();
    createConnectionMock.mockReset();
    // Default: the peer answers immediately.
    createConnectionMock.mockImplementation(() => {
      setImmediate(() => socket.emit('connect'));
      return socket;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** The host actually dialed — the observable effect of config resolution. */
  async function probedHost(
    values: Record<string, unknown>,
  ): Promise<string | undefined> {
    const service = new CoturnHealthService(makeConfigService(values));
    await service.isReachable();
    const opts = createConnectionMock.mock.calls[0][0] as net.TcpNetConnectOpts;
    return opts.host;
  }

  // ── Host resolution: internal probe target vs client-facing COTURN_IP ──────

  it('probes COTURN_INTERNAL_HOST when set, ignoring COTURN_IP', async () => {
    // COTURN_IP is the LAN address handed to phones; the backend container
    // cannot necessarily route to it, so it must NOT drive the probe.
    await expect(
      probedHost({
        COTURN_INTERNAL_HOST: 'chat-coturn',
        COTURN_IP: '192.168.2.109',
      }),
    ).resolves.toBe('chat-coturn');
  });

  it('falls back to COTURN_IP when COTURN_INTERNAL_HOST is not set', async () => {
    await expect(probedHost({ COTURN_IP: '192.168.2.109' })).resolves.toBe(
      '192.168.2.109',
    );
  });

  it('falls back to localhost when neither host var is set', async () => {
    await expect(probedHost({})).resolves.toBe('localhost');
  });

  it('treats a blank COTURN_INTERNAL_HOST as unset and falls back to COTURN_IP', async () => {
    // .env.example ships `COTURN_INTERNAL_HOST=` empty. ConfigService only
    // applies its default for `undefined`, so this arrives as ''. An empty
    // host would make net.createConnection dial localhost — a loopback
    // false-positive reporting `coturn: up` while coturn is down.
    await expect(
      probedHost({ COTURN_INTERNAL_HOST: '   ', COTURN_IP: '192.168.2.109' }),
    ).resolves.toBe('192.168.2.109');
  });

  it('never resolves the probe host to an empty string', async () => {
    await expect(
      probedHost({ COTURN_INTERNAL_HOST: '', COTURN_IP: '' }),
    ).resolves.toBe('localhost');
  });

  // ── Port ──────────────────────────────────────────────────────────────────

  it('defaults to port 3478 and honors a COTURN_PORT override', async () => {
    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );
    await service.isReachable();
    expect(createConnectionMock).toHaveBeenCalledWith({
      host: 'chat-coturn',
      port: 3478,
    });

    createConnectionMock.mockClear();
    const custom = new CoturnHealthService(
      makeConfigService({
        COTURN_INTERNAL_HOST: 'chat-coturn',
        COTURN_PORT: 5349,
      }),
    );
    await custom.isReachable();
    expect(createConnectionMock).toHaveBeenCalledWith({
      host: 'chat-coturn',
      port: 5349,
    });
  });

  // ── Reachability outcome ──────────────────────────────────────────────────

  it('returns true and closes the socket when coturn answers', async () => {
    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );
    await expect(service.isReachable()).resolves.toBe(true);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('returns false and closes the socket when coturn does not answer in 3s', async () => {
    jest.useFakeTimers();
    // Never emits 'connect' — simulates a dead/unroutable coturn host.
    createConnectionMock.mockImplementation(() => socket);

    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );
    const pending = service.isReachable();
    jest.advanceTimersByTime(3000);

    await expect(pending).resolves.toBe(false);
    expect(socket.destroy).toHaveBeenCalled();
  });

  // ── Socket error branch ───────────────────────────────────────────────────
  //
  // net.Socket reports failures by EMITTING 'error', which a try/catch cannot
  // observe. EventEmitter rethrows an 'error' that has no listener as an
  // uncaught exception, so without a listener these cases kill the whole
  // backend process rather than degrading the health check.

  it('returns false and closes the socket when the socket errors (ENOTFOUND)', async () => {
    // Real sockets emit 'error' asynchronously, after createConnection returns.
    createConnectionMock.mockImplementation(() => {
      setImmediate(() =>
        socket.emit('error', new Error('getaddrinfo ENOTFOUND chat-coturn')),
      );
      return socket;
    });

    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );

    await expect(service.isReachable()).resolves.toBe(false);
    // Must be destroyed on the error path too, or the handle leaks per probe.
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('registers an error listener, so a socket error cannot crash the process', async () => {
    // The regression guard: EventEmitter.emit('error') THROWS when nothing is
    // listening. Asserting the emit itself does not throw proves isReachable()
    // attached a handler — a typo'd COTURN_INTERNAL_HOST or a removed coturn
    // container must not take the backend down.
    createConnectionMock.mockImplementation(() => socket);

    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );
    const pending = service.isReachable();

    expect(() =>
      socket.emit('error', new Error('connect ECONNREFUSED 172.18.0.5:3478')),
    ).not.toThrow();
    await expect(pending).resolves.toBe(false);
  });

  it('returns false when createConnection throws synchronously', async () => {
    // e.g. ERR_SOCKET_BAD_PORT from a non-numeric COTURN_PORT. This must stay a
    // `false`, not a rejection that turns /health into a 500.
    createConnectionMock.mockImplementation(() => {
      throw new Error('ERR_SOCKET_BAD_PORT');
    });

    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );

    await expect(service.isReachable()).resolves.toBe(false);
  });

  it('settles once and destroys once when connect arrives after an error', async () => {
    createConnectionMock.mockImplementation(() => socket);

    const service = new CoturnHealthService(
      makeConfigService({ COTURN_INTERNAL_HOST: 'chat-coturn' }),
    );
    const pending = service.isReachable();

    socket.emit('error', new Error('connect ECONNREFUSED 172.18.0.5:3478'));
    // A late event must not flip the answer or re-destroy the socket.
    socket.emit('connect');

    await expect(pending).resolves.toBe(false);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });
});
