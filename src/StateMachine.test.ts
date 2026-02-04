import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { StateMachine } from './StateMachine';
import { GrowthState } from './types';

describe('StateMachine', () => {
  describe('Property-Based Tests', () => {
    /**
     * Feature: singing-flower-art, Property 2: 音量による状態遷移
     * Validates: Requirements 2.4, 5.8
     * 
     * 任意の音量値に対して、閾値を超えた場合、State_Machineは適切な次の状態へ遷移する
     * （種子→芽、開花→散る）
     */
    it('Property 2: transitions states based on volume thresholds', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100 }),
          (volume) => {
            // 種子→芽の遷移をテスト
            const stateMachine1 = new StateMachine();
            expect(stateMachine1.getCurrentState()).toBe(GrowthState.SEED);
            
            stateMachine1.update(volume, 0);
            
            if (volume >= 30) {
              // 音量が閾値以上なら芽状態に遷移
              if (stateMachine1.getCurrentState() !== GrowthState.SPROUT) {
                return false;
              }
            } else {
              // 音量が閾値未満なら種子状態のまま
              if (stateMachine1.getCurrentState() !== GrowthState.SEED) {
                return false;
              }
            }

            // 開花→散るの遷移をテスト
            const stateMachine2 = new StateMachine();
            // 開花状態まで強制的に進める
            stateMachine2.update(30, 0);  // SEED -> SPROUT
            stateMachine2.update(30, 100); // SPROUT -> STEM
            stateMachine2.update(30, 300); // STEM -> BLOOM
            expect(stateMachine2.getCurrentState()).toBe(GrowthState.BLOOM);
            
            stateMachine2.update(volume, 300);
            
            if (volume >= 70) {
              // 音量が散る閾値以上なら散る状態に遷移
              if (stateMachine2.getCurrentState() !== GrowthState.SCATTER) {
                return false;
              }
            } else {
              // 音量が散る閾値未満なら開花状態のまま
              if (stateMachine2.getCurrentState() !== GrowthState.BLOOM) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: singing-flower-art, Property 3: 成長進行による状態遷移
     * Validates: Requirements 3.5, 4.13
     * 
     * 任意の成長進行度に対して、閾値に達した場合、State_Machineは適切な次の状態へ遷移する
     * （芽→茎と葉、茎と葉→開花）
     */
    it('Property 3: transitions states based on growth progress thresholds', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 500 }),
          (growthProgress) => {
            // 芽→茎と葉の遷移をテスト
            const stateMachine1 = new StateMachine();
            // 芽状態まで進める
            stateMachine1.update(30, 0);
            expect(stateMachine1.getCurrentState()).toBe(GrowthState.SPROUT);
            
            stateMachine1.update(30, growthProgress);
            
            if (growthProgress >= 100) {
              // 成長進行度が閾値以上なら茎と葉状態に遷移
              if (stateMachine1.getCurrentState() !== GrowthState.STEM) {
                return false;
              }
            } else {
              // 成長進行度が閾値未満なら芽状態のまま
              if (stateMachine1.getCurrentState() !== GrowthState.SPROUT) {
                return false;
              }
            }

            // 茎と葉→開花の遷移をテスト
            const stateMachine2 = new StateMachine();
            // 茎と葉状態まで進める
            stateMachine2.update(30, 0);   // SEED -> SPROUT
            stateMachine2.update(30, 100); // SPROUT -> STEM
            expect(stateMachine2.getCurrentState()).toBe(GrowthState.STEM);
            
            stateMachine2.update(30, growthProgress);
            
            if (growthProgress >= 300) {
              // 成長進行度が閾値以上なら開花状態に遷移
              if (stateMachine2.getCurrentState() !== GrowthState.BLOOM) {
                return false;
              }
            } else {
              // 成長進行度が閾値未満なら茎と葉状態のまま
              if (stateMachine2.getCurrentState() !== GrowthState.STEM) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    let stateMachine: StateMachine;

    beforeEach(() => {
      stateMachine = new StateMachine();
    });

    it('initializes in SEED state', () => {
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SEED);
    });

    it('transitions from SEED to SPROUT when volume exceeds threshold', () => {
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SEED);
      
      stateMachine.update(30, 0);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SPROUT);
    });

    it('stays in SEED state when volume is below threshold', () => {
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SEED);
      
      stateMachine.update(29, 0);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SEED);
    });

    it('transitions from SPROUT to STEM when growth progress exceeds threshold', () => {
      // 芽状態まで進める
      stateMachine.update(30, 0);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SPROUT);
      
      stateMachine.update(30, 100);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.STEM);
    });

    it('stays in SPROUT state when growth progress is below threshold', () => {
      // 芽状態まで進める
      stateMachine.update(30, 0);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SPROUT);
      
      stateMachine.update(30, 99);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SPROUT);
    });

    it('transitions from STEM to BLOOM when growth progress exceeds threshold', () => {
      // 茎と葉状態まで進める
      stateMachine.update(30, 0);
      stateMachine.update(30, 100);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.STEM);
      
      stateMachine.update(30, 300);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.BLOOM);
    });

    it('stays in STEM state when growth progress is below threshold', () => {
      // 茎と葉状態まで進める
      stateMachine.update(30, 0);
      stateMachine.update(30, 100);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.STEM);
      
      stateMachine.update(30, 299);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.STEM);
    });

    it('transitions from BLOOM to SCATTER when volume exceeds scatter threshold', () => {
      // 開花状態まで進める
      stateMachine.update(30, 0);
      stateMachine.update(30, 100);
      stateMachine.update(30, 300);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.BLOOM);
      
      stateMachine.update(70, 300);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SCATTER);
    });

    it('stays in BLOOM state when volume is below scatter threshold', () => {
      // 開花状態まで進める
      stateMachine.update(30, 0);
      stateMachine.update(30, 100);
      stateMachine.update(30, 300);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.BLOOM);
      
      stateMachine.update(69, 300);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.BLOOM);
    });

    it('resets from SCATTER to SEED when reset is called', () => {
      // 散る状態まで進める
      stateMachine.update(30, 0);
      stateMachine.update(30, 100);
      stateMachine.update(30, 300);
      stateMachine.update(70, 300);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SCATTER);
      
      stateMachine.reset();
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SEED);
    });

    it('stays in SCATTER state during update (requires explicit reset)', () => {
      // 散る状態まで進める
      stateMachine.update(30, 0);
      stateMachine.update(30, 100);
      stateMachine.update(30, 300);
      stateMachine.update(70, 300);
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SCATTER);
      
      // updateを呼んでも散る状態のまま
      stateMachine.update(0, 0);
      
      expect(stateMachine.getCurrentState()).toBe(GrowthState.SCATTER);
    });
  });
});
