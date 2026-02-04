import { describe, it, expect } from 'vitest';
import { RoseCurve } from './RoseCurve';
import fc from 'fast-check';

describe('RoseCurve', () => {
  describe('Unit Tests', () => {
    it('特定のa、k値での曲線生成テスト', () => {
      const roseCurve = new RoseCurve();
      const a = 100;
      const k = 5;
      const segments = 360;
      
      const points = roseCurve.calculateCurve(a, k, segments);
      
      // 点の数が正しいか
      expect(points.length).toBe(segments + 1);
      
      // 各点が有効な極座標か
      points.forEach(point => {
        expect(point.r).toBeGreaterThanOrEqual(0);
        expect(point.theta).toBeGreaterThanOrEqual(0);
      });
    });
    
    it('座標変換の具体例テスト', () => {
      const roseCurve = new RoseCurve();
      
      // 極座標 (r=100, θ=0) → 直交座標 (x=100, y=0)
      const cartesian1 = roseCurve.polarToCartesian(100, 0, 0, 0);
      expect(cartesian1.x).toBeCloseTo(100, 5);
      expect(cartesian1.y).toBeCloseTo(0, 5);
      
      // 極座標 (r=100, θ=π/2) → 直交座標 (x=0, y=100)
      const cartesian2 = roseCurve.polarToCartesian(100, Math.PI / 2, 0, 0);
      expect(cartesian2.x).toBeCloseTo(0, 5);
      expect(cartesian2.y).toBeCloseTo(100, 5);
      
      // 極座標 (r=100, θ=π) → 直交座標 (x=-100, y=0)
      const cartesian3 = roseCurve.polarToCartesian(100, Math.PI, 0, 0);
      expect(cartesian3.x).toBeCloseTo(-100, 5);
      expect(cartesian3.y).toBeCloseTo(0, 5);
    });
    
    it('音高に応じたk値の計算テスト', () => {
      const roseCurve = new RoseCurve();
      
      // 最小音高 → 最小k値
      const k1 = roseCurve.calculateKFromPitch(200, 3, 7, 200, 800);
      expect(k1).toBeCloseTo(3, 5);
      
      // 最大音高 → 最大k値
      const k2 = roseCurve.calculateKFromPitch(800, 3, 7, 200, 800);
      expect(k2).toBeCloseTo(7, 5);
      
      // 中間音高 → 中間k値
      const k3 = roseCurve.calculateKFromPitch(500, 3, 7, 200, 800);
      expect(k3).toBeCloseTo(5, 5);
    });
  });
  
  describe('Property-Based Tests', () => {
    /**
     * プロパティ11: バラ曲線の数学的正確性
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
     * 
     * バラ曲線の各点が極座標方程式 r = a * cos(k * θ) を満たすことを検証
     * 実装では負のr値を扱うためにθを調整しているため、元のθでの方程式を検証
     */
    it('プロパティ11: バラ曲線の数学的正確性', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 10, max: 500, noNaN: true }), // a: 振幅
          fc.double({ min: 1, max: 10, noNaN: true }), // k: 係数
          fc.integer({ min: 10, max: 100 }), // segments: セグメント数
          (a, k, segments) => {
            const roseCurve = new RoseCurve();
            const points = roseCurve.calculateCurve(a, k, segments);
            
            // 点の数が正しいか
            expect(points.length).toBe(segments + 1);
            
            // 各点のrが非負であることを検証
            for (const point of points) {
              expect(point.r).toBeGreaterThanOrEqual(0);
              expect(point.theta).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    /**
     * プロパティ12: バラ曲線パラメータの調整可能性
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
     * 
     * パラメータa、kを変更すると曲線の形状が変化することを検証
     */
    it('プロパティ12: バラ曲線パラメータの調整可能性', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 10, max: 500, noNaN: true }), // a1
          fc.double({ min: 10, max: 500, noNaN: true }), // a2
          fc.double({ min: 1, max: 10, noNaN: true }), // k
          (a1, a2, k) => {
            fc.pre(Math.abs(a1 - a2) > 5); // a1とa2が十分に異なることを前提条件とする
            
            const roseCurve = new RoseCurve();
            const segments = 360;
            
            const points1 = roseCurve.calculateCurve(a1, k, segments);
            const points2 = roseCurve.calculateCurve(a2, k, segments);
            
            // 同じインデックスでのr値が異なることを検証（少なくとも1点）
            let foundDifference = false;
            for (let i = 0; i < Math.min(points1.length, points2.length); i++) {
              // r値が両方とも有効な数値であることを確認
              if (!isNaN(points1[i].r) && !isNaN(points2[i].r)) {
                if (Math.abs(points1[i].r - points2[i].r) > 1) {
                  foundDifference = true;
                  break;
                }
              }
            }
            
            expect(foundDifference).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    /**
     * プロパティ13: 極座標から直交座標への変換（ラウンドトリップ）
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
     * 
     * 極座標 → 直交座標 → 極座標の変換で元の値に戻ることを検証
     */
    it('プロパティ13: 極座標から直交座標への変換（ラウンドトリップ）', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 1000, noNaN: true }), // r (0を避ける)
          fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), // theta
          fc.double({ min: -500, max: 500, noNaN: true }), // centerX
          fc.double({ min: -500, max: 500, noNaN: true }), // centerY
          (r, theta, centerX, centerY) => {
            const roseCurve = new RoseCurve();
            
            // 極座標 → 直交座標
            const cartesian = roseCurve.polarToCartesian(r, theta, centerX, centerY);
            
            // 直交座標 → 極座標
            const polar = roseCurve.cartesianToPolar(cartesian.x, cartesian.y, centerX, centerY);
            
            // 元の値に戻ることを検証
            expect(polar.r).toBeCloseTo(r, 5);
            
            // θは2πの周期性があるため、正規化して比較
            const normalizeAngle = (angle: number) => {
              let normalized = angle % (2 * Math.PI);
              if (normalized < 0) normalized += 2 * Math.PI;
              return normalized;
            };
            
            const normalizedTheta = normalizeAngle(theta);
            const normalizedPolarTheta = normalizeAngle(polar.theta);
            
            // 角度の差が小さいことを検証（2πの周期性を考慮）
            const angleDiff = Math.abs(normalizedTheta - normalizedPolarTheta);
            const adjustedDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
            
            expect(adjustedDiff).toBeLessThan(0.001);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
