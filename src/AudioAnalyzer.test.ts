import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { AudioAnalyzer } from './AudioAnalyzer';

describe('AudioAnalyzer', () => {
  describe('Property-Based Tests', () => {
    /**
     * Feature: singing-flower-art, Property 1: 音声データの継続的な取得
     * Validates: Requirements 1.2, 1.3, 1.4
     * 
     * 任意のマイクアクセス許可後、Audio_Analyzerは音声データを継続的に取得し、
     * 音量と音高を計算する
     */
    it('Property 1: continuously retrieves audio data and calculates volume and pitch', async () => {
      // モックのAudioContextとAnalyserNodeを作成
      const mockAnalyserNode = {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 1024,
        getByteTimeDomainData: vi.fn((array: Uint8Array) => {
          // 有効な音声データをシミュレート（128を中心とした正弦波）
          for (let i = 0; i < array.length; i++) {
            array[i] = 128 + Math.floor(50 * Math.sin(i * 0.1));
          }
        }),
        disconnect: vi.fn()
      };

      const mockMicrophone = {
        connect: vi.fn(),
        disconnect: vi.fn()
      };

      const mockAudioContext = {
        createAnalyser: vi.fn(() => mockAnalyserNode),
        createMediaStreamSource: vi.fn(() => mockMicrophone),
        sampleRate: 44100,
        close: vi.fn()
      };

      // グローバルのAudioContextをモック
      global.AudioContext = vi.fn(() => mockAudioContext as any) as any;
      global.navigator.mediaDevices = {
        getUserMedia: vi.fn().mockResolvedValue({} as MediaStream)
      } as any;

      const analyzer = new AudioAnalyzer();

      // 初期化
      await analyzer.initialize();

      // プロパティ: 任意の回数の連続した取得に対して、
      // 音量と音高が有効な範囲内の値を返すことを検証
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (iterations) => {
            const volumes: number[] = [];
            const pitches: number[] = [];

            // 複数回の取得をシミュレート
            for (let i = 0; i < iterations; i++) {
              const volume = analyzer.getVolume();
              const pitch = analyzer.getPitch();

              volumes.push(volume);
              pitches.push(pitch);

              // 音量は0-100の範囲
              if (volume < 0 || volume > 100) {
                return false;
              }

              // 音高は0以上（0は無音）
              if (pitch < 0) {
                return false;
              }
            }

            // 継続的に取得できることを確認
            if (volumes.length !== iterations || pitches.length !== iterations) {
              return false;
            }

            // アクティブ状態を確認
            if (!analyzer.isActive()) {
              return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );

      analyzer.dispose();
    });
  });

  describe('Unit Tests', () => {
    let analyzer: AudioAnalyzer;
    let mockAudioContext: any;
    let mockAnalyserNode: any;
    let mockMicrophone: any;

    beforeEach(() => {
      // モックのセットアップ
      mockAnalyserNode = {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 1024,
        getByteTimeDomainData: vi.fn((array: Uint8Array) => {
          // デフォルトで無音データ
          for (let i = 0; i < array.length; i++) {
            array[i] = 128;
          }
        }),
        disconnect: vi.fn()
      };

      mockMicrophone = {
        connect: vi.fn(),
        disconnect: vi.fn()
      };

      mockAudioContext = {
        createAnalyser: vi.fn(() => mockAnalyserNode),
        createMediaStreamSource: vi.fn(() => mockMicrophone),
        sampleRate: 44100,
        close: vi.fn()
      };

      global.AudioContext = vi.fn(() => mockAudioContext) as any;
      global.navigator.mediaDevices = {
        getUserMedia: vi.fn().mockResolvedValue({} as MediaStream)
      } as any;

      analyzer = new AudioAnalyzer();
    });

    afterEach(() => {
      analyzer.dispose();
      vi.clearAllMocks();
    });

    it('initializes successfully with microphone access', async () => {
      await analyzer.initialize();

      expect(analyzer.isActive()).toBe(true);
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
      expect(mockMicrophone.connect).toHaveBeenCalledWith(mockAnalyserNode);
    });

    it('returns volume in range 0-100', async () => {
      await analyzer.initialize();

      const volume = analyzer.getVolume();

      expect(volume).toBeGreaterThanOrEqual(0);
      expect(volume).toBeLessThanOrEqual(100);
    });

    it('returns pitch as frequency in Hz', async () => {
      await analyzer.initialize();

      const pitch = analyzer.getPitch();

      expect(pitch).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 for volume and pitch when not initialized', () => {
      const volume = analyzer.getVolume();
      const pitch = analyzer.getPitch();

      expect(volume).toBe(0);
      expect(pitch).toBe(0);
    });

    it('disposes resources correctly', async () => {
      await analyzer.initialize();
      analyzer.dispose();

      expect(analyzer.isActive()).toBe(false);
      expect(mockMicrophone.disconnect).toHaveBeenCalled();
      expect(mockAnalyserNode.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  describe('Error Handling Tests', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('throws error when microphone access is denied', async () => {
      const notAllowedError = new Error('Permission denied');
      notAllowedError.name = 'NotAllowedError';

      global.navigator.mediaDevices = {
        getUserMedia: vi.fn().mockRejectedValue(notAllowedError)
      } as any;

      global.AudioContext = vi.fn(() => ({
        createAnalyser: vi.fn(),
        createMediaStreamSource: vi.fn(),
        sampleRate: 44100,
        close: vi.fn()
      })) as any;

      const analyzer = new AudioAnalyzer();

      await expect(analyzer.initialize()).rejects.toThrow('マイクアクセスが拒否されました');
    });

    it('throws error when microphone is not found', async () => {
      const notFoundError = new Error('Microphone not found');
      notFoundError.name = 'NotFoundError';

      global.navigator.mediaDevices = {
        getUserMedia: vi.fn().mockRejectedValue(notFoundError)
      } as any;

      global.AudioContext = vi.fn(() => ({
        createAnalyser: vi.fn(),
        createMediaStreamSource: vi.fn(),
        sampleRate: 44100,
        close: vi.fn()
      })) as any;

      const analyzer = new AudioAnalyzer();

      await expect(analyzer.initialize()).rejects.toThrow('マイクが見つかりません');
    });

    it('throws error when Web Audio API is not supported', async () => {
      // AudioContextを未定義にする
      (global as any).AudioContext = undefined;
      (global as any).webkitAudioContext = undefined;

      const analyzer = new AudioAnalyzer();

      await expect(analyzer.initialize()).rejects.toThrow('Web Audio APIがサポートされていません');
    });
  });
});
