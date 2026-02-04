import { describe, it, expect, beforeEach } from 'vitest';
import { GrowthController } from './GrowthController';
import * as fc from 'fast-check';

describe('GrowthController', () => {
  let controller: GrowthController;

  beforeEach(() => {
    controller = new GrowthController();
  });

  describe('基本機能', () => {
    it('updateメソッドが成長パラメータを返す', () => {
      const params = controller.update(50, 300, 0.016);
      
      expect(params).toHaveProperty('growthSpeed');
      expect(params).toHaveProperty('swayAmount');
      expect(params).toHaveProperty('colorHue');
      expect(params).toHaveProperty('colorSaturation');
      expect(params).toHaveProperty('colorLightness');
    });

    it('基準音高を設定・取得できる', () => {
      controller.setBasePitch(440);
      expect(controller.getBasePitch()).toBe(440);
    });
  });

  describe('成長速度の計算', () => {
    it('音量0で成長速度が1.0倍', () => {
      const params = controller.update(0, 300, 0.016);
      expect(params.growthSpeed).toBeCloseTo(1.0, 5);
    });

    it('音量100で成長速度が3.0倍', () => {
      const params = controller.update(100, 300, 0.016);
      expect(params.growthSpeed).toBeCloseTo(3.0, 5);
    });

    it('音量50で成長速度が2.0倍', () => {
      const params = controller.update(50, 300, 0.016);
      expect(params.growthSpeed).toBeCloseTo(2.0, 5);
    });
  });

  describe('揺れの計算', () => {
    it('基準音高で揺れが0', () => {
      const params = controller.update(50, 300, 0.016);
      expect(params.swayAmount).toBeCloseTo(0, 5);
    });

    it('基準音高より高い音で正の揺れ', () => {
      const params = controller.update(50, 400, 0.016);
      expect(params.swayAmount).toBeGreaterThan(0);
    });

    it('基準音高より低い音で負の揺れ', () => {
      const params = controller.update(50, 200, 0.016);
      expect(params.swayAmount).toBeLessThan(0);
    });
  });

  describe('色の計算', () => {
    it('低い音（200Hz）で緑色（色相120°）', () => {
      const params = controller.update(50, 200, 0.016);
      expect(params.colorHue).toBeCloseTo(120, 5);
    });

    it('高い音（400Hz）でシアン色（色相180°）', () => {
      const params = controller.update(50, 400, 0.016);
      expect(params.colorHue).toBeCloseTo(180, 5);
    });

    it('音高が高いほど明度が高い', () => {
      const params1 = controller.update(50, 200, 0.016);
      const params2 = controller.update(50, 400, 0.016);
      expect(params2.colorLightness).toBeGreaterThan(params1.colorLightness);
    });
  });
});

