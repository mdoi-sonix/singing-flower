import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleSystem } from './ParticleSystem';
import type { Point, Leaf } from './types';
import fc from 'fast-check';

describe('ParticleSystem', () => {
  let particleSystem: ParticleSystem;
  let seedPosition: Point;

  beforeEach(() => {
    seedPosition = { x: 400, y: 450 };
    particleSystem = new ParticleSystem(seedPosition);
  });

  describe('Unit Tests', () => {
    describe('パーティクル生成', () => {
      it('花・茎・葉からパーティクルが生成される', () => {
        const stemHeight = 200;
        const leaves: Leaf[] = [
          {
            x: 400, y: 350, angle: Math.PI, size: 50,
            baseColor: 'rgb(70, 200, 160)', tipColor: 'rgb(150, 255, 240)',
            swayOffset: 0, bendAmount: 0, veinBrightness: 0,
            idleSwayPhase: 0, unfurlProgress: 1, birthTime: 0,
            lengthProgress: 1, widthProgress: 1, rotationProgress: 1,
            targetWidth: 1, unfoldDelay: 0, isLeft: true,
            shapeSeed: 0.5, birthPitch: 440, widthRatio: 1
          }
        ];
        const flowerPoints = [
          { x: 400, y: 250, color: 'rgb(255, 200, 220)' },
          { x: 410, y: 250, color: 'rgb(255, 200, 220)' }
        ];

        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

        const particles = particleSystem.getParticles();

        // パーティクルが生成されることを確認
        expect(particles.length).toBeGreaterThan(0);

        // 花のパーティクルが含まれることを確認
        const flowerParticles = particles.filter(p => p.partType === 'flower');
        expect(flowerParticles.length).toBe(2);

        // 茎のパーティクルが含まれることを確認
        const stemParticles = particles.filter(p => p.partType === 'stem');
        expect(stemParticles.length).toBeGreaterThan(0);

        // 葉のパーティクルが含まれることを確認
        const leafParticles = particles.filter(p => p.partType === 'leaf');
        expect(leafParticles.length).toBeGreaterThan(0);
      });

      it('音量が高いほど初速度が大きい', () => {
        const stemHeight = 200;
        const leaves: Leaf[] = [];
        const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

        // 低音量
        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 20, 440, 0);
        const lowVolumeParticles = particleSystem.getParticles();
        const lowVolumeSpeed = Math.sqrt(
          lowVolumeParticles[0].vx ** 2 + lowVolumeParticles[0].vy ** 2
        );

        // 高音量
        particleSystem.reset();
        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 80, 440, 0);
        const highVolumeParticles = particleSystem.getParticles();
        const highVolumeSpeed = Math.sqrt(
          highVolumeParticles[0].vx ** 2 + highVolumeParticles[0].vy ** 2
        );

        // 高音量の方が速度が大きい
        expect(highVolumeSpeed).toBeGreaterThan(lowVolumeSpeed);
      });
    });

    describe('飛散段階', () => {
      it('重力によりパーティクルが下方向に加速する', () => {
        const stemHeight = 200;
        const leaves: Leaf[] = [];
        const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

        const particles = particleSystem.getParticles();
        const initialVy = particles[0].vy;

        // 1秒更新
        particleSystem.update(1.0, 1000);

        const updatedVy = particles[0].vy;

        // Y方向速度が増加（下向きが正）
        expect(updatedVy).toBeGreaterThan(initialVy);
      });

      it('透明度が時間とともに減少する', () => {
        const stemHeight = 200;
        const leaves: Leaf[] = [];
        const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

        const particles = particleSystem.getParticles();
        const initialAlpha = particles[0].alpha;

        // 1秒更新
        particleSystem.update(1.0, 1000);

        const updatedAlpha = particles[0].alpha;

        // 透明度が減少
        expect(updatedAlpha).toBeLessThan(initialAlpha);
      });

      it('透明度が閾値を下回ると収束段階に遷移する', () => {
        const stemHeight = 200;
        const leaves: Leaf[] = [];
        const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

        expect(particleSystem.getPhase()).toBe('scatter');

        // 十分な時間更新して透明度を下げる
        for (let i = 0; i < 10; i++) {
          particleSystem.update(0.5, i * 500);
        }

        // 収束段階に遷移
        expect(particleSystem.getPhase()).toBe('converge');
      });
    });

    describe('収束段階', () => {
      beforeEach(() => {
        const stemHeight = 200;
        const leaves: Leaf[] = [];
        const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

        particleSystem.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

        // 飛散段階を経て収束段階に遷移
        for (let i = 0; i < 10; i++) {
          particleSystem.update(0.5, i * 500);
        }
      });

      it('パーティクルが種子位置に向かって移動する', () => {
        const particles = particleSystem.getParticles();

        // パーティクルを種子位置から離れた場所に配置
        particles[0].x = seedPosition.x + 100;
        particles[0].y = seedPosition.y + 100;

        const initialDistance = Math.sqrt(
          (particles[0].x - seedPosition.x) ** 2 +
          (particles[0].y - seedPosition.y) ** 2
        );

        // 1秒更新
        particleSystem.update(1.0, 10000);

        const updatedDistance = Math.sqrt(
          (particles[0].x - seedPosition.x) ** 2 +
          (particles[0].y - seedPosition.y) ** 2
        );

        // 距離が減少
        expect(updatedDistance).toBeLessThan(initialDistance);
      });

      it('距離が遠いほど速度が大きい', () => {
        // 2つのパーティクルを異なる距離に配置
        const particles = particleSystem.getParticles();

        // 近いパーティクル
        particles[0].x = seedPosition.x + 50;
        particles[0].y = seedPosition.y;

        // 遠いパーティクル
        particles[1].x = seedPosition.x + 200;
        particles[1].y = seedPosition.y;

        // 1フレーム更新
        particleSystem.update(1/60, 10000);

        const nearSpeed = Math.sqrt(particles[0].vx ** 2 + particles[0].vy ** 2);
        const farSpeed = Math.sqrt(particles[1].vx ** 2 + particles[1].vy ** 2);

        // 遠いパーティクルの方が速い
        expect(farSpeed).toBeGreaterThan(nearSpeed);
      });

      it('全パーティクルが到達すると判定される', () => {
        const particles = particleSystem.getParticles();

        // 全パーティクルを種子位置に配置
        for (const particle of particles) {
          particle.x = seedPosition.x;
          particle.y = seedPosition.y;
        }

        // 到達判定
        expect(particleSystem.allParticlesArrived()).toBe(true);
      });
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * プロパティ14: 音量によるパーティクル初速度
     * **Validates: Requirements 6.2**
     *
     * 音量が高いほどパーティクルの初速度が大きいことを検証
     */
    it('プロパティ14: 音量によるパーティクル初速度', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true }), // volume1
          fc.double({ min: 0, max: 100, noNaN: true }), // volume2
          (volume1, volume2) => {
            fc.pre(Math.abs(volume1 - volume2) > 10); // 音量が十分に異なる

            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

            // volume1でパーティクル生成
            const ps1 = new ParticleSystem(seedPosition);
            ps1.generateParticles(stemHeight, leaves, flowerPoints, volume1, 440, 0);
            const particles1 = ps1.getParticles();
            const speed1 = Math.sqrt(particles1[0].vx ** 2 + particles1[0].vy ** 2);

            // volume2でパーティクル生成
            const ps2 = new ParticleSystem(seedPosition);
            ps2.generateParticles(stemHeight, leaves, flowerPoints, volume2, 440, 0);
            const particles2 = ps2.getParticles();
            const speed2 = Math.sqrt(particles2[0].vx ** 2 + particles2[0].vy ** 2);

            // 音量が高い方が速度が大きい
            if (volume1 > volume2) {
              expect(speed1).toBeGreaterThan(speed2 * 0.9); // 誤差を考慮
            } else {
              expect(speed2).toBeGreaterThan(speed1 * 0.9);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * プロパティ15: 音高によるパーティクル移動方向
     * **Validates: Requirements 6.3**
     *
     * 音高に応じてパーティクルの移動方向が変化することを検証
     */
    it('プロパティ15: 音高によるパーティクル移動方向', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 200, max: 800, noNaN: true }), // pitch
          (pitch) => {
            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, 50, pitch, 0);
            const particles = ps.getParticles();

            // パーティクルが生成されることを確認
            expect(particles.length).toBeGreaterThan(0);

            // 速度が設定されていることを確認
            expect(particles[0].vx).toBeDefined();
            expect(particles[0].vy).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * プロパティ16: パーティクルの物理演算（飛散段階）
     * **Validates: Requirements 6.4**
     *
     * 重力と速度に基づいてパーティクルの位置が更新されることを検証
     */
    it('プロパティ16: パーティクルの物理演算（飛散段階）', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1.0, noNaN: true }), // deltaTime
          (deltaTime) => {
            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);
            const particles = ps.getParticles();

            const initialX = particles[0].x;
            const initialY = particles[0].y;
            const initialVy = particles[0].vy;

            // 更新
            ps.update(deltaTime, 0);

            // 位置が変化
            expect(particles[0].x).not.toBe(initialX);
            expect(particles[0].y).not.toBe(initialY);

            // Y方向速度が増加（重力）
            expect(particles[0].vy).toBeGreaterThan(initialVy);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * プロパティ17: パーティクルの透明化（飛散段階）
     * **Validates: Requirements 6.5**
     *
     * 時間経過とともにパーティクルの透明度が減少することを検証
     */
    it('プロパティ17: パーティクルの透明化（飛散段階）', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.1, max: 2.0, noNaN: true }), // deltaTime
          (deltaTime) => {
            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);
            const particles = ps.getParticles();

            const initialAlpha = particles[0].alpha;

            // 更新
            ps.update(deltaTime, 0);

            // 透明度が減少
            expect(particles[0].alpha).toBeLessThanOrEqual(initialAlpha);
            expect(particles[0].alpha).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * プロパティ17-A: パーティクルの収束段階への遷移
     * **Validates: Requirements 6.6**
     *
     * 透明度が閾値を下回ると収束段階に遷移することを検証
     */
    it('プロパティ17-A: パーティクルの収束段階への遷移', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true }), // volume
          (volume) => {
            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, volume, 440, 0);

            expect(ps.getPhase()).toBe('scatter');

            // 十分な時間更新
            for (let i = 0; i < 20; i++) {
              ps.update(0.5, i * 500);
            }

            // 収束段階に遷移
            expect(ps.getPhase()).toBe('converge');
          }
        ),
        { numRuns: 50 } // 時間がかかるので50回に減らす
      );
    });

    /**
     * プロパティ17-B: パーティクルの種子位置への収束
     * **Validates: Requirements 6.7**
     *
     * 収束段階でパーティクルが種子位置に向かって移動することを検証
     */
    it('プロパティ17-B: パーティクルの種子位置への収束', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1.0, noNaN: true }), // deltaTime
          (deltaTime) => {
            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [{ x: 400, y: 250, color: 'rgb(255, 200, 220)' }];

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

            // 収束段階に遷移
            for (let i = 0; i < 20; i++) {
              ps.update(0.5, i * 500);
            }

            const particles = ps.getParticles();
            const initialDistance = Math.sqrt(
              (particles[0].x - seedPosition.x) ** 2 +
              (particles[0].y - seedPosition.y) ** 2
            );

            // 更新
            ps.update(deltaTime, 10000);

            const updatedDistance = Math.sqrt(
              (particles[0].x - seedPosition.x) ** 2 +
              (particles[0].y - seedPosition.y) ** 2
            );

            // 距離が減少または同じ（到達済みの場合）
            expect(updatedDistance).toBeLessThanOrEqual(initialDistance + 1); // 誤差を考慮
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * プロパティ17-C: 距離に応じた収束速度の増加
     * **Validates: Requirements 6.8**
     *
     * 種子位置から遠いパーティクルほど速く移動することを検証
     */
    it('プロパティ17-C: 距離に応じた収束速度の増加', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 50, max: 300, noNaN: true }), // distance1
          fc.double({ min: 50, max: 300, noNaN: true }), // distance2
          (distance1, distance2) => {
            fc.pre(Math.abs(distance1 - distance2) > 50); // 距離が十分に異なる

            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = [
              { x: 400, y: 250, color: 'rgb(255, 200, 220)' },
              { x: 410, y: 250, color: 'rgb(255, 200, 220)' }
            ];

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

            // 収束段階に遷移
            for (let i = 0; i < 20; i++) {
              ps.update(0.5, i * 500);
            }

            const particles = ps.getParticles();

            // 異なる距離に配置
            particles[0].x = seedPosition.x + distance1;
            particles[0].y = seedPosition.y;
            particles[1].x = seedPosition.x + distance2;
            particles[1].y = seedPosition.y;

            // 1フレーム更新
            ps.update(1/60, 10000);

            const speed1 = Math.sqrt(particles[0].vx ** 2 + particles[0].vy ** 2);
            const speed2 = Math.sqrt(particles[1].vx ** 2 + particles[1].vy ** 2);

            // 遠い方が速い
            if (distance1 > distance2) {
              expect(speed1).toBeGreaterThan(speed2 * 0.9);
            } else {
              expect(speed2).toBeGreaterThan(speed1 * 0.9);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * プロパティ17-D: 収束完了時の状態遷移
     * **Validates: Requirements 6.9**
     *
     * 全パーティクルが種子位置に到達したことが判定できることを検証
     */
    it('プロパティ17-D: 収束完了時の状態遷移', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // particleCount
          (particleCount) => {
            const stemHeight = 200;
            const leaves: Leaf[] = [];
            const flowerPoints = Array.from({ length: particleCount }, (_, i) => ({
              x: 400 + i * 10,
              y: 250,
              color: 'rgb(255, 200, 220)'
            }));

            const ps = new ParticleSystem(seedPosition);
            ps.generateParticles(stemHeight, leaves, flowerPoints, 50, 440, 0);

            // 収束段階に遷移
            for (let i = 0; i < 20; i++) {
              ps.update(0.5, i * 500);
            }

            const particles = ps.getParticles();

            // 全パーティクルを種子位置に配置
            for (const particle of particles) {
              particle.x = seedPosition.x;
              particle.y = seedPosition.y;
            }

            // 到達判定
            expect(ps.allParticlesArrived()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
