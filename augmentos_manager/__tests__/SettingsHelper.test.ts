import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { saveSetting, loadSetting } from '../src/logic/SettingsHelper';

// AsyncStorage is already mocked in jest.setup.ts; we'll override its methods directly in tests

// Mock axios
jest.mock('axios');

const CLOUD_URL = 'cloud';

describe('SettingsHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default behavior
    AsyncStorage.getItem = jest.fn().mockResolvedValue(null);
    AsyncStorage.setItem = jest.fn().mockResolvedValue(undefined);
  });

  describe('saveSetting', () => {
    it('saves to AsyncStorage and does not call axios when no core token', async () => {
      // First call to getItem is for core_token and should return null
      AsyncStorage.getItem = jest.fn().mockResolvedValueOnce(null);

      await saveSetting('testKey', { foo: 'bar' });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('testKey', JSON.stringify({ foo: 'bar' }));
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('saves to AsyncStorage and posts to cloud when core token exists', async () => {
      // First call to getItem is for core_token and should return a token
      AsyncStorage.getItem = jest.fn().mockResolvedValueOnce('any');

      await saveSetting('key1', 123);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('key1', JSON.stringify(123));
      expect(axios.post).toHaveBeenCalledWith(
        `http://${CLOUD_URL}/api/augmentos-settings`,
        { key1: 123 },
        { headers: { Authorization: 'Bearer any' } },
      );
    });
  });

  describe('loadSetting', () => {
    it('returns value from AsyncStorage if exists', async () => {
      // Setup AsyncStorage.getItem to return a value for the specific key
      AsyncStorage.getItem = jest.fn((key) => {
        if (key === 'key1') {
          return Promise.resolve(JSON.stringify('storedValue'));
        }
        return Promise.resolve(null);
      });

      const result = await loadSetting('key1', 'defaultVal');

      expect(result).toBe('storedValue');
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('returns defaultValue if no value in storage and no core token', async () => {
      // Both calls to getItem should return null
      AsyncStorage.getItem = jest.fn().mockResolvedValue(null);

      const result = await loadSetting('key2', 'def');

      expect(result).toBe('def');
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('fetches from cloud when no storage and core token exists, caches and returns value', async () => {
      // Setup AsyncStorage.getItem to return null for the setting key but a token for core_token
      let callCount = 0;
      AsyncStorage.getItem = jest.fn((_key) => {
        callCount++;
        if (callCount === 1) {return Promise.resolve(null);} // First call for key2
        if (callCount === 2) {return Promise.resolve('token');} // Second call for core_token
        return Promise.resolve(null);
      });

      axios.get = jest.fn().mockResolvedValueOnce({
        data: { success: true, settings: { key2: 'cloudVal' } },
      });

      const result = await loadSetting('key2', 'def');

      expect(axios.get).toHaveBeenCalledWith(
        `http://${CLOUD_URL}/api/augmentos-settings`,
        { headers: { Authorization: 'Bearer token' } }
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('key2', JSON.stringify('cloudVal'));
      expect(result).toBe('cloudVal');
    });

    it('returns defaultValue if cloud response has no valid settings', async () => {
      // Setup AsyncStorage.getItem to return null for the setting key but a token for core_token
      let callCount = 0;
      AsyncStorage.getItem = jest.fn((_key) => {
        callCount++;
        if (callCount === 1) {return Promise.resolve(null);} // First call for key3
        if (callCount === 2) {return Promise.resolve('token');} // Second call for core_token
        return Promise.resolve(null);
      });

      axios.get = jest.fn().mockResolvedValueOnce({ data: { success: false } });

      const result = await loadSetting('key3', 'def3');
      expect(result).toBe('def3');
    });

    it('returns defaultValue on axios.get failure', async () => {
      // Setup AsyncStorage.getItem to return null for the setting key but a token for core_token
      let callCount = 0;
      AsyncStorage.getItem = jest.fn((_key) => {
        callCount++;
        if (callCount === 1) {return Promise.resolve(null);} // First call for keyX
        if (callCount === 2) {return Promise.resolve('token');} // Second call for core_token
        return Promise.resolve(null);
      });

      axios.get = jest.fn().mockRejectedValueOnce(new Error('network error'));

      const result = await loadSetting('keyX', 'defX');
      expect(result).toBe('defX');
    });
  });
});
