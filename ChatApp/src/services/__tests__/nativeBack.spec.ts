import { NativeModules, Platform } from 'react-native';
import {
  acquireBackIntercept,
  getBackInterceptCount,
  notifyNativePopping,
  performNativeBack,
} from '../nativeBack';

const originalOS = Platform.OS;

function setOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('nativeBack', () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).KoolaBack;
    setOS(originalOS);
  });

  describe('performNativeBack', () => {
    it('calls native performBack on Android when the module exists', () => {
      setOS('android');
      const performBack = jest.fn();
      (NativeModules as Record<string, unknown>).KoolaBack = { performBack };
      const fallback = jest.fn();

      performNativeBack(fallback);

      expect(performBack).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('falls back when the native module is missing', () => {
      setOS('android');
      const fallback = jest.fn();

      performNativeBack(fallback);

      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('falls back on iOS even if a module is registered', () => {
      setOS('ios');
      const performBack = jest.fn();
      (NativeModules as Record<string, unknown>).KoolaBack = { performBack };
      const fallback = jest.fn();

      performNativeBack(fallback);

      expect(performBack).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('acquireBackIntercept', () => {
    it('ref-counts and syncs the count to native', () => {
      setOS('android');
      const setInterceptCount = jest.fn();
      (NativeModules as Record<string, unknown>).KoolaBack = { setInterceptCount };
      const base = getBackInterceptCount();

      const releaseA = acquireBackIntercept();
      const releaseB = acquireBackIntercept();
      expect(getBackInterceptCount()).toBe(base + 2);
      expect(setInterceptCount).toHaveBeenLastCalledWith(base + 2);

      releaseA();
      expect(getBackInterceptCount()).toBe(base + 1);
      expect(setInterceptCount).toHaveBeenLastCalledWith(base + 1);

      releaseB();
      expect(getBackInterceptCount()).toBe(base);
      expect(setInterceptCount).toHaveBeenLastCalledWith(base);
    });

    it('release is idempotent and never goes negative', () => {
      setOS('android');
      const base = getBackInterceptCount();
      const release = acquireBackIntercept();

      release();
      release();

      expect(getBackInterceptCount()).toBe(base);
    });

    it('is a no-op for native on iOS / missing module', () => {
      setOS('ios');
      const setInterceptCount = jest.fn();
      (NativeModules as Record<string, unknown>).KoolaBack = { setInterceptCount };

      const release = acquireBackIntercept();
      release();

      expect(setInterceptCount).not.toHaveBeenCalled();
    });
  });

  it('notifyNativePopping forwards to native on Android only', () => {
    setOS('android');
    const notifyPopping = jest.fn();
    (NativeModules as Record<string, unknown>).KoolaBack = { notifyPopping };

    notifyNativePopping();
    expect(notifyPopping).toHaveBeenCalledTimes(1);

    setOS('ios');
    notifyNativePopping();
    expect(notifyPopping).toHaveBeenCalledTimes(1);
  });
});