// Property-Based Tests
describe('GrowthController - Property-Based Tests', () => {
  let controller: GrowthController;

  beforeEach(() => {
    controller = new GrowthController();
  });

  describe('Feature: singing-flower-art, Property 4: 音量による成長速度の変化', () => {
    /**
     * **Validates: Requirements 3.2, 4.2, 4.4**
     * 
     * プロパティ4: 音量による成長速度の変化
     * 任意の音量値に対して、GrowthControllerは音量が大きいほど
     * 成長速度（茎の伸び、葉の生成速度）を増加させる
     */
    it('音量が大きいほど成長速度が単調増加する', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }),
          fc.float({ min: 0, max: 100, noNaN: true }),
          fc.float({ min: 100, max: 500, noNaN: true }), // pitch
          fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }), // deltaTime
          (volume1, volume2, pitch, deltaTime) => {
            const params1 = controller.update(volume1, pitch, deltaTime);
            const params2 = controller.update(volume2, pitch, deltaTime);

            // 音量が大きい方が成長速度が速い（または同じ）
            if (volume1 < volume2) {
              expect(params1.growthSpeed).toBeLessThanOrEqual(params2.growthSpeed);
            } else if (volume1 > volume2) {
              expect(params1.growthSpeed).toBeGreaterThanOrEqual(params2.growthSpeed);
            } else {
              expect(params1.growthSpeed).toBeCloseTo(params2.growthSpeed, 5);
            }

            // 成長速度は常に正の値
            expect(params1.growthSpeed).toBeGreaterThan(0);
            expect(params2.growthSpeed).toBeGreaterThan(0);

            // 成長速度の範囲チェック（1.0〜3.0倍）
            expect(params1.growthSpeed).toBeGreaterThanOrEqual(1.0);
            expect(params1.growthSpeed).toBeLessThanOrEqual(3.0);
            expect(params2.growthSpeed).toBeGreaterThanOrEqual(1.0);
            expect(params2.growthSpeed).toBeLessThanOrEqual(3.0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: singing-flower-art, Property 5: 音高による色の変化', () => {
    /**
     * **Validates: Requirements 3.3, 4.5, 5.6**
     * 
     * プロパティ5: 音高による色の変化
     * 任意の音高値に対して、Rendererは音高が高いほど明るい色、
     * 低いほど深い色を適用する（芽、茎と葉、花）
     */
    it('音高が高いほど明度が高くなる', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 100, max: 600, noNaN: true }),
          fc.float({ min: 100, max: 600, noNaN: true }),
          fc.float({ min: 0, max: 100, noNaN: true }), // volume
          fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }), // deltaTime
          (pitch1, pitch2, volume, deltaTime) => {
            const params1 = controller.update(volume, pitch1, deltaTime);
            const params2 = controller.update(volume, pitch2, deltaTime);

            // 音高が高い方が明度が高い（または同じ）
            if (pitch1 < pitch2) {
              expect(params1.colorLightness).toBeLessThanOrEqual(params2.colorLightness);
            } else if (pitch1 > pitch2) {
              expect(params1.colorLightness).toBeGreaterThanOrEqual(params2.colorLightness);
            }

            // 明度の範囲チェック（30〜70%）
            expect(params1.colorLightness).toBeGreaterThanOrEqual(30);
            expect(params1.colorLightness).toBeLessThanOrEqual(70);
            expect(params2.colorLightness).toBeGreaterThanOrEqual(30);
            expect(params2.colorLightness).toBeLessThanOrEqual(70);

            // 色相の範囲チェック（120〜180°）
            expect(params1.colorHue).toBeGreaterThanOrEqual(120);
            expect(params1.colorHue).toBeLessThanOrEqual(180);
            expect(params2.colorHue).toBeGreaterThanOrEqual(120);
            expect(params2.colorHue).toBeLessThanOrEqual(180);

            // 彩度の範囲チェック（50〜80%）
            expect(params1.colorSaturation).toBeGreaterThanOrEqual(50);
            expect(params1.colorSaturation).toBeLessThanOrEqual(80);
            expect(params2.colorSaturation).toBeGreaterThanOrEqual(50);
            expect(params2.colorSaturation).toBeLessThanOrEqual(80);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Feature: singing-flower-art, Property 6: 音高変化による揺れ', () => {
    /**
     * **Validates: Requirements 3.4, 4.6**
     * 
     * プロパティ6: 音高変化による揺れ
     * 任意の音高変化に対して、Rendererは揺れの振幅を変化させる
     * （芽、茎と葉、花びら）
     */
    it('音高の変化に応じて揺れの振幅が変化する', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 100, max: 600, noNaN: true }), // pitch
          fc.float({ min: 0, max: 100, noNaN: true }), // volume
          fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }), // deltaTime
          (pitch, volume, deltaTime) => {
            const basePitch = controller.getBasePitch();
            const params = controller.update(volume, pitch, deltaTime);

            // 基準音高からの差分に応じて揺れが発生
            const expectedSway = (pitch - basePitch) / 100;
            expect(params.swayAmount).toBeCloseTo(expectedSway, 5);

            // 基準音高より高い音で正の揺れ
            if (pitch > basePitch) {
              expect(params.swayAmount).toBeGreaterThan(0);
            }
            // 基準音高より低い音で負の揺れ
            else if (pitch < basePitch) {
              expect(params.swayAmount).toBeLessThan(0);
            }
            // 基準音高で揺れなし
            else {
              expect(params.swayAmount).toBeCloseTo(0, 5);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('基準音高を変更すると揺れの計算が変わる', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 200, max: 400, noNaN: true }), // basePitch
          fc.float({ min: 100, max: 600, noNaN: true }), // pitch
          fc.float({ min: 0, max: 100, noNaN: true }), // volume
          fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }), // deltaTime
          (basePitch, pitch, volume, deltaTime) => {
            controller.setBasePitch(basePitch);
            const params = controller.update(volume, pitch, deltaTime);

            // 新しい基準音高からの差分に応じて揺れが計算される
            const expectedSway = (pitch - basePitch) / 100;
            expect(params.swayAmount).toBeCloseTo(expectedSway, 5);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('パラメータの一貫性', () => {
    it('同じ入力に対して常に同じ出力を返す（決定性）', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }), // volume
          fc.float({ min: 100, max: 600, noNaN: true }), // pitch
          fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }), // deltaTime
          (volume, pitch, deltaTime) => {
            const params1 = controller.update(volume, pitch, deltaTime);
            const params2 = controller.update(volume, pitch, deltaTime);

            expect(params1.growthSpeed).toBeCloseTo(params2.growthSpeed, 10);
            expect(params1.swayAmount).toBeCloseTo(params2.swayAmount, 10);
            expect(params1.colorHue).toBeCloseTo(params2.colorHue, 10);
            expect(params1.colorSaturation).toBeCloseTo(params2.colorSaturation, 10);
            expect(params1.colorLightness).toBeCloseTo(params2.colorLightness, 10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
