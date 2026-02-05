/**
 * RoseCurveクラス
 * バラ曲線（Rose Curve）を計算し、花の形状を生成する
 * 極座標方程式: r = a * cos(k * θ)
 */
export class RoseCurve {
  /**
   * バラ曲線の点を計算
   * @param a 振幅（花のサイズ）
   * @param k 花びらの数を決定する係数
   * @param segments 曲線を構成する点の数
   * @returns 極座標の配列 {r, theta}
   */
  public calculateCurve(a: number, k: number, segments: number = 360): Array<{r: number, theta: number}> {
    const points: Array<{r: number, theta: number}> = [];

    // θを0から2πまで（kが整数の場合）または4πまで（kが分数の場合）回す
    const maxTheta = this.getMaxTheta(k);
    const step = maxTheta / segments;

    for (let i = 0; i <= segments; i++) {
      const theta = i * step;
      const r = a * Math.cos(k * theta);

      // rが負の場合は反対方向に描画（極座標の性質）
      points.push({
        r: Math.abs(r),
        theta: r < 0 ? theta + Math.PI : theta
      });
    }

    return points;
  }

  /**
   * 指定された角度でのバラ曲線の半径を計算
   * @param theta 角度（ラジアン）
   * @param a 振幅（花のサイズ）
   * @param k 花びらの数を決定する係数
   * @returns 半径
   */
  public calculateRadius(theta: number, a: number, k: number): number {
    const r = a * Math.cos(k * theta);
    return Math.abs(r);
  }

  /**
   * 極座標から直交座標に変換
   * @param r 半径
   * @param theta 角度（ラジアン）
   * @param centerX 中心のX座標
   * @param centerY 中心のY座標
   * @returns 直交座標 {x, y}
   */
  public polarToCartesian(r: number, theta: number, centerX: number = 0, centerY: number = 0): {x: number, y: number} {
    return {
      x: centerX + r * Math.cos(theta),
      y: centerY + r * Math.sin(theta)
    };
  }

  /**
   * 直交座標から極座標に変換（テスト用）
   * @param x X座標
   * @param y Y座標
   * @param centerX 中心のX座標
   * @param centerY 中心のY座標
   * @returns 極座標 {r, theta}
   */
  public cartesianToPolar(x: number, y: number, centerX: number = 0, centerY: number = 0): {r: number, theta: number} {
    const dx = x - centerX;
    const dy = y - centerY;

    return {
      r: Math.sqrt(dx * dx + dy * dy),
      theta: Math.atan2(dy, dx)
    };
  }

  /**
   * k値に応じた最大θを計算
   * kが整数の場合は2π、分数の場合は分母に応じて調整
   * @param k バラ曲線の係数
   * @returns 最大θ（ラジアン）
   */
  private getMaxTheta(k: number): number {
    // kが整数かどうかを判定（小数点以下が0.01未満）
    const isInteger = Math.abs(k - Math.round(k)) < 0.01;

    if (isInteger) {
      // kが偶数の場合は2π、奇数の場合は2π
      return 2 * Math.PI;
    } else {
      // kが分数の場合は4πで完全な曲線を描く
      return 4 * Math.PI;
    }
  }

  /**
   * 音高に応じたk値を計算
   * 高い声でk値を増やす（花びらが細かく増える）
   * 低い声でk値を減らす（大きくゆったりした花びら）
   * @param pitch 音高（Hz）
   * @param minK 最小k値（デフォルト: 3）
   * @param maxK 最大k値（デフォルト: 7）
   * @param minPitch 最小音高（デフォルト: 200Hz）
   * @param maxPitch 最大音高（デフォルト: 800Hz）
   * @returns k値
   */
  public calculateKFromPitch(
    pitch: number,
    minK: number = 3,
    maxK: number = 7,
    minPitch: number = 200,
    maxPitch: number = 800
  ): number {
    // 音高を0-1の範囲に正規化
    const normalizedPitch = Math.max(0, Math.min(1, (pitch - minPitch) / (maxPitch - minPitch)));

    // k値を線形補間
    return minK + normalizedPitch * (maxK - minK);
  }
}
