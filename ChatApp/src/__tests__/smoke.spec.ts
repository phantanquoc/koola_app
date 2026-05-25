/**
 * Smoke test — verifies Jest is configured and mocks resolve cleanly.
 * This test must pass before any repository code is written.
 */

describe('Jest infrastructure smoke test', () => {
  it('runs without errors', () => {
    expect(true).toBe(true);
  });

  it('op-sqlite mock is available', () => {
    const opSqlite = require('@op-engineering/op-sqlite');
    expect(typeof opSqlite.open).toBe('function');
  });

  it('react-native-mmkv mock is available', () => {
    const { MMKV } = require('react-native-mmkv');
    const store = new MMKV({ id: 'test' });
    store.set('key', 'value');
    expect(store.getString('key')).toBe('value');
  });

  it('@react-native-async-storage mock is available', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('test', 'hello');
    const val = await AsyncStorage.getItem('test');
    expect(val).toBe('hello');
  });
});
