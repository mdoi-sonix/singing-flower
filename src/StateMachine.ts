import { GrowthState } from './types';

/**
 * 状態遷移の閾値を定義
 */
const THRESHOLDS = {
  // 音量閾値（デシベル）
  SEED_TO_SPROUT_VOLUME: 30,      // 種子→芽
  BLOOM_TO_SCATTER_VOLUME: 70,    // 開花→散る

  // 成長進行度閾値（ピクセル）
  SPROUT_TO_STEM_LENGTH: 100,     // 芽→茎と葉
  STEM_TO_BLOOM_LENGTH: 300,      // 茎と葉→開花
};

/**
 * 花の成長段階を管理する状態機械
 */
export class StateMachine {
  private currentState: GrowthState;

  constructor() {
    this.currentState = GrowthState.SEED;
  }

  /**
   * 現在の状態を取得
   */
  public getCurrentState(): GrowthState {
    return this.currentState;
  }

  /**
   * 状態を更新（音量と成長進行度に基づいて遷移判定）
   * @param volume 音量（デシベル、0-100）
   * @param growthProgress 成長進行度（ピクセル単位）
   */
  public update(volume: number, growthProgress: number): void {
    switch (this.currentState) {
      case GrowthState.SEED:
        // 種子→芽: 音量が閾値を超える
        if (volume >= THRESHOLDS.SEED_TO_SPROUT_VOLUME) {
          this.currentState = GrowthState.SPROUT;
        }
        break;

      case GrowthState.SPROUT:
        // 芽→茎と葉: 芽の長さが閾値に達する
        if (growthProgress >= THRESHOLDS.SPROUT_TO_STEM_LENGTH) {
          this.currentState = GrowthState.STEM;
        }
        break;

      case GrowthState.STEM:
        // 茎と葉→開花: 茎の長さが閾値に達する
        if (growthProgress >= THRESHOLDS.STEM_TO_BLOOM_LENGTH) {
          this.currentState = GrowthState.BLOOM;
        }
        break;

      case GrowthState.BLOOM:
        // 開花→散る: 音量が散る閾値を超える
        if (volume >= THRESHOLDS.BLOOM_TO_SCATTER_VOLUME) {
          this.currentState = GrowthState.SCATTER;
        }
        break;

      case GrowthState.SCATTER:
        // 散る→種子: 外部から明示的に呼び出される（全パーティクル消滅時）
        // このケースはupdateでは処理せず、resetメソッドで処理
        break;
    }
  }

  /**
   * 散る状態から種子状態へリセット（全パーティクル消滅時に呼び出される）
   */
  public reset(): void {
    this.currentState = GrowthState.SEED;
  }
}
