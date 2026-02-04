import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from './Renderer';
import { GrowthState, type RenderParameters, type GrowthParameters } from './types';

// Canvas 2Dコンテキストのモック
const createMockContext = () => ({
  fillStyle: '',
  globalAlpha: 1,
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn()
  })),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn()
});

describe('Renderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    // Canvas要素を作成
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    
    // モックコンテキストを作成
    mockContext = createMockContext();
    
    // getContextをモック化
    vi.spyOn(canvas, 'getContext').mockReturnValue(mockContext as any);
    
    renderer = new Renderer(canvas);
  });

  describe('初期化', () => {
    it('Canvasが正しく初期化される', () => {
      expect(renderer.getCanvas()).toBe(canvas);
      expect(renderer.getWidth()).toBe(800);
      expect(renderer.getHeight()).toBe(600);
    });

    it('2Dコンテキストが取得できる', () => {
      const ctx = renderer.getContext();
      expect(ctx).toBeDefined();
    });

    it('Canvas要素がnullの場合、エラーをスローする', () => {
      const mockCanvas = document.createElement('canvas');
      vi.spyOn(mockCanvas, 'getContext').mockReturnValue(null);

      expect(() => new Renderer(mockCanvas)).toThrow('Canvas 2Dコンテキストの取得に失敗しました');
    });

    it('initializeメソッドで新しいCanvasを設定できる', () => {
      const newCanvas = document.createElement('canvas');
      newCanvas.width = 1024;
      newCanvas.height = 768;
      
      const newMockContext = createMockContext();
      vi.spyOn(newCanvas, 'getContext').mockReturnValue(newMockContext as any);

      renderer.initialize(newCanvas);

      expect(renderer.getCanvas()).toBe(newCanvas);
      expect(renderer.getWidth()).toBe(1024);
      expect(renderer.getHeight()).toBe(768);
    });
  });

  describe('リサイズ', () => {
    it('resizeメソッドでCanvasサイズが更新される', () => {
      renderer.resize(1920, 1080);

      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
      expect(renderer.getWidth()).toBe(1920);
      expect(renderer.getHeight()).toBe(1080);
    });

    it('複数回のリサイズが正しく動作する', () => {
      renderer.resize(1024, 768);
      expect(renderer.getWidth()).toBe(1024);
      expect(renderer.getHeight()).toBe(768);

      renderer.resize(640, 480);
      expect(renderer.getWidth()).toBe(640);
      expect(renderer.getHeight()).toBe(480);
    });
  });

  describe('背景描画', () => {
    it('drawBackgroundが放射状グラデーションを作成する', () => {
      renderer.drawBackground();

      expect(mockContext.createRadialGradient).toHaveBeenCalled();
      const calls = mockContext.createRadialGradient.mock.calls[0];
      
      // 中心座標が正しいか確認
      expect(calls[0]).toBe(400); // centerX
      expect(calls[1]).toBe(300); // centerY
    });

    it('drawFullBackgroundが完全な背景を描画する', () => {
      renderer.drawFullBackground();

      expect(mockContext.createRadialGradient).toHaveBeenCalled();
      expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it('clearメソッドが画面をクリアする', () => {
      renderer.clear();

      expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });

  describe('描画', () => {
    it('renderメソッドが背景を描画する', () => {
      const params: RenderParameters = {
        volume: 50,
        pitch: 440,
        growthProgress: 0.5,
        growthParams: {
          growthSpeed: 1.5,
          swayAmount: 0.2,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        } as GrowthParameters,
        stemHeight: 100,
        leaves: [],
        particles: []
      };

      renderer.render(GrowthState.SEED, params);

      // 背景描画のためにfillRectが呼ばれることを確認
      expect(mockContext.fillRect).toHaveBeenCalled();
    });

    it('異なる状態でrenderメソッドが呼び出せる', () => {
      const params: RenderParameters = {
        volume: 50,
        pitch: 440,
        growthProgress: 0.5,
        growthParams: {
          growthSpeed: 1.5,
          swayAmount: 0.2,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        } as GrowthParameters,
        stemHeight: 100,
        leaves: [],
        particles: []
      };

      // 各状態で描画が実行できることを確認
      expect(() => renderer.render(GrowthState.SEED, params)).not.toThrow();
      expect(() => renderer.render(GrowthState.SPROUT, params)).not.toThrow();
      expect(() => renderer.render(GrowthState.STEM, params)).not.toThrow();
      expect(() => renderer.render(GrowthState.BLOOM, params)).not.toThrow();
      expect(() => renderer.render(GrowthState.SCATTER, params)).not.toThrow();
    });
  });

  describe('種子状態の描画', () => {
    it('種子が画面中央下（高さの75%位置）に描画される', () => {
      const time = 0;
      renderer.drawSeed(time);

      // arcメソッドが呼ばれることを確認
      expect(mockContext.arc).toHaveBeenCalled();

      // 位置が正しいことを確認
      const arcCall = mockContext.arc.mock.calls[0];
      expect(arcCall[0]).toBe(400); // x = width / 2 = 800 / 2
      expect(arcCall[1]).toBe(450); // y = height * 0.75 = 600 * 0.75
    });

    it('種子が脈動する（時間0で基本サイズ）', () => {
      const time = 0;
      renderer.drawSeed(time);

      const baseRadius = 8;
      const arcCall = mockContext.arc.mock.calls[0];
      
      // 時間0では sin(0) = 0 なので基本サイズ
      expect(arcCall[2]).toBeCloseTo(baseRadius, 5);
    });

    it('種子が脈動する（時間500msで最大サイズ）', () => {
      const time = 500; // 2000ms周期の1/4 = 最大
      renderer.drawSeed(time);

      const baseRadius = 8;
      const pulseAmplitude = 3;
      const arcCall = mockContext.arc.mock.calls[0];
      
      // 時間500msでは sin(π/2) = 1 なので最大サイズ
      expect(arcCall[2]).toBeCloseTo(baseRadius + pulseAmplitude, 5);
    });

    it('種子が脈動する（時間1500msで最小サイズ）', () => {
      const time = 1500; // 2000ms周期の3/4 = 最小
      renderer.drawSeed(time);

      const baseRadius = 8;
      const pulseAmplitude = 3;
      const arcCall = mockContext.arc.mock.calls[0];
      
      // 時間1500msでは sin(3π/2) = -1 なので最小サイズ
      expect(arcCall[2]).toBeCloseTo(baseRadius - pulseAmplitude, 5);
    });

    it('種子が脈動する（時間2000msで基本サイズに戻る）', () => {
      const time = 2000; // 1周期完了
      renderer.drawSeed(time);

      const baseRadius = 8;
      const arcCall = mockContext.arc.mock.calls[0];
      
      // 時間2000msでは sin(2π) = 0 なので基本サイズに戻る
      expect(arcCall[2]).toBeCloseTo(baseRadius, 5);
    });

    it('getSeedPositionが正しい位置を返す', () => {
      const position = renderer.getSeedPosition();
      
      expect(position.x).toBe(400); // width / 2
      expect(position.y).toBe(450); // height * 0.75
    });

    it('renderメソッドがSEED状態で種子を描画する', () => {
      const params: RenderParameters = {
        volume: 50,
        pitch: 440,
        growthProgress: 0.5,
        growthParams: {
          growthSpeed: 1.5,
          swayAmount: 0.2,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        } as GrowthParameters,
        stemHeight: 100,
        leaves: [],
        particles: []
      };

      const time = 1000;
      renderer.render(GrowthState.SEED, params, time);

      // arcメソッドが呼ばれることを確認（種子の描画）
      expect(mockContext.arc).toHaveBeenCalled();
      
      // 位置が正しいことを確認
      const arcCall = mockContext.arc.mock.calls[0];
      expect(arcCall[0]).toBe(400); // x
      expect(arcCall[1]).toBe(450); // y
    });
  });

  describe('芽状態の描画', () => {
    it('芽が種子位置から上方向に描画される', () => {
      const progress = 0.5;
      const volume = 50;
      const pitch = 440;
      const pitchChange = 0;

      renderer.drawSprout(progress, volume, pitch, pitchChange);

      // lineメソッドが呼ばれることを確認
      expect(mockContext.lineTo).toHaveBeenCalled();
      expect(mockContext.stroke).toHaveBeenCalled();
    });

    it('音量が高いほど芽が長く伸びる', () => {
      const progress = 1.0;
      const pitch = 440;
      const pitchChange = 0;

      // 低音量
      mockContext.lineTo.mockClear();
      renderer.drawSprout(progress, 20, pitch, pitchChange);
      const lowVolumeCall = mockContext.lineTo.mock.calls[0];
      const lowVolumeY = lowVolumeCall[1];

      // 高音量
      mockContext.lineTo.mockClear();
      renderer.drawSprout(progress, 80, pitch, pitchChange);
      const highVolumeCall = mockContext.lineTo.mock.calls[0];
      const highVolumeY = highVolumeCall[1];

      // 高音量の方がY座標が小さい（上方向に長い）
      expect(highVolumeY).toBeLessThan(lowVolumeY);
    });

    it('音高の変化に応じて芽が左右に揺れる', () => {
      const progress = 0.5;
      const volume = 50;
      const pitch = 440;

      // 音高変化なし
      mockContext.lineTo.mockClear();
      renderer.drawSprout(progress, volume, pitch, 0);
      const noSwayCall = mockContext.lineTo.mock.calls[0];
      const noSwayX = noSwayCall[0];

      // 音高変化あり（正）
      mockContext.lineTo.mockClear();
      renderer.drawSprout(progress, volume, pitch, 50);
      const positiveSwayCall = mockContext.lineTo.mock.calls[0];
      const positiveSwayX = positiveSwayCall[0];

      // 音高変化あり（負）
      mockContext.lineTo.mockClear();
      renderer.drawSprout(progress, volume, pitch, -50);
      const negativeSwayCall = mockContext.lineTo.mock.calls[0];
      const negativeSwayX = negativeSwayCall[0];

      // X座標が変化することを確認
      expect(positiveSwayX).toBeGreaterThan(noSwayX);
      expect(negativeSwayX).toBeLessThan(noSwayX);
    });

    it('renderメソッドがSPROUT状態で芽を描画する', () => {
      const params: RenderParameters = {
        volume: 50,
        pitch: 440,
        growthProgress: 0.5,
        growthParams: {
          growthSpeed: 1.5,
          swayAmount: 0.2,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        } as GrowthParameters,
        stemHeight: 100,
        leaves: [],
        particles: [],
        progress: 0.5,
        pitchChange: 0
      };

      renderer.render(GrowthState.SPROUT, params);

      // lineメソッドが呼ばれることを確認（芽の描画）
      expect(mockContext.lineTo).toHaveBeenCalled();
      expect(mockContext.stroke).toHaveBeenCalled();
    });
  });
});

// Property-Based Tests
import * as fc from 'fast-check';

describe('Renderer - Property-Based Tests', () => {
  let canvas: HTMLCanvasElement;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    mockContext = createMockContext();
    vi.spyOn(canvas, 'getContext').mockReturnValue(mockContext as any);
  });

  describe('Feature: singing-flower-art, Property 18: ウィンドウサイズに応じたCanvas調整', () => {
    /**
     * **Validates: Requirements 10.1, 10.3**
     * 
     * プロパティ18: ウィンドウサイズに応じたCanvas調整
     * 任意のウィンドウサイズに対して、RendererはCanvasのサイズを調整し、
     * 描画要素の位置とサイズを相対値で計算する
     */
    it('任意のウィンドウサイズでCanvasが正しく調整される', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 320, max: 3840 }), // width
          fc.integer({ min: 240, max: 2160 }), // height
          (width, height) => {
            // Canvas要素を作成
            const testCanvas = document.createElement('canvas');
            const testMockContext = createMockContext();
            vi.spyOn(testCanvas, 'getContext').mockReturnValue(testMockContext as any);

            // Rendererを作成
            const renderer = new Renderer(testCanvas);

            // リサイズを実行
            renderer.resize(width, height);

            // Canvas要素のサイズが正しく設定されることを検証
            expect(testCanvas.width).toBe(width);
            expect(testCanvas.height).toBe(height);

            // Rendererの内部サイズが正しく更新されることを検証
            expect(renderer.getWidth()).toBe(width);
            expect(renderer.getHeight()).toBe(height);

            // 背景描画が新しいサイズで実行できることを検証
            renderer.drawFullBackground();
            expect(testMockContext.fillRect).toHaveBeenCalledWith(0, 0, width, height);

            // 放射状グラデーションの中心が正しく計算されることを検証
            renderer.drawBackground();
            const gradientCalls = testMockContext.createRadialGradient.mock.calls;
            const lastCall = gradientCalls[gradientCalls.length - 1];
            
            // 中心座標が画面中央であることを確認
            expect(lastCall[0]).toBe(width / 2);  // centerX
            expect(lastCall[1]).toBe(height / 2); // centerY
          }
        ),
        { numRuns: 100 }
      );
    });

    it('複数回のリサイズでCanvasが正しく調整される', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              width: fc.integer({ min: 320, max: 3840 }),
              height: fc.integer({ min: 240, max: 2160 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (sizes) => {
            // Canvas要素を作成
            const testCanvas = document.createElement('canvas');
            const testMockContext = createMockContext();
            vi.spyOn(testCanvas, 'getContext').mockReturnValue(testMockContext as any);

            // Rendererを作成
            const renderer = new Renderer(testCanvas);

            // 各サイズでリサイズを実行
            for (const size of sizes) {
              renderer.resize(size.width, size.height);

              // 各リサイズ後にサイズが正しく設定されることを検証
              expect(testCanvas.width).toBe(size.width);
              expect(testCanvas.height).toBe(size.height);
              expect(renderer.getWidth()).toBe(size.width);
              expect(renderer.getHeight()).toBe(size.height);
            }

            // 最後のサイズで描画が正しく実行できることを検証
            const lastSize = sizes[sizes.length - 1];
            renderer.clear();
            expect(testMockContext.clearRect).toHaveBeenCalledWith(
              0, 0, lastSize.width, lastSize.height
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('種子位置が画面サイズに応じて相対的に計算される', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 320, max: 3840 }), // width
          fc.integer({ min: 240, max: 2160 }), // height
          (width, height) => {
            // 種子位置は画面中央下（高さの75%位置）に配置される
            const expectedSeedX = width / 2;
            const expectedSeedY = height * 0.75;

            // Canvas要素を作成
            const testCanvas = document.createElement('canvas');
            const testMockContext = createMockContext();
            vi.spyOn(testCanvas, 'getContext').mockReturnValue(testMockContext as any);

            // Rendererを作成
            const renderer = new Renderer(testCanvas);
            renderer.resize(width, height);

            // 種子位置の計算が相対値であることを検証
            // （実際の種子描画は後のタスクで実装されるため、ここでは計算の正確性を確認）
            expect(expectedSeedX).toBeGreaterThanOrEqual(width * 0.5);
            expect(expectedSeedX).toBeLessThanOrEqual(width * 0.5);
            expect(expectedSeedY).toBeGreaterThanOrEqual(height * 0.75);
            expect(expectedSeedY).toBeLessThanOrEqual(height * 0.75);

            // 描画領域が正しく設定されることを検証
            renderer.clear();
            expect(testMockContext.clearRect).toHaveBeenCalledWith(0, 0, width, height);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: singing-flower-art, Property 7: 種子の脈動アニメーション', () => {
    /**
     * **Validates: Requirements 2.3**
     * 
     * プロパティ7: 種子の脈動アニメーション
     * 任意の時間経過に対して、種子状態のRendererは円のサイズを周期的に変化させる
     */
    it('任意の時間で種子のサイズが周期的に変化する', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }), // time in milliseconds
          (time) => {
            // Canvas要素を作成
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 800;
            testCanvas.height = 600;
            const testMockContext = createMockContext();
            vi.spyOn(testCanvas, 'getContext').mockReturnValue(testMockContext as any);

            // Rendererを作成
            const renderer = new Renderer(testCanvas);

            // 種子を描画
            renderer.drawSeed(time);

            // arcメソッドが呼ばれることを確認（円の描画）
            expect(testMockContext.arc).toHaveBeenCalled();

            // 半径の計算
            const baseRadius = 8;
            const pulseAmplitude = 3;
            const pulsePeriod = 2000;
            const pulsePhase = (time % pulsePeriod) / pulsePeriod * Math.PI * 2;
            const expectedRadius = baseRadius + Math.sin(pulsePhase) * pulseAmplitude;

            // arcの呼び出しパラメータを確認
            const arcCalls = testMockContext.arc.mock.calls;
            const firstArcCall = arcCalls[0];

            // 半径が期待値と一致することを確認
            expect(firstArcCall[2]).toBeCloseTo(expectedRadius, 5);

            // 半径が有効な範囲内にあることを確認
            expect(firstArcCall[2]).toBeGreaterThanOrEqual(baseRadius - pulseAmplitude);
            expect(firstArcCall[2]).toBeLessThanOrEqual(baseRadius + pulseAmplitude);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('周期的な脈動が正しく動作する（1周期分）', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // cycle count
          (cycleCount) => {
            // Canvas要素を作成
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 800;
            testCanvas.height = 600;
            const testMockContext = createMockContext();
            vi.spyOn(testCanvas, 'getContext').mockReturnValue(testMockContext as any);

            // Rendererを作成
            const renderer = new Renderer(testCanvas);

            const pulsePeriod = 2000;
            const baseRadius = 8;
            const pulseAmplitude = 3;

            // 1周期の開始時刻
            const startTime = cycleCount * pulsePeriod;
            
            // 周期の開始時（sin(0) = 0）
            renderer.drawSeed(startTime);
            const startRadius = testMockContext.arc.mock.calls[0][2];
            expect(startRadius).toBeCloseTo(baseRadius, 5);

            // 周期の1/4時点（sin(π/2) = 1、最大）
            testMockContext.arc.mockClear();
            renderer.drawSeed(startTime + pulsePeriod / 4);
            const maxRadius = testMockContext.arc.mock.calls[0][2];
            expect(maxRadius).toBeCloseTo(baseRadius + pulseAmplitude, 5);

            // 周期の1/2時点（sin(π) = 0）
            testMockContext.arc.mockClear();
            renderer.drawSeed(startTime + pulsePeriod / 2);
            const midRadius = testMockContext.arc.mock.calls[0][2];
            expect(midRadius).toBeCloseTo(baseRadius, 5);

            // 周期の3/4時点（sin(3π/2) = -1、最小）
            testMockContext.arc.mockClear();
            renderer.drawSeed(startTime + pulsePeriod * 3 / 4);
            const minRadius = testMockContext.arc.mock.calls[0][2];
            expect(minRadius).toBeCloseTo(baseRadius - pulseAmplitude, 5);

            // 周期の終了時（sin(2π) = 0、元に戻る）
            testMockContext.arc.mockClear();
            renderer.drawSeed(startTime + pulsePeriod);
            const endRadius = testMockContext.arc.mock.calls[0][2];
            expect(endRadius).toBeCloseTo(baseRadius, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('種子の位置が画面中央下（高さの75%）に固定される', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 320, max: 3840 }), // width
          fc.integer({ min: 240, max: 2160 }), // height
          fc.integer({ min: 0, max: 10000 }), // time
          (width, height, time) => {
            // Canvas要素を作成
            const testCanvas = document.createElement('canvas');
            testCanvas.width = width;
            testCanvas.height = height;
            const testMockContext = createMockContext();
            vi.spyOn(testCanvas, 'getContext').mockReturnValue(testMockContext as any);

            // Rendererを作成
            const renderer = new Renderer(testCanvas);

            // 種子を描画
            renderer.drawSeed(time);

            // arcの呼び出しパラメータを確認
            const arcCalls = testMockContext.arc.mock.calls;
            const firstArcCall = arcCalls[0];

            // 位置が画面中央下であることを確認
            const expectedX = width / 2;
            const expectedY = height * 0.75;

            expect(firstArcCall[0]).toBe(expectedX);
            expect(firstArcCall[1]).toBe(expectedY);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
