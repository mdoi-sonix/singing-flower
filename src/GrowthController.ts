import type { GrowthParameters } from './types';

/**
 * GrowthControllerクラス
 * 音声データに基づいて成長パラメータを計算
 */
export class GrowthController {
  private basePitch: number = 300; // 基準音高（Hz）

  /**
   * 音声データに基づいて成長パラメータを更新
   * @param volume 音量（0-100のデシベル値）
   * @param pitch 音高（Hz単位の周波数）
   * @param deltaTime 前回の更新からの経過時間（秒）
   * @returns 成長パラメータ
   */
  public update(volume: number, pitch: number, deltaTime: number): GrowthParameters {
    return {
      growthSpeed: this.calculateGrowthSpeed(volume),
      swayAmount: this.calculateSwayAmount(pitch),
      colorHue: this.calculateColorHue(pitch),
      colorSaturation: this.calculateColorSaturation(pitch),
      colorLightness: this.calculateColorLightness(pitch)
    };
  }

  /**
   * 音量に応じた成長速度を計算
   * 音量が大きいほど成長速度が速くなる
   * イージング関数を適用して滑らかな変化にする
   * @param volume 音量（0-100）
   * @returns 成長速度倍率（1.0が基準）
   */
  private calculateGrowthSpeed(volume: number): number {
    // 音量を0-1に正規化
    const normalizedVolume = volume / 100;

    // イージング関数を適用（スムーズステップ）
    // より滑らかな加速・減速を実現
    const easedVolume = normalizedVolume * normalizedVolume * (3 - 2 * normalizedVolume);

    // growthSpeed = 1 + easedVolume * 2
    // 音量0で1.0倍、音量100で3.0倍（イージング適用）
    return 1 + easedVolume * 2;
  }

  /**
   * 音高の変化に応じた揺れの振幅を計算
   * @param pitch 音高（Hz）
   * @returns 揺れの振幅
   */
  private calculateSwayAmount(pitch: number): number {
    // swayAmount = (pitch - basePitch) / 100
    // 基準音高からの差分に応じて揺れる
    return (pitch - this.basePitch) / 100;
  }

  /**
   * 音高に応じた色相を計算
   * 音高を色相にマッピング（200Hz→120°緑、400Hz→180°シアン）
   * @param pitch 音高（Hz）
   * @returns 色相（0-360）
   */
  private calculateColorHue(pitch: number): number {
    // 音高を色相にマッピング
    // 低い音（200Hz）→ 緑（120°）
    // 中間（300Hz）→ 緑-シアン（150°）
    // 高い音（400Hz以上）→ シアン（180°）

    if (pitch <= 200) {
      return 120; // 緑
    } else if (pitch >= 400) {
      return 180; // シアン
    } else {
      // 200-400Hzの範囲を120-180°にマッピング
      return 120 + ((pitch - 200) / 200) * 60;
    }
  }

  /**
   * 音高に応じた彩度を計算
   * @param pitch 音高（Hz）
   * @returns 彩度（0-100）
   */
  private calculateColorSaturation(pitch: number): number {
    // 音高が高いほど彩度を上げる（より鮮やかに）
    // 200Hz以下: 50%
    // 400Hz以上: 80%
    if (pitch <= 200) {
      return 50;
    } else if (pitch >= 400) {
      return 80;
    } else {
      return 50 + ((pitch - 200) / 200) * 30;
    }
  }

  /**
   * 音高に応じた明度を計算
   * 音高が高いほど明るくなる
   * @param pitch 音高（Hz）
   * @returns 明度（0-100）
   */
  private calculateColorLightness(pitch: number): number {
    // lightness = 30 + pitch / 10
    // 音高が高いほど明るい色になる
    // 下限30%、上限は計算結果（例: 400Hzで70%）
    const lightness = 30 + pitch / 10;

    // 30-70%の範囲に制限
    return Math.max(30, Math.min(70, lightness));
  }

  /**
   * 基準音高を設定
   * @param pitch 基準音高（Hz）
   */
  public setBasePitch(pitch: number): void {
    this.basePitch = pitch;
  }

  /**
   * 基準音高を取得
   * @returns 基準音高（Hz）
   */
  public getBasePitch(): number {
    return this.basePitch;
  }
}
