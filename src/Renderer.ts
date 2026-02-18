import p5 from 'p5';
import { GrowthState, type RenderParameters, type Point, type Leaf, type Particle, type Ripple } from './types';
import { RoseCurve } from './RoseCurve';

/**
 * Rendererクラス（p5.js版）
 * p5インスタンスを使って花の視覚要素を描画する
 */
export class Renderer {
  private p: p5;
  private previousVolume: number = 0;
  private roseCurve: RoseCurve;

  // レイヤー構成
  private bodyLayer: p5.Graphics | null = null; // 本体レイヤー（茎・葉・花）くっきり描画
  private glowLayer: p5.Graphics | null = null; // グローレイヤー（本体から生成する光のボケ）

  // パフォーマンス最適化用
  private frameCount: number = 0; // フレームカウント（ぼかし更新のスキップ用）
  private tempGlowLayer: p5.Graphics | null = null; // ダウンサンプリング用の一時レイヤー

  // k値のスムージング用
  private previousK: number = 5; // 前回のk値
  private targetK: number = 5; // 目標のk値

  // 色相のスムージング用
  private previousHue: number = 330; // 前回の色相（ピンク）
  private targetHue: number = 330; // 目標の色相

  // SCATTER状態用のキャッシュ
  private cachedFlowerImage: p5.Image | null = null; // BLOOM状態の最後のフレームをキャッシュ

  constructor(p: p5) {
    this.p = p;
    this.roseCurve = new RoseCurve();
  }

  /**
   * レイヤーを初期化（必要に応じて作成）
   */
  private ensureLayers(): void {
    if (!this.bodyLayer || this.bodyLayer.width !== this.p.width || this.bodyLayer.height !== this.p.height) {
      if (this.bodyLayer) this.bodyLayer.remove();
      this.bodyLayer = this.p.createGraphics(this.p.width, this.p.height);

      // willReadFrequently属性を設定（getImageData最適化）
      const ctx = this.bodyLayer.drawingContext as CanvasRenderingContext2D;
      if (ctx && ctx.canvas) {
        // @ts-ignore - willReadFrequentlyはTypeScriptの型定義にないが、標準仕様
        ctx.canvas.willReadFrequently = true;
      }
    }
    if (!this.glowLayer || this.glowLayer.width !== this.p.width || this.glowLayer.height !== this.p.height) {
      if (this.glowLayer) this.glowLayer.remove();
      this.glowLayer = this.p.createGraphics(this.p.width, this.p.height);
    }
  }

  /**
   * ぼかし効果を適用（shadowBlurを使用）
   * bodyLayerにshadowBlurを適用してglowLayerに描画
   * @param source ソースレイヤー
   * @param target ターゲットレイヤー
   * @param intensity ぼかしの強度（ピクセル単位の半径）
   */
  private applyBlur(source: p5.Graphics, target: p5.Graphics, intensity: number): void {
    // shadowBlurを使った高速なぼかし
    target.clear();
    const ctx = target.drawingContext as CanvasRenderingContext2D;

    // shadowBlurを設定
    ctx.shadowBlur = intensity;
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // sourceを描画（shadowBlurが適用される）
    target.image(source, 0, 0);

    // shadowBlurをリセット
    ctx.shadowBlur = 0;
  }

  /**
   * 最適化されたぼかし効果（ダウンサンプリング使用）
   * パフォーマンス向上のため、画像を縮小してぼかし、拡大する
   * @param source ソースレイヤー
   * @param target ターゲットレイヤー
   * @param intensity ぼかしの強度（ピクセル単位の半径）
   */
  private applyBlurOptimized(source: p5.Graphics, target: p5.Graphics, intensity: number): void {
    // 一時レイヤーを初期化（50%サイズ）
    const tempWidth = Math.floor(source.width / 2);
    const tempHeight = Math.floor(source.height / 2);

    if (!this.tempGlowLayer || this.tempGlowLayer.width !== tempWidth || this.tempGlowLayer.height !== tempHeight) {
      if (this.tempGlowLayer) this.tempGlowLayer.remove();
      this.tempGlowLayer = this.p.createGraphics(tempWidth, tempHeight);
    }

    // 1. ソースを50%に縮小して一時レイヤーに描画
    this.tempGlowLayer.clear();
    this.tempGlowLayer.image(source, 0, 0, tempWidth, tempHeight);

    // 2. 縮小した画像にぼかしを適用
    target.clear();
    const ctx = target.drawingContext as CanvasRenderingContext2D;

    ctx.shadowBlur = intensity / 2; // 縮小したのでぼかし半径も半分に
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 3. ぼかした画像を元のサイズに拡大して描画
    target.image(this.tempGlowLayer, 0, 0, target.width, target.height);

    ctx.shadowBlur = 0;
  }

  /**
   * constrain関数のヘルパー（p5.Graphicsにはconstrainがないため）
   */
  private constrain(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * lerp関数のヘルパー（p5.Graphicsにはlerpがないため）
   */
  private lerp(start: number, stop: number, amt: number): number {
    return start + (stop - start) * amt;
  }

  /**
    return start + (stop - start) * amt;
  }

  /**
   * 芽を粒子で描画（成長中）
   */
  private drawSproutAsParticles(progress: number, volume: number, pitch: number, pitchChange: number, stemHeight?: number, leaves?: any[], time?: number): void {
    const seedPos = this.getSeedPosition();

    // 長さの計算
    let length: number;
    if (stemHeight !== undefined) {
      length = stemHeight;
    } else {
      const maxLength = this.p.height * 0.5;
      const volumeFactor = volume / 100;
      length = progress * maxLength * (0.5 + volumeFactor * 0.5);
    }

    // 音高に応じた色
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 音高変化による揺れ
    const swayAmount = pitchChange * 0.5;

    // 音量によるうねり
    const volumeFactor = volume / 100;
    const undulationAmount = volumeFactor * 30;

    // フックの強度（progressに応じて徐々に弱くなる）
    const hookStrength = Math.max(0, 1 - progress / 0.8);

    // 茎の太さ
    const isPortrait = this.p.height > this.p.width;
    const stemWidth = this.p.height * (isPortrait ? 0.006 : 0.007);

    // グロー強度（常に一定）
    const glowStrength = 0.5;

    // 茎を粒子で描画（処理と見た目のバランス）
    const particleSpacing = 0.6; // 1.0→0.6に
    const segments = Math.floor(length / particleSpacing);

    this.p.noStroke();

    // 1. グロー効果（加算合成）
    this.p.blendMode(this.p.ADD);
    const glowLayers = 4; // 8→4に減らして軽量化

    for (let glowLayer = 0; glowLayer < glowLayers; glowLayer++) {
      const layerT = glowLayer / glowLayers;
      const glowSize = 1.5 + layerT * 5;
      const glowAlpha = (1 - layerT * layerT * layerT) * 1 * glowStrength; // 2→1に減らす

      for (let i = 0; i <= segments; i++) {
        const t = i / Math.max(1, segments);
        const currentLength = length * t;

        // フック状の曲がり
        let offsetX = 0;
        let offsetY = 0;

        if (hookStrength > 0 && t > 0.2) {
          const hookT = (t - 0.2) / 0.8;
          const easeHookT = hookT * hookT * (3 - 2 * hookT);

          const hookHorizontal = isPortrait ? 0.04 : 0.05;
          const horizontalCurve = easeHookT * easeHookT * (3 - 2 * easeHookT);
          offsetX = horizontalCurve * this.p.height * hookHorizontal * hookStrength;

          if (hookT > 0.2) {
            const liftT = (hookT - 0.2) / 0.8;
            const hookVertical = isPortrait ? 0.02 : 0.025;
            const liftCurve = liftT * liftT * liftT * (liftT * (liftT * 6 - 15) + 10);
            offsetY = -liftCurve * this.p.height * hookVertical * hookStrength;
          }
        }

        const swayInfluence = t;

        // 音量によるうねり
        let undulationX = 0;
        if (hookStrength < 0.5) {
          const undulationStrength = 1 - hookStrength * 2;
          const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
          const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
          const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
          undulationX = (wave1 + wave2 + wave3) * undulationStrength * t;
        }

        const centerX = seedPos.x + swayAmount * swayInfluence + offsetX + undulationX;
        const centerY = seedPos.y - currentLength + offsetY;

        const widthMultiplier = this.lerp(1.0, 0.3, t);
        const currentWidth = stemWidth * widthMultiplier;

        const particlesAcross = Math.max(1, Math.floor(currentWidth * 2 / particleSpacing));

        for (let j = 0; j < particlesAcross; j++) {
          const offsetT = particlesAcross > 1 ? (j / (particlesAcross - 1)) - 0.5 : 0;
          const x = centerX + offsetT * currentWidth * 2;
          const y = centerY;

          // グロー色（緑）
          const r = this.lerp(80, 10, normalizedPitch);
          const g = this.lerp(220, 100, normalizedPitch);
          const b = this.lerp(180, 60, normalizedPitch);

          this.p.fill(r, g, b, glowAlpha);
          this.p.circle(x, y, glowSize);
        }
      }
    }

    // 2. 本体の粒子（通常合成）
    this.p.blendMode(this.p.BLEND);

    for (let i = 0; i <= segments; i++) {
      const t = i / Math.max(1, segments);
      const currentLength = length * t;

      // フック状の曲がり
      let offsetX = 0;
      let offsetY = 0;

      if (hookStrength > 0 && t > 0.2) {
        const hookT = (t - 0.2) / 0.8;
        const easeHookT = hookT * hookT * (3 - 2 * hookT);

        const hookHorizontal = isPortrait ? 0.04 : 0.05;
        const horizontalCurve = easeHookT * easeHookT * (3 - 2 * easeHookT);
        offsetX = horizontalCurve * this.p.height * hookHorizontal * hookStrength;

        if (hookT > 0.2) {
          const liftT = (hookT - 0.2) / 0.8;
          const hookVertical = isPortrait ? 0.02 : 0.025;
          const liftCurve = liftT * liftT * liftT * (liftT * (liftT * 6 - 15) + 10);
          offsetY = -liftCurve * this.p.height * hookVertical * hookStrength;
        }
      }

      const swayInfluence = t;

      // 音量によるうねり
      let undulationX = 0;
      if (hookStrength < 0.5) {
        const undulationStrength = 1 - hookStrength * 2;
        const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
        const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
        const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
        undulationX = (wave1 + wave2 + wave3) * undulationStrength * t;
      }

      const centerX = seedPos.x + swayAmount * swayInfluence + offsetX + undulationX;
      const centerY = seedPos.y - currentLength + offsetY;

      const widthMultiplier = this.lerp(1.0, 0.3, t);
      const currentWidth = stemWidth * widthMultiplier;

      const particlesAcross = Math.max(1, Math.floor(currentWidth * 2 / particleSpacing));

      for (let j = 0; j < particlesAcross; j++) {
        const offsetT = particlesAcross > 1 ? (j / (particlesAcross - 1)) - 0.5 : 0;
        const x = centerX + offsetT * currentWidth * 2;
        const y = centerY;

        // 本体の色
        const bodyR = this.lerp(70, 20, normalizedPitch);
        const bodyG = this.lerp(200, 120, normalizedPitch);
        const bodyB = this.lerp(160, 80, normalizedPitch);

        this.p.fill(bodyR, bodyG, bodyB, 12); // 20→12に
        this.p.circle(x, y, 2.5);
      }
    }

    // 3. 輪郭の発光（加算合成）
    this.p.blendMode(this.p.ADD);
    const edgeLayers = 2; // 4→2に減らして軽量化

    for (let edgeLayer = 0; edgeLayer < edgeLayers; edgeLayer++) {
      const layerT = edgeLayer / edgeLayers;
      const edgeAlpha = (1 - layerT * layerT) * 30;

      for (let i = 0; i <= segments; i++) {
        const t = i / Math.max(1, segments);
        const currentLength = length * t;

        // フック状の曲がり
        let offsetX = 0;
        let offsetY = 0;

        if (hookStrength > 0 && t > 0.2) {
          const hookT = (t - 0.2) / 0.8;
          const easeHookT = hookT * hookT * (3 - 2 * hookT);

          const hookHorizontal = isPortrait ? 0.04 : 0.05;
          const horizontalCurve = easeHookT * easeHookT * (3 - 2 * easeHookT);
          offsetX = horizontalCurve * this.p.height * hookHorizontal * hookStrength;

          if (hookT > 0.2) {
            const liftT = (hookT - 0.2) / 0.8;
            const hookVertical = isPortrait ? 0.02 : 0.025;
            const liftCurve = liftT * liftT * liftT * (liftT * (liftT * 6 - 15) + 10);
            offsetY = -liftCurve * this.p.height * hookVertical * hookStrength;
          }
        }

        const swayInfluence = t;

        // 音量によるうねり
        let undulationX = 0;
        if (hookStrength < 0.5) {
          const undulationStrength = 1 - hookStrength * 2;
          const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
          const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
          const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
          undulationX = (wave1 + wave2 + wave3) * undulationStrength * t;
        }

        const centerX = seedPos.x + swayAmount * swayInfluence + offsetX + undulationX;
        const centerY = seedPos.y - currentLength + offsetY;

        const widthMultiplier = this.lerp(1.0, 0.3, t);
        const currentWidth = stemWidth * widthMultiplier;
        const edgeSize = (0.5 + layerT * 2) * widthMultiplier;

        const particlesAcross = Math.max(1, Math.floor(currentWidth * 2 / particleSpacing));

        // 輪郭色（明るい緑）
        const r = this.lerp(150, 60, normalizedPitch);
        const g = 255;
        const b = this.lerp(240, 160, normalizedPitch);

        this.p.fill(r, g, b, edgeAlpha);

        // 左端の粒子
        const leftX = centerX - currentWidth;
        this.p.circle(leftX, centerY, edgeSize);

        // 右端の粒子
        const rightX = centerX + currentWidth;
        this.p.circle(rightX, centerY, edgeSize);
      }
    }

    this.p.blendMode(this.p.BLEND);

    // 葉も粒子で描画
    if (leaves && leaves.length > 0 && time !== undefined) {
      for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
        const leaf = leaves[leafIndex];
        if (leaf.lengthProgress <= 0) continue;

        this.drawLeafAsParticles(leaf, pitch, leafIndex);
      }
    }
  }

  /**
   * 葉を粒子で描画
   */
  private drawLeafAsParticles(leaf: any, pitch: number, leafIndex: number): void {
    if (leaf.lengthProgress <= 0) return;

    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 葉の形状計算
    const isPortrait = this.p.height > this.p.width;
    const baseLeafLength = this.p.height * (isPortrait ? 0.08 : 0.1);
    const lengthScale = leaf.lengthProgress;
    const widthScale = leaf.widthProgress;

    // 葉の幅
    const minWidthRatio = 0.02;
    const maxWidthRatio = 0.4 * leaf.targetWidth * leaf.widthRatio;
    const currentWidthRatio = this.lerp(minWidthRatio, maxWidthRatio, widthScale);

    // 透明度
    const alphaMultiplier = leaf.lengthProgress;

    // ベジェ曲線の制御点
    const startX = 0;
    const startY = 0;

    const cp1OffsetX = (leaf.shapeSeed - 0.5) * 10;
    const cp1OffsetY = (Math.sin(leaf.shapeSeed * Math.PI * 2) - 0.5) * 8;
    const cp2OffsetX = (Math.cos(leaf.shapeSeed * Math.PI * 3) - 0.5) * 10;
    const cp2OffsetY = (leaf.shapeSeed - 0.5) * 8;

    const cp1X = (leaf.size * 0.3 + leaf.bendAmount * 15 + cp1OffsetX) * lengthScale;
    const cp1Y = (-leaf.size * 0.25 + leaf.swayOffset * 0.3 + cp1OffsetY) * lengthScale;

    const cp2X = (leaf.size * 0.7 - leaf.bendAmount * 15 + cp2OffsetX) * lengthScale;
    const cp2Y = (-leaf.size * 0.75 + leaf.swayOffset * 0.7 + cp2OffsetY) * lengthScale;

    const endX = leaf.size * lengthScale;
    const endY = (-leaf.size + leaf.swayOffset) * lengthScale;

    // 粒子間隔（葉は茎より密に）
    const particleSpacing = 0.5; // 0.6→0.5に

    // 中心線のパスを生成（処理軽量化のため適度な点数に）
    const pathSegments = Math.min(60, Math.floor(leaf.size * lengthScale / particleSpacing)); // 最大60点
    const centerPoints: Array<{x: number, y: number, t: number, width: number}> = [];

    const waveSeed = leaf.angle * 10;

    for (let i = 0; i <= pathSegments; i++) {
      const t = i / pathSegments;
      const x = this.bezierPoint(startX, cp1X, cp2X, endX, t);
      const y = this.bezierPoint(startY, cp1Y, cp2Y, endY, t);

      const baseWidth = leaf.size * currentWidthRatio * Math.sin(t * Math.PI);

      const wave1 = Math.sin(t * Math.PI * 3 + waveSeed) * 0.15;
      const wave2 = Math.sin(t * Math.PI * 7 + waveSeed * 1.3) * 0.08;
      const wave3 = Math.sin(t * Math.PI * 11 + waveSeed * 1.7) * 0.04;

      const waveStrength = Math.sin(t * Math.PI);
      const totalWave = (wave1 + wave2 + wave3) * waveStrength;

      const undulatedWidth = baseWidth * (1 + totalWave);

      centerPoints.push({x, y, t, width: undulatedWidth});
    }

    // 回転を計算
    const isLeft = Math.abs(leaf.angle - Math.PI) < 0.1;
    const minAngle = Math.PI / 18;
    const maxAngle = Math.PI / 4;
    const currentAngle = this.lerp(minAngle, maxAngle, leaf.rotationProgress);
    const upwardTilt = isLeft ? -currentAngle : currentAngle;
    const totalRotation = leaf.angle + upwardTilt;

    const cos = Math.cos(totalRotation);
    const sin = Math.sin(totalRotation);

    this.p.noStroke();

    // 1. グロー効果（加算合成）- レイヤー数を減らして軽量化
    this.p.blendMode(this.p.ADD);
    const glowLayers = 4; // 8→4に減らす
    const glowStrength = 0.5;

    for (let glowLayer = 0; glowLayer < glowLayers; glowLayer++) {
      const layerT = glowLayer / glowLayers;
      const glowSize = 1.5 + layerT * 5;
      const glowAlpha = (1 - layerT * layerT * layerT) * 1 * glowStrength * alphaMultiplier;

      for (let i = 0; i < centerPoints.length; i++) {
        const point = centerPoints[i];

        // 葉の幅方向に粒子を配置
        const particlesAcross = Math.max(1, Math.floor(point.width * 2 / particleSpacing));

        for (let j = 0; j < particlesAcross; j++) {
          const offsetT = particlesAcross > 1 ? (j / (particlesAcross - 1)) - 0.5 : 0;

          // 中心線からの垂直オフセット
          const angle = i > 0 ? Math.atan2(
            point.y - centerPoints[i - 1].y,
            point.x - centerPoints[i - 1].x
          ) : 0;
          const perpOffsetX = -Math.sin(angle) * offsetT * point.width * 2;
          const perpOffsetY = Math.cos(angle) * offsetT * point.width * 2;

          const localX = point.x + perpOffsetX;
          const localY = point.y + perpOffsetY;

          // 回転を適用
          const rotatedX = localX * cos - localY * sin;
          const rotatedY = localX * sin + localY * cos;

          // ワールド座標に変換
          const worldX = leaf.x + rotatedX;
          const worldY = leaf.y + rotatedY + leaf.swayOffset;

          // グロー色（緑）
          const r = this.lerp(80, 10, normalizedPitch);
          const g = this.lerp(220, 100, normalizedPitch);
          const b = this.lerp(180, 60, normalizedPitch);

          this.p.fill(r, g, b, glowAlpha);
          this.p.circle(worldX, worldY, glowSize);
        }
      }
    }

    // 2. 本体の粒子（通常合成）
    this.p.blendMode(this.p.BLEND);

    for (let i = 0; i < centerPoints.length; i++) {
      const point = centerPoints[i];

      const particlesAcross = Math.max(1, Math.floor(point.width * 2 / particleSpacing));

      for (let j = 0; j < particlesAcross; j++) {
        const offsetT = particlesAcross > 1 ? (j / (particlesAcross - 1)) - 0.5 : 0;

        const angle = i > 0 ? Math.atan2(
          point.y - centerPoints[i - 1].y,
          point.x - centerPoints[i - 1].x
        ) : 0;
        const perpOffsetX = -Math.sin(angle) * offsetT * point.width * 2;
        const perpOffsetY = Math.cos(angle) * offsetT * point.width * 2;

        const localX = point.x + perpOffsetX;
        const localY = point.y + perpOffsetY;

        const rotatedX = localX * cos - localY * sin;
        const rotatedY = localX * sin + localY * cos;

        const worldX = leaf.x + rotatedX;
        const worldY = leaf.y + rotatedY + leaf.swayOffset;

        // 本体の色
        const bodyR = this.lerp(70, 20, normalizedPitch);
        const bodyG = this.lerp(200, 120, normalizedPitch);
        const bodyB = this.lerp(160, 80, normalizedPitch);

        this.p.fill(bodyR, bodyG, bodyB, 20 * alphaMultiplier); // 8→20に
        this.p.circle(worldX, worldY, 2.5); // 2→2.5に
      }
    }

    // 3. 輪郭の発光（加算合成）
    this.p.blendMode(this.p.ADD);
    const edgeLayers = 2; // 4→2に減らして軽量化

    for (let edgeLayer = 0; edgeLayer < edgeLayers; edgeLayer++) {
      const layerT = edgeLayer / edgeLayers;
      const edgeAlpha = (1 - layerT * layerT) * 30 * alphaMultiplier; // 茎と同じ30に

      for (let i = 0; i < centerPoints.length; i++) {
        const point = centerPoints[i];
        const edgeSize = (0.3 + layerT * 1); // サイズを小さく (0.5+t*2 → 0.3+t*1)

        const angle = i > 0 ? Math.atan2(
          point.y - centerPoints[i - 1].y,
          point.x - centerPoints[i - 1].x
        ) : 0;

        // 輪郭色（明るい緑）
        const r = this.lerp(150, 60, normalizedPitch);
        const g = 255;
        const b = this.lerp(240, 160, normalizedPitch);

        this.p.fill(r, g, b, edgeAlpha);

        // 上側の輪郭
        const topOffsetX = -Math.sin(angle) * point.width;
        const topOffsetY = Math.cos(angle) * point.width;
        const topLocalX = point.x + topOffsetX;
        const topLocalY = point.y + topOffsetY;
        const topRotatedX = topLocalX * cos - topLocalY * sin;
        const topRotatedY = topLocalX * sin + topLocalY * cos;
        const topWorldX = leaf.x + topRotatedX;
        const topWorldY = leaf.y + topRotatedY + leaf.swayOffset;
        this.p.circle(topWorldX, topWorldY, edgeSize);

        // 下側の輪郭
        const bottomOffsetX = -Math.sin(angle) * (-point.width);
        const bottomOffsetY = Math.cos(angle) * (-point.width);
        const bottomLocalX = point.x + bottomOffsetX;
        const bottomLocalY = point.y + bottomOffsetY;
        const bottomRotatedX = bottomLocalX * cos - bottomLocalY * sin;
        const bottomRotatedY = bottomLocalX * sin + bottomLocalY * cos;
        const bottomWorldX = leaf.x + bottomRotatedX;
        const bottomWorldY = leaf.y + bottomRotatedY + leaf.swayOffset;
        this.p.circle(bottomWorldX, bottomWorldY, edgeSize);
      }
    }

    // 4. 葉脈（中心線）を描画
    this.p.blendMode(this.p.ADD);
    for (let i = 0; i < centerPoints.length; i++) {
      const point = centerPoints[i];

      const localX = point.x;
      const localY = point.y;

      const rotatedX = localX * cos - localY * sin;
      const rotatedY = localX * sin + localY * cos;

      const worldX = leaf.x + rotatedX;
      const worldY = leaf.y + rotatedY + leaf.swayOffset;

      // 葉脈の色（明るい緑）
      const r = this.lerp(180, 100, normalizedPitch);
      const g = 255;
      const b = this.lerp(250, 180, normalizedPitch);

      this.p.fill(r, g, b, 60 * alphaMultiplier);
      this.p.circle(worldX, worldY, 0.8);
    }

    this.p.blendMode(this.p.BLEND);
  }

  /**
   * 背景を描画
   * 中央がディープネイビー、外側がブラックの放射状グラデーション
   */
  public drawBackground(): void {
    const centerX = this.p.width / 2;
    const centerY = this.p.height / 2;
    const maxRadius = Math.max(this.p.width, this.p.height);

    // p5.jsでは放射状グラデーションを直接サポートしていないため、
    // 複数の円を重ねて描画
    this.p.noStroke();

    const steps = 100;
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const radius = maxRadius * t;

      // 色を補間（中央: 暗めのネイビー、外側: #000000）
      // グラデーションを急激に（三乗で中央のみ明るく）
      const gradientT = t * t * t; // 三乗で中央のみ明るく、外側は急激に暗く
      const r = this.lerp(25, 0, gradientT);
      const g = this.lerp(40, 0, gradientT);
      const b = this.lerp(70, 0, gradientT);

      this.p.fill(r, g, b);
      this.p.circle(centerX, centerY, radius * 2);
    }
  }

  /**
   * 種子を描画
   * 霧のような滑らかな光の繭
   * - 中心が白く飛び、外側に向かって指数関数的に減衰
   * - 加算合成で複数のレイヤーを重ねて大きなグローを作る
   * @param canvas 描画先キャンバス（p5またはp5.Graphics）
   * @param time 現在時刻（ミリ秒）
   * @param volume 音量（0-100）
   * @param previousVolume 前フレームの音量（残像効果用）
   * @param fadeOut フェードアウト係数（0-1、1で完全表示、0で非表示）
   */
  public drawSeed(canvas: p5 | p5.Graphics, time: number = this.p.millis(), volume: number = 0, previousVolume: number = 0, fadeOut: number = 1): void {
    // フェードアウト中は描画しない
    if (fadeOut <= 0) return;

    // 種子の位置（画面中央下、高さの85%位置）
    const seedX = canvas.width / 2;
    const seedY = canvas.height * 0.85;

    // 画面の向きを判定
    const isPortrait = canvas.height > canvas.width;

    // 脈動アニメーション（周期的な拡大縮小）
    const baseRadius = canvas.height * (isPortrait ? 0.02 : 0.025);
    const pulseAmplitude = baseRadius * 0.15;
    const pulsePeriod = 3000;
    const pulsePhase = (time % pulsePeriod) / pulsePeriod * this.p.TWO_PI;
    const pulseFactor = (this.p.sin(pulsePhase) + 1) / 2;

    // 音量による追加の脈動
    const volumeFactor = volume / 100;
    const radius = baseRadius + pulseAmplitude * pulseFactor + volumeFactor * baseRadius * 0.3;

    // 輝きの強さ
    const brightness = 0.5 + pulseFactor * 0.1;

    canvas.noStroke();

    // 1. グロー効果（加算合成で大きなぼんやりとした光）
    canvas.blendMode(canvas.ADD);
    const glowLayers = 20; // 60→20に減らして軽量化

    for (let i = 0; i < glowLayers; i++) {
      const t = i / glowLayers;
      const glowRadius = radius * (1.5 + t * 4); // 1.5倍から5.5倍まで
      const glowAlpha = (1 - t * t * t) * brightness * 15 * fadeOut; // 10→15に上げて明るく

      // 外側は赤紫、内側はオレンジ
      const r = this.lerp(100, 240, 1 - t * 0.6); // 赤紫～オレンジ
      const g = this.lerp(30, 130, 1 - t * 0.6); // 暗い～オレンジ
      const b = this.lerp(60, 25, 1 - t * 0.6); // 紫～赤

      canvas.fill(r, g, b, glowAlpha);
      canvas.circle(seedX, seedY, glowRadius);
    }

    // 2. 本体（加算合成で滑らかに）
    // 本体も加算合成にして、輪郭をぼかす
    const bodyLayers = 10; // 20→10層に減らして軽量化
    for (let i = 0; i < bodyLayers; i++) {
      const t = i / bodyLayers;
      const bodyRadius = radius * (0.2 + t * 2.8); // 0.2倍から3倍まで
      const bodyAlpha = (1 - t * t) * brightness * 25 * fadeOut; // 15→25に上げて明るく

      // 内側から外側へのグラデーション（白→黄色→オレンジ）
      // t < 0.3: 白
      // t 0.3-0.6: 白→黄色
      // t 0.6-1.0: 黄色→オレンジ
      let r, g, b;
      if (t < 0.3) {
        // 中心部分は白
        r = 255;
        g = 255;
        b = 255;
      } else if (t < 0.6) {
        // 白→黄色
        const localT = (t - 0.3) / 0.3;
        r = 255;
        g = this.lerp(255, 220, localT);
        b = this.lerp(255, 100, localT);
      } else {
        // 黄色→オレンジ
        const localT = (t - 0.6) / 0.4;
        r = this.lerp(255, 240, localT);
        g = this.lerp(220, 130, localT);
        b = this.lerp(100, 25, localT);
      }

      canvas.fill(r, g, b, bodyAlpha);
      canvas.circle(seedX, seedY, bodyRadius);
    }

    // 3. 中心のコア（通常合成で明確な形を作る）
    canvas.blendMode(canvas.BLEND);
    const coreRadius = radius * 0.8;
    const coreAlpha = brightness * 180 * fadeOut;

    // コアのグラデーション（中心が明るい黄色、外側がオレンジ）
    const coreGradientLayers = 5;
    for (let i = 0; i < coreGradientLayers; i++) {
      const t = i / coreGradientLayers;
      const layerRadius = coreRadius * (0.3 + t * 0.7);
      const layerAlpha = coreAlpha * (1 - t * 0.5);

      const r = this.lerp(255, 240, t);
      const g = this.lerp(240, 150, t);
      const b = this.lerp(150, 50, t);

      canvas.fill(r, g, b, layerAlpha);
      canvas.circle(seedX, seedY, layerRadius);
    }

    // 4. 輪郭線（存在感を強調）
    canvas.noFill();
    canvas.stroke(200, 100, 30, brightness * 100 * fadeOut);
    canvas.strokeWeight(1.5);
    canvas.circle(seedX, seedY, coreRadius);

    canvas.blendMode(canvas.BLEND);
  }

  /**
   * 芽を描画
   * 種子位置から上方向へ伸びる線
   * - フック状の這い上がり動作（n字→I字）
   * - 音量に応じて線の長さが増加
   * - 音高に応じて色が変化（高い声で明るい緑、低い声で深い緑）
   * - 音高の変化に応じて左右に揺れる
   * - 太さのある形状で描画
   * @param canvas 描画先キャンバス（p5またはp5.Graphics）
   * @param progress 成長進行度（0-1）
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param reduceGlow グロー効果を減らすか（STEM状態用）
   * @param stemHeight STEM状態での茎の高さ（オプション）
   * @param leaves 葉の配列（オプション）
   * @param time 現在時刻（オプション）
   */
  public drawSprout(canvas: p5 | p5.Graphics, progress: number, volume: number, pitch: number, pitchChange: number, reduceGlow: boolean = false, stemHeight?: number, leaves?: Leaf[], time?: number, witherAmount: number = 0): void {
    const seedPos = this.getSeedPosition();

    // 長さの計算
    let length: number;
    if (stemHeight !== undefined) {
      length = stemHeight;
    } else {
      const maxLength = canvas.height * 0.5;
      const volumeFactor = volume / 100;
      length = progress * maxLength * (0.5 + volumeFactor * 0.5);
    }

    // 音高に応じた色の変化
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 音高の変化に応じた揺れ
    let swayAmount = pitchChange * 0.5;
    
    // 常に風の揺れを追加（音量に応じて強さが変わる）
    if (volume < 20) {
      // 音量0-19の範囲で、微妙な風の揺れ
      const lowVolumeFactor = volume / 20; // 0-1
      const windSway = Math.sin((time || this.p.millis()) / 800) * 8 * lowVolumeFactor; // ±8の揺れ
      swayAmount += windSway;
    } else {
      // 音量20以上でも風の揺れを追加（より強く）
      const highVolumeFactor = Math.min(volume / 100, 1); // 0-1
      const windSway = Math.sin((time || this.p.millis()) / 800) * 12 * highVolumeFactor; // ±12の揺れ
      swayAmount += windSway;
    }

    // 音量に応じたうねり
    const volumeFactor = volume / 100;
    const undulationAmount = volumeFactor * 30;

    // フックの強度（初期成長時のみ）
    const hookStrength = Math.max(0, 1 - progress / 0.8);

    // 萎れによるU字型の曲がり（witherAmountが0-1）
    const witherStrength = witherAmount;

    // 画面の向きを判定
    const isPortrait = canvas.height > canvas.width;

    // 芽の太さ
    const stemWidth = canvas.height * (isPortrait ? 0.006 : 0.007);

    // 芽を複数のセグメントで描画
    const segments = 30;
    const centerPoints: Array<{x: number, y: number}> = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentLength = length * t;

      // フック状の曲がり（初期成長時）
      let offsetX = 0;
      let offsetY = 0;

      if (hookStrength > 0 && t > 0.2) {
        const hookT = (t - 0.2) / 0.8;
        const easeHookT = hookT * hookT * (3 - 2 * hookT);

        const hookHorizontal = isPortrait ? 0.04 : 0.05;
        const horizontalCurve = easeHookT * easeHookT * (3 - 2 * easeHookT);
        offsetX = horizontalCurve * this.p.height * hookHorizontal * hookStrength;

        if (hookT > 0.2) {
          const liftT = (hookT - 0.2) / 0.8;
          const hookVertical = isPortrait ? 0.02 : 0.025;
          const liftCurve = liftT * liftT * liftT * (liftT * (liftT * 6 - 15) + 10);
          offsetY = -liftCurve * this.p.height * hookVertical * hookStrength;
        }
      }

      // 萎れによる曲がり（根元から徐々に曲がり、先端が下を向く）
      if (witherStrength > 0) {
        // シンプルな曲線：根元はまっすぐ、徐々に横に曲がり、先端が下を向く
        
        // 横方向の曲がり（三次関数で徐々に曲がる）
        const witherHorizontal = isPortrait ? 0.08 : 0.1; // 横方向の最大曲がり幅（控えめに）
        const curveX = t * t * t; // 三次関数で先端ほど曲がる
        const witherOffsetX = curveX * this.p.height * witherHorizontal * witherStrength;
        
        // 下方向の垂れ（先端部分だけ下に垂れる）
        const witherVertical = isPortrait ? 0.05 : 0.06; // 下方向の最大垂れ幅（控えめに）
        // 先端に近づくほど下に垂れる（二次関数）
        const dropCurve = t * t; // 先端ほど大きく垂れる
        const witherOffsetY = dropCurve * this.p.height * witherVertical * witherStrength;
        
        offsetX += witherOffsetX;
        offsetY += witherOffsetY;
      }

      const swayInfluence = t;

      // 音量によるうねり
      let undulationX = 0;
      if (hookStrength < 0.5) {
        const undulationStrength = 1 - hookStrength * 2;
        const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
        const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
        const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
        undulationX = (wave1 + wave2 + wave3) * undulationStrength * t;
      }

      const x = seedPos.x + swayAmount * swayInfluence + offsetX + undulationX;
      const y = seedPos.y - currentLength + offsetY;

      centerPoints.push({x, y});
    }

    // 中心線に沿って太さを持った形状を作成
    const leftPoints: Array<{x: number, y: number}> = [];
    const rightPoints: Array<{x: number, y: number}> = [];

    for (let i = 0; i < centerPoints.length; i++) {
      const point = centerPoints[i];
      const t = i / (centerPoints.length - 1);

      // 根元から先端に向かって細くなる
      const widthMultiplier = this.lerp(1.0, 0.3, t);
      const currentWidth = stemWidth * widthMultiplier;

      // 進行方向の角度を計算
      let angle: number;
      if (i < centerPoints.length - 1) {
        const next = centerPoints[i + 1];
        angle = Math.atan2(next.y - point.y, next.x - point.x);
      } else {
        const prev = centerPoints[i - 1];
        angle = Math.atan2(point.y - prev.y, point.x - prev.x);
      }

      // 垂直方向のオフセット
      const perpAngle = angle + Math.PI / 2;
      const offsetX = Math.cos(perpAngle) * currentWidth;
      const offsetY = Math.sin(perpAngle) * currentWidth;

      leftPoints.push({x: point.x + offsetX, y: point.y + offsetY});
      rightPoints.push({x: point.x - offsetX, y: point.y - offsetY});
    }

    // 本体のみを描画（グローエフェクトは除去）
    canvas.noStroke();

    // 音高に応じた本体の色
    const bodyR = this.lerp(70, 20, normalizedPitch);
    const bodyG = this.lerp(200, 120, normalizedPitch);
    const bodyB = this.lerp(160, 80, normalizedPitch);

    // セグメントごとに描画（透明度20で半透明）
    for (let i = 0; i < centerPoints.length - 1; i++) {
      canvas.fill(bodyR, bodyG, bodyB, 20);

      canvas.beginShape();
      canvas.vertex(leftPoints[i].x, leftPoints[i].y);
      canvas.vertex(leftPoints[i + 1].x, leftPoints[i + 1].y);
      canvas.vertex(rightPoints[i + 1].x, rightPoints[i + 1].y);
      canvas.vertex(rightPoints[i].x, rightPoints[i].y);
      canvas.endShape(this.p.CLOSE);
    }

    // 輪郭線を描画
    const outlineR = this.lerp(150, 60, normalizedPitch);
    const outlineG = 255;
    const outlineB = this.lerp(240, 160, normalizedPitch);

    canvas.stroke(outlineR, outlineG, outlineB, 150);
    canvas.strokeWeight(1);
    canvas.noFill();

    // 左側の輪郭
    canvas.beginShape();
    for (let i = 0; i < leftPoints.length; i++) {
      canvas.vertex(leftPoints[i].x, leftPoints[i].y);
    }
    canvas.endShape();

    // 右側の輪郭
    canvas.beginShape();
    for (let i = 0; i < rightPoints.length; i++) {
      canvas.vertex(rightPoints[i].x, rightPoints[i].y);
    }
    canvas.endShape();

    canvas.noStroke();

    // 葉を描画（茎の曲線に沿って配置）
    if (leaves && leaves.length > 0 && time !== undefined) {
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        
        // 葉が茎上のどの位置にいるかは生成時に固定された相対位置を使用
        const t = leaf.stemPositionRatio || 0;

        // 茎の曲線上の位置を取得（centerPointsから補間）
        const segmentIndex = Math.floor(t * (centerPoints.length - 1));
        const segmentT = (t * (centerPoints.length - 1)) - segmentIndex;
        
        let stemX = seedPos.x;
        let stemY = seedPos.y;
        
        if (segmentIndex >= 0 && segmentIndex < centerPoints.length - 1) {
          // 2点間を線形補間
          const p1 = centerPoints[segmentIndex];
          const p2 = centerPoints[segmentIndex + 1];
          stemX = p1.x + (p2.x - p1.x) * segmentT;
          stemY = p1.y + (p2.y - p1.y) * segmentT;
        } else if (segmentIndex >= 0 && segmentIndex < centerPoints.length) {
          const p = centerPoints[segmentIndex];
          stemX = p.x;
          stemY = p.y;
        }

        // 葉の位置を茎の曲線上に配置
        leaf.x = stemX;
        leaf.y = stemY;

        this.updateLeafSway(leaf, pitchChange, time);
        this.drawLeaf(canvas, leaf, pitch, i);
      }
    }
  }

  /**
   * 茎を描画（葉も含む）
   * 種子位置から上方向へ伸びる茎
   * - 音量に応じて成長速度が変化
   * - 芽と同じ発光スタイル
   * - 螺旋運動で自然な成長を表現
   * - 太さのある形状で描画
   * @param stemHeight 茎の高さ
   * @param sproutMaxLength 芽の最大長さ（螺旋開始の基準点）
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param leaves 葉の配列
   * @param time 現在時刻（ミリ秒）
   */
  public drawStem(stemHeight: number, sproutMaxLength: number, volume: number, pitch: number, pitchChange: number, leaves: Leaf[], time: number = this.p.millis()): void {
    const seedPos = this.getSeedPosition();

    // 音高に応じた色の変化
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 螺旋運動のパラメータ
    const spiralAmplitude = 30; // 左右の振れ幅（ピクセル）
    const spiralFrequency = 0.01; // 螺旋の周波数（高さあたりの回転数）

    // 茎の太さ
    const stemWidth = 6;

    // 茎を複数のセグメントに分割して螺旋を描く
    const segments = Math.max(30, Math.floor(stemHeight / 10)); // 高さに応じてセグメント数を調整

    // 中心線のポイントを計算
    const centerPoints: Array<{x: number, y: number}> = [];

    for (let i = 0; i <= segments; i++) {
      const segmentT = i / segments;
      const currentHeight = stemHeight * segmentT;

      // 芽の長さより下の部分はスキップ（芽が既に描画されている）
      if (currentHeight < sproutMaxLength) {
        continue;
      }

      // 芽の長さまでは螺旋なし、それ以降で徐々に螺旋が強くなる
      let spiralStrength = 0;
      if (currentHeight > sproutMaxLength) {
        // 芽の長さを超えた部分で螺旋を適用（0から1に徐々に増加）
        const spiralTransitionLength = 200; // 200pxかけて螺旋を強くする（より滑らかに）
        spiralStrength = Math.min(1, (currentHeight - sproutMaxLength) / spiralTransitionLength);
      }

      // 螺旋運動は無効化（真っ直ぐな茎）
      const spiralX = 0;

      // 揺れを追加（高さに応じて揺れの影響が増す）
      // currentHeightを使って茎全体の高さに対する割合を計算
      const swayInfluence = currentHeight / stemHeight; // 根元(0)は揺れず、先端(1)は最大
      const swayX = pitchChange * swayInfluence;

      const x = seedPos.x + spiralX + swayX;
      const y = seedPos.y - currentHeight;

      centerPoints.push({x, y});
    }

    // 茎が芽の長さに達していない場合は描画しない
    if (centerPoints.length < 2) {
      // 葉の揺れを更新して描画だけ行う
      for (const leaf of leaves) {
        this.updateLeafSway(leaf, pitchChange, time);
        this.drawLeaf(this.p, leaf, pitch);
      }
      return;
    }

    // 中心線に沿って太さを持った形状を作成
    const leftPoints: Array<{x: number, y: number}> = [];
    const rightPoints: Array<{x: number, y: number}> = [];

    for (let i = 0; i < centerPoints.length; i++) {
      const point = centerPoints[i];

      // 進行方向の角度を計算
      let angle: number;
      if (i < centerPoints.length - 1) {
        const next = centerPoints[i + 1];
        angle = Math.atan2(next.y - point.y, next.x - point.x);
      } else {
        const prev = centerPoints[i - 1];
        angle = Math.atan2(point.y - prev.y, point.x - prev.x);
      }

      // 垂直方向のオフセット
      const perpAngle = angle + Math.PI / 2;
      const offsetX = Math.cos(perpAngle) * stemWidth;
      const offsetY = Math.sin(perpAngle) * stemWidth;

      leftPoints.push({x: point.x + offsetX, y: point.y + offsetY});
      rightPoints.push({x: point.x - offsetX, y: point.y - offsetY});
    }

    // 1. 外側のグロー効果（加算合成）- 常に一定の強度
    this.p.blendMode(this.p.ADD);
    const glowLayers = 4; // 8→4に減らして軽量化
    const glowStrength = 0.5; // 控えめな強度で常に表示
    for (let layer = 0; layer < glowLayers; layer++) {
      const t = layer / glowLayers;
      const glowWidth = stemWidth + t * 10; // t*15からt*10に変更

      // 緑のグロー（音高で大きく変化）
      const r = this.lerp(80, 10, normalizedPitch);
      const g = this.lerp(220, 100, normalizedPitch);
      const b = this.lerp(180, 60, normalizedPitch);

      const alpha = (1 - t * t * t) * 3 * glowStrength; // 強度を適用

      this.p.stroke(r, g, b, alpha);
      this.p.strokeWeight(glowWidth * 2);
      this.p.noFill();

      this.p.beginShape();
      for (const point of centerPoints) {
        this.p.vertex(point.x, point.y);
      }
      this.p.endShape();
    }

    // 2. 茎の本体（半透明な塗りつぶし）
    this.p.blendMode(this.p.BLEND);
    this.p.noStroke();

    // 音高に応じた本体の色（より極端な変化）
    const bodyR = this.lerp(70, 20, normalizedPitch);
    const bodyG = this.lerp(200, 120, normalizedPitch);
    const bodyB = this.lerp(160, 80, normalizedPitch);

    this.p.fill(bodyR, bodyG, bodyB, 20);

    this.p.beginShape();
    // 左側の輪郭
    for (const point of leftPoints) {
      this.p.vertex(point.x, point.y);
    }
    // 右側の輪郭（逆順）
    for (let i = rightPoints.length - 1; i >= 0; i--) {
      this.p.vertex(rightPoints[i].x, rightPoints[i].y);
    }
    this.p.endShape(this.p.CLOSE);

    // 3. はっきりとした輪郭線（発光）
    this.p.blendMode(this.p.ADD);
    const edgeLayers = 4; // 6から4に減らして葉と同じに
    for (let layer = 0; layer < edgeLayers; layer++) {
      const t = layer / edgeLayers;
      const thickness = 0.5 + t * 2; // 1+t*3 から 0.5+t*2 に変更（葉と同じ）

      // 音高に応じた輪郭の色（より極端な変化）
      const r = this.lerp(150, 60, normalizedPitch);
      const g = 255;
      const b = this.lerp(240, 160, normalizedPitch);

      const alpha = (1 - t * t) * 40; // 60から40に減らして葉と同じに

      this.p.stroke(r, g, b, alpha);
      this.p.strokeWeight(thickness);
      this.p.noFill();

      // 左側の輪郭
      this.p.beginShape();
      for (const point of leftPoints) {
        this.p.vertex(point.x, point.y);
      }
      this.p.endShape();

      // 右側の輪郭
      this.p.beginShape();
      for (const point of rightPoints) {
        this.p.vertex(point.x, point.y);
      }
      this.p.endShape();
    }

    this.p.blendMode(this.p.BLEND);
    this.p.noStroke();

    // 葉の揺れを更新して描画
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      // 葉の高さを計算
      const leafHeight = seedPos.y - leaf.y;

      // 茎のその位置でのX座標オフセットを計算
      const stemXOffset = this.calculateStemXOffset(leafHeight, sproutMaxLength, stemHeight, pitchChange);

      // 葉のX座標を茎の位置に合わせて更新
      leaf.x = seedPos.x + stemXOffset;

      // 葉の揺れを更新
      this.updateLeafSway(leaf, pitchChange, time);

      // 葉を描画（インデックスを渡す）
      this.drawLeaf(this.p, leaf, pitch, i);
    }
  }

  /**
   * 葉の揺れを更新
   * アイドル時のゆっくりとした周期的な揺れと、音高変化に応じた追加の揺れ
   * @param leaf 葉のデータ
   * @param pitchChange 音高の変化量
   * @param time 現在時刻（ミリ秒）
   */
  private updateLeafSway(leaf: Leaf, pitchChange: number, time: number): void {
    // アイドル時の揺れ（ゆっくりとした周期的な上下の揺れ）
    const idleSwayPeriod = 4000; // 4秒周期
    const idleSwayAmplitude = 3; // ±3px
    const idlePhase = (time / idleSwayPeriod) * this.p.TWO_PI + leaf.idleSwayPhase;
    const idleSway = Math.sin(idlePhase) * idleSwayAmplitude;

    // 音高変化に応じた揺れ（上下方向）
    const pitchSway = pitchChange * 0.1;

    // 合計の揺れ（Y座標のオフセット）
    leaf.swayOffset = idleSway + pitchSway;

    // S字のしなり（時間に応じて変化）
    // sin波を使ってS字カーブを作る
    const bendPhase = (time / idleSwayPeriod) * this.p.TWO_PI + leaf.idleSwayPhase + Math.PI / 2; // 位相を90度ずらす
    leaf.bendAmount = Math.sin(bendPhase) * 0.3; // -0.3から0.3の範囲
  }

  /**
   * 茎の特定の高さでのX座標を計算（螺旋 + 揺れ）
   * @param height 種子からの高さ
   * @param sproutMaxLength 芽の最大長さ
   * @param stemHeight 現在の茎の高さ
   * @param pitchChange 音高の変化量
   * @returns 茎のX座標オフセット
   */
  public calculateStemXOffset(height: number, sproutMaxLength: number, stemHeight: number, pitchChange: number): number {
    // 螺旋運動は無効化（真っ直ぐな茎）
    const spiralX = 0;

    // 揺れのX座標オフセット
    const swayInfluence = height / stemHeight;
    const swayX = pitchChange * swayInfluence;

    return spiralX + swayX;
  }

  /**
   * 葉を描画（ベジェ曲線で葉の形状を作成）
   * @param canvas 描画先キャンバス（p5またはp5.Graphics）
   * @param leaf 葉のデータ
   * @param pitch 音高（Hz）- 色の変化に使用
   * @param leafIndex 葉のインデックス
   */
  private drawLeaf(canvas: p5 | p5.Graphics, leaf: Leaf, pitch: number = 440, leafIndex: number = 0): void {
    // 長さの成長が始まっていない場合は描画しない
    if (leaf.lengthProgress <= 0) return;

    canvas.push();

    // 葉の位置に移動（生え際は固定）
    canvas.translate(leaf.x, leaf.y);

    // Step 3: Rotation（角度を10度から45度まで倒す）
    const isLeft = Math.abs(leaf.angle - Math.PI) < 0.1; // 左向きかどうか
    const minAngle = Math.PI / 18; // 10度
    const maxAngle = Math.PI / 4; // 45度
    const currentAngle = this.lerp(minAngle, maxAngle, leaf.rotationProgress);
    const upwardTilt = isLeft ? -currentAngle : currentAngle;
    canvas.rotate(leaf.angle + upwardTilt);

    // 音高に応じた色の変化（茎と同じロジック）
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // Step 1: Length（長さの成長）
    const lengthScale = leaf.lengthProgress;

    // Step 2: Width（幅の展開）
    const widthScale = leaf.widthProgress;

    // 葉の中心線のベジェ曲線制御点
    const startX = 0;
    const startY = 0;

    // 個体差による制御点のオフセット（shapeSeedを使用）
    // -5pxから+5pxの範囲でランダムにずらす
    const cp1OffsetX = (leaf.shapeSeed - 0.5) * 10; // ±5px
    const cp1OffsetY = (Math.sin(leaf.shapeSeed * Math.PI * 2) - 0.5) * 8; // ±4px
    const cp2OffsetX = (Math.cos(leaf.shapeSeed * Math.PI * 3) - 0.5) * 10; // ±5px
    const cp2OffsetY = (leaf.shapeSeed - 0.5) * 8; // ±4px

    // 制御点1（茎に近い部分）- bendAmountと個体差でずらす
    const cp1X = (leaf.size * 0.3 + leaf.bendAmount * 15 + cp1OffsetX) * lengthScale;
    const cp1Y = (-leaf.size * 0.25 + leaf.swayOffset * 0.3 + cp1OffsetY) * lengthScale;

    // 制御点2（先端に近い部分）- bendAmountと個体差で逆方向にずらしてS字に
    const cp2X = (leaf.size * 0.7 - leaf.bendAmount * 15 + cp2OffsetX) * lengthScale;
    const cp2Y = (-leaf.size * 0.75 + leaf.swayOffset * 0.7 + cp2OffsetY) * lengthScale;

    // 終点（葉の先端）- swayOffsetを最も強く適用
    const endX = leaf.size * lengthScale;
    const endY = (-leaf.size + leaf.swayOffset) * lengthScale;

    // 葉の幅（中央が最も広く、両端は細い）- widthProgressとtargetWidthで制御
    // 折り畳まれている時は葉脈に沿って左右から畳まれている（縦に細長い）
    const minWidthRatio = 0.02; // 折り畳み時は2%の幅（ほぼ葉脈のみ）
    const maxWidthRatio = 0.4 * leaf.targetWidth * leaf.widthRatio; // 展開時は音高に応じた幅 × 生成時ピッチによる横幅比率
    const currentWidthRatio = this.lerp(minWidthRatio, maxWidthRatio, widthScale);

    // 透明度（展開に応じて増加）
    const alphaMultiplier = leaf.lengthProgress; // 長さが伸びるにつれて表示

    // 中心線のパスを生成
    const pathSegments = 30;
    const centerPoints: Array<{x: number, y: number, t: number, width: number}> = [];

    // 葉ごとに異なるうねりパターン（葉のangleをシードに使用）
    const waveSeed = leaf.angle * 10; // 葉の角度をシードに

    for (let i = 0; i <= pathSegments; i++) {
      const t = i / pathSegments;
      const x = this.bezierPoint(startX, cp1X, cp2X, endX, t);
      const y = this.bezierPoint(startY, cp1Y, cp2Y, endY, t);

      // 葉の幅（中央が広く、両端が細い）
      const baseWidth = leaf.size * currentWidthRatio * Math.sin(t * Math.PI);

      // うねりを追加（葉ごとに異なるパターン）
      // 複数の波を重ねて自然なうねりを作る
      const wave1 = Math.sin(t * Math.PI * 3 + waveSeed) * 0.15; // 大きな波
      const wave2 = Math.sin(t * Math.PI * 7 + waveSeed * 1.3) * 0.08; // 中くらいの波
      const wave3 = Math.sin(t * Math.PI * 11 + waveSeed * 1.7) * 0.04; // 小さな波

      // うねりの強度（中央部分で強く、両端で弱く）
      const waveStrength = Math.sin(t * Math.PI); // 0-1-0
      const totalWave = (wave1 + wave2 + wave3) * waveStrength;

      // 幅にうねりを適用（±20%程度の変化）
      const undulatedWidth = baseWidth * (1 + totalWave);

      centerPoints.push({x, y, t, width: undulatedWidth});
    }

    // 葉の色を計算（粒子用）
    const leafR = Math.floor(this.lerp(70, 20, normalizedPitch));
    const leafG = Math.floor(this.lerp(200, 120, normalizedPitch));
    const leafB = Math.floor(this.lerp(160, 80, normalizedPitch));
    const leafColor = `rgb(${leafR}, ${leafG}, ${leafB})`;

    // 葉の中心点を粒子として収集（無効化 - パフォーマンス改善）
    // 既に宣言済みの変数を使用
    // const totalRotation = leaf.angle + upwardTilt;

    // for (const point of centerPoints) { ... }

    // 葉の形状を描画（塗りつぶし、音高に応じた色）
    canvas.blendMode(this.p.BLEND);

    // 葉の面を描画（茎と同じ半透明な緑、音高で変化）
    const bodyR = this.lerp(70, 20, normalizedPitch); // 低音:明るい、高音:暗い
    const bodyG = this.lerp(200, 120, normalizedPitch); // 低音:明るい緑、高音:暗い緑
    const bodyB = this.lerp(160, 80, normalizedPitch); // 低音:明るい、高音:暗い

    canvas.noStroke();
    const fillAlpha = 20 * (alphaMultiplier || 1); // alphaMultiplierが未定義の場合は1を使用
    canvas.fill(bodyR, bodyG, bodyB, fillAlpha); // 展開に応じて透明度を調整
    canvas.beginShape();

    // 上側の輪郭
    for (const point of centerPoints) {
      // 中心線から垂直方向にオフセット
      const angle = Math.atan2(
        point.y - (centerPoints[Math.max(0, centerPoints.indexOf(point) - 1)]?.y || point.y),
        point.x - (centerPoints[Math.max(0, centerPoints.indexOf(point) - 1)]?.x || point.x)
      );
      const offsetX = -Math.sin(angle) * point.width;
      const offsetY = Math.cos(angle) * point.width;

      canvas.vertex(point.x + offsetX, point.y + offsetY);
    }

    // 下側の輪郭（逆順）
    for (let i = centerPoints.length - 1; i >= 0; i--) {
      const point = centerPoints[i];
      const angle = Math.atan2(
        point.y - (centerPoints[Math.max(0, i - 1)]?.y || point.y),
        point.x - (centerPoints[Math.max(0, i - 1)]?.x || point.x)
      );
      const offsetX = -Math.sin(angle) * point.width;
      const offsetY = Math.cos(angle) * point.width;

      canvas.vertex(point.x - offsetX, point.y - offsetY);
    }

    canvas.endShape(this.p.CLOSE);

    // 葉の輪郭線を描画（通常合成、細い線）
    canvas.noFill();
    canvas.strokeWeight(0.5);

    // 音高に応じた輪郭の色
    const outlineR = this.lerp(150, 60, normalizedPitch);
    const outlineG = 255;
    const outlineB = this.lerp(240, 160, normalizedPitch);
    canvas.stroke(outlineR, outlineG, outlineB, 80 * alphaMultiplier);

    // 上側の輪郭
    canvas.beginShape();
    for (const point of centerPoints) {
      const angle = Math.atan2(
        point.y - (centerPoints[Math.max(0, centerPoints.indexOf(point) - 1)]?.y || point.y),
        point.x - (centerPoints[Math.max(0, centerPoints.indexOf(point) - 1)]?.x || point.x)
      );
      const offsetX = -Math.sin(angle) * point.width;
      const offsetY = Math.cos(angle) * point.width;

      canvas.vertex(point.x + offsetX, point.y + offsetY);
    }
    canvas.endShape();

    // 下側の輪郭
    canvas.beginShape();
    for (const point of centerPoints) {
      const angle = Math.atan2(
        point.y - (centerPoints[Math.max(0, centerPoints.indexOf(point) - 1)]?.y || point.y),
        point.x - (centerPoints[Math.max(0, centerPoints.indexOf(point) - 1)]?.x || point.x)
      );
      const offsetX = -Math.sin(angle) * point.width;
      const offsetY = Math.cos(angle) * point.width;

      canvas.vertex(point.x - offsetX, point.y - offsetY);
    }
    canvas.endShape();

    // 中心線（葉脈）を描画
    if (leaf.veinBrightness > 0) {
      // 葉脈が光っている時
      canvas.blendMode(this.p.ADD);
      canvas.strokeWeight(1); // 太さは変えない
      canvas.beginShape();
      for (const point of centerPoints) {
        const baseColor = this.p.color(leaf.baseColor);
        const tipColor = this.p.color(leaf.tipColor);
        const segmentColor = this.p.lerpColor(baseColor, tipColor, point.t);

        // より自然な緑の光（黄緑寄り）
        const r = Math.min(255, this.p.red(segmentColor) + 100);
        const g = Math.min(255, this.p.green(segmentColor) + 120);
        const b = Math.min(255, this.p.blue(segmentColor) + 80);

        canvas.stroke(r, g, b, leaf.veinBrightness * 150 * alphaMultiplier);
        canvas.vertex(point.x, point.y);
      }
      canvas.endShape();
    } else {
      // 通常時の葉脈（薄く）
      canvas.strokeWeight(1);
      canvas.beginShape();
      for (const point of centerPoints) {
        const baseColor = this.p.color(leaf.baseColor);
        const tipColor = this.p.color(leaf.tipColor);
        const segmentColor = this.p.lerpColor(baseColor, tipColor, point.t);

        const r = Math.min(255, this.p.red(segmentColor) + 80);
        const g = Math.min(255, this.p.green(segmentColor) + 100);
        const b = Math.min(255, this.p.blue(segmentColor) + 60);

        canvas.stroke(r, g, b, 60 * alphaMultiplier);
        canvas.vertex(point.x, point.y);
      }
      canvas.endShape();
    }

    canvas.blendMode(this.p.BLEND);
    canvas.pop();
  }

  /**
   * ベジェ曲線上の点を計算
   */
  private bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  /**
   * 葉を生成
   * @param stemHeight 現在の茎の高さ
   * @param leafStartHeight 葉の生成を開始する高さ（根本からのオフセット）
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）- 最終的な幅を決定
   * @param existingLeaves 既存の葉の配列
   * @returns 新しい葉（生成されない場合はnull）
   */
  public generateLeaf(stemHeight: number, leafStartHeight: number, volume: number, pitch: number, existingLeaves: Leaf[]): Leaf | null {
    // 画面の向きを判定
    const isPortrait = this.p.height > this.p.width;

    // 葉の生成間隔（画面高さと向きに基づく、より広く）
    const leafInterval = this.p.height * (isPortrait ? 0.08 : 0.1); // 縦向きは8%、横向きは10%（より広く）

    // leafStartHeightを考慮した期待される葉の数
    const growthAboveStart = Math.max(0, stemHeight - leafStartHeight);
    const expectedLeafCount = Math.floor(growthAboveStart / leafInterval);

    // 既に十分な葉がある場合は生成しない
    if (existingLeaves.length >= expectedLeafCount) {
      return null;
    }

    // 新しい葉の位置（茎上の高さ）- leafStartHeightから開始
    const leafHeight = leafStartHeight + existingLeaves.length * leafInterval;

    // 螺旋運動は無効化（真っ直ぐな茎）
    const spiralX = 0;

    // より多様な角度で配置（左右だけでなく、前後も含む）
    // 葉のインデックスに基づいて角度を決定（疑似ランダム）
    const leafIndex = existingLeaves.length;

    // 黄金角（137.5度）を使って自然な螺旋配置
    const goldenAngle = 137.5 * (Math.PI / 180); // ラジアンに変換
    const baseAngle = leafIndex * goldenAngle;

    // 音高と音量に応じたランダム性を追加
    // 音高: 高いほど角度のばらつきが大きい（±30度）
    // 音量: 大きいほど角度のばらつきが大きい（±20度）
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);
    const volumeFactor = volume / 100;

    // 音高による角度変化（高音ほど大きく変化）
    const pitchVariation = normalizedPitch * (Math.PI / 6); // 0-30度

    // 音量による角度変化（音量が大きいほど変化）
    const volumeVariation = volumeFactor * (Math.PI / 9); // 0-20度

    // 疑似ランダムな方向（-1 or 1）
    const randomOffset = (Math.sin(leafIndex * 12.9898 + 78.233) * 43758.5453) % 1; // 疑似ランダム
    const direction = randomOffset > 0.5 ? 1 : -1;

    // 総合的な角度変化
    const angleVariation = direction * (pitchVariation + volumeVariation);

    const angle = baseAngle + angleVariation;

    // 左右の判定（角度に基づく）
    const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const isLeft = normalizedAngle > Math.PI / 2 && normalizedAngle < Math.PI * 3 / 2;

    // 音高に応じた最終的な幅（低音:広い、高音:狭い）
    const targetWidth = this.lerp(1.0, 0.3, normalizedPitch); // 低音:100%、高音:30%

    // 左右で展開タイミングを0.1秒ずらす
    const unfoldDelay = isLeft ? 0 : 0.1; // 左が先、右が0.1秒遅れ

    // 葉のサイズ（音量に応じて変化、画面サイズと向きに応じてスケール）
    // 下の葉は小さく、上に行くほど大きくなる（花に近い葉は特に大きく）
    const baseSize = this.p.height * (isPortrait ? 0.104 : 0.13); // 縦向きは10.4%、横向きは13%（1.3倍）

    // 葉の位置に応じたサイズ倍率（下:60%、上:120%）
    // 葉の数に関わらず、インデックスに応じて滑らかにサイズが変化
    const sizeMultiplier = existingLeaves.length > 0
      ? 0.6 + (leafIndex / Math.max(1, existingLeaves.length)) * 0.6 // 0.6から1.2へ
      : 0.9; // 最初の葉は中間サイズ

    const size = baseSize * sizeMultiplier + volumeFactor * baseSize * sizeMultiplier * 0.5; // 音量で±25%変化

    const seedPos = this.getSeedPosition();

    // 形状の個体差シード（葉のインデックスから生成）
    const shapeSeed = (Math.sin(leafIndex * 7.919 + 31.415) * 43758.5453) % 1; // 0-1の疑似ランダム

    // 生成時のピッチに基づく横幅比率
    // 低音: 細長い（0.7倍）、高音: 丸い（1.3倍）
    const widthRatio = this.lerp(0.7, 1.3, normalizedPitch);

    // 茎上の相対位置を計算（0=根元、1=先端）
    const stemPositionRatio = stemHeight > 0 ? leafHeight / stemHeight : 0;

    return {
      x: seedPos.x + spiralX,
      y: seedPos.y - leafHeight,
      angle: angle,
      size: size,
      baseColor: 'rgb(20, 100, 60)',
      tipColor: 'rgb(100, 220, 140)',
      swayOffset: 0,
      bendAmount: 0,
      veinBrightness: 0,
      idleSwayPhase: Math.random() * Math.PI * 2, // ランダムな初期位相
      unfurlProgress: 0, // 最初は丸まった状態
      birthTime: this.p.millis(), // 生成時刻を記録
      lengthProgress: 0, // 長さの成長開始
      widthProgress: 0, // 幅はまだ0
      rotationProgress: 0, // 角度もまだ0
      targetWidth: targetWidth, // 音高に応じた最終幅
      unfoldDelay: unfoldDelay, // 展開タイミングのオフセット
      isLeft: isLeft, // 左右の判定
      shapeSeed: shapeSeed, // 形状の個体差シード
      birthPitch: pitch, // 生成時の音高
      widthRatio: widthRatio, // 横幅の比率
      stemPositionRatio: stemPositionRatio // 茎上の相対位置（生成時に固定）
    };
  }

  /**
   * ガク（萼）を描画
   * 花の根元に小さな葉が密集する部分
   * @param canvas 描画先キャンバス（p5またはp5.Graphics）
   * @param centerX 中心X座標
   * @param centerY 中心Y座標
   * @param size ガクのサイズ
   * @param normalizedPitch 正規化された音高（0-1）
   * @param bloomProgress 開花の進行度（0-1）
   */
  private drawCalyx(canvas: p5 | p5.Graphics, centerX: number, centerY: number, size: number, normalizedPitch: number, bloomProgress: number): void {
    // ガクの成長アニメーション（非常にゆっくり、段階的に）
    // bloomProgress 0.0-0.4でガクが成長、0.4-1.0で花が開く
    let calyxGrowth = 0;
    if (bloomProgress < 0.4) {
      // 0.0-0.4の範囲を0-1にマッピング（ガクが先に成長）
      const t = bloomProgress / 0.4;
      // 非常に緩やかな成長カーブ（3乗で開始を遅く）
      const eased = t * t * t; // 3乗で最初は非常にゆっくり
      calyxGrowth = eased;
    } else {
      calyxGrowth = 1.0; // 完全に成長
    }

    // ガクが成長していない場合は描画しない
    if (calyxGrowth <= 0) return;

    canvas.push();
    canvas.translate(centerX, centerY);

    // ガクの色（茎よりかなり明るい黄緑色、音高で変化）
    const calyxR = this.lerp(140, 80, normalizedPitch); // 茎より明るく
    const calyxG = this.lerp(255, 180, normalizedPitch); // 茎より明るく
    const calyxB = this.lerp(140, 80, normalizedPitch); // 茎より明るく

    // ガクの葉を5枚描画（8枚→5枚に減らして自然に）
    const sepalCount = 5;
    const angleStep = (Math.PI * 2) / sepalCount;

    // 各ガクの葉を角度順に描画（奥から手前へ）
    const sepals = [];
    for (let i = 0; i < sepalCount; i++) {
      const angle = i * angleStep - Math.PI / 2; // -90度から開始（上向き）
      sepals.push({ index: i, angle: angle });
    }

    // 角度に基づいて奥行きを計算してソート（奥から手前へ描画）
    sepals.sort((a, b) => {
      // 上側（奥）から下側（手前）へ
      const normalizedA = ((a.angle + Math.PI * 2) % (Math.PI * 2));
      const normalizedB = ((b.angle + Math.PI * 2) % (Math.PI * 2));

      // π < angle < 2π が上側（奥）、0 < angle < π が下側（手前）
      // 上側を先に描画
      if (normalizedA > Math.PI && normalizedB <= Math.PI) return -1;
      if (normalizedA <= Math.PI && normalizedB > Math.PI) return 1;

      // 同じ側なら角度順
      if (normalizedA > Math.PI) {
        return normalizedA - normalizedB; // 上側は左から右へ
      } else {
        return normalizedB - normalizedA; // 下側は右から左へ
      }
    });

    for (const sepal of sepals) {
      const angle = sepal.angle;

      canvas.push();
      canvas.rotate(angle);

      // ガクの葉の形状（短く幅広い、茎とは明確に異なる形）
      // calyxGrowthを適用して徐々に伸びる
      // 成長初期はさらに小さく開始（0から徐々に大きく）
      const growthCurve = calyxGrowth * calyxGrowth * calyxGrowth; // 3乗でさらに緩やかに
      const sepalLength = size * growthCurve * 0.7; // 短く（1.2→0.7）
      const sepalWidth = size * 0.4 * growthCurve; // 幅広く（0.25→0.4）

      // 奥行きに応じた明暗（手前を明るく、奥を暗く）
      const normalizedAngle = ((angle + Math.PI * 2) % (Math.PI * 2));
      let depthBrightness = 1.0;
      let depthScale = 1.0; // 奥行きに応じたスケール

      if (normalizedAngle > Math.PI) {
        // 上側（奥）: 暗く（0.65倍）、小さく（0.85倍）
        depthBrightness = 0.65;
        depthScale = 0.85;
      } else {
        // 下側（手前）: 明るく（1.15倍）、大きく（1.1倍）
        depthBrightness = 1.15;
        depthScale = 1.1;
      }

      // スケールを適用した寸法
      const scaledLength = sepalLength * depthScale;
      const scaledWidth = sepalWidth * depthScale;

      // グロー効果（奥行きに応じて調整、控えめに）
      canvas.blendMode(this.p.ADD);
      for (let layer = 0; layer < 4; layer++) { // 6→4層に減らして控えめに
        const layerT = layer / 4;
        const glowR = this.lerp(100, 30, normalizedPitch) * depthBrightness;
        const glowG = this.lerp(240, 120, normalizedPitch) * depthBrightness;
        const glowB = this.lerp(200, 80, normalizedPitch) * depthBrightness;
        const alpha = (1 - layerT * layerT) * 4 * depthBrightness * calyxGrowth; // 成長に合わせて透明度も上げる

        canvas.fill(glowR, glowG, glowB, alpha);
        canvas.noStroke();
        canvas.beginShape();
        canvas.vertex(0, 0); // 根元
        canvas.vertex(-scaledWidth / 2 - layerT * 4, scaledLength * 0.4);
        canvas.vertex(0, scaledLength + layerT * 4);
        canvas.vertex(scaledWidth / 2 + layerT * 4, scaledLength * 0.4);
        canvas.endShape(this.p.CLOSE);
      }

      // 本体（奥行きに応じて明暗調整）
      canvas.blendMode(this.p.BLEND);
      const bodyR = calyxR * depthBrightness;
      const bodyG = calyxG * depthBrightness;
      const bodyB = calyxB * depthBrightness;
      canvas.fill(bodyR, bodyG, bodyB, 90 * calyxGrowth); // 成長に合わせて透明度も上げる
      canvas.noStroke();
      canvas.beginShape();
      canvas.vertex(0, 0);
      canvas.vertex(-scaledWidth / 2, scaledLength * 0.4);
      canvas.vertex(0, scaledLength);
      canvas.vertex(scaledWidth / 2, scaledLength * 0.4);
      canvas.endShape(this.p.CLOSE);

      // 輪郭線（奥行きに応じて調整、控えめに）
      canvas.blendMode(this.p.ADD);
      const outlineR = this.lerp(180, 90, normalizedPitch) * depthBrightness;
      const outlineG = 255 * depthBrightness;
      const outlineB = this.lerp(255, 180, normalizedPitch) * depthBrightness;

      canvas.stroke(outlineR, outlineG, outlineB, 60 * depthBrightness * calyxGrowth); // 成長に合わせて透明度も上げる
      canvas.strokeWeight(1.5); // 2→1.5に細く
      canvas.noFill();
      canvas.beginShape();
      canvas.vertex(0, 0);
      canvas.vertex(-scaledWidth / 2, scaledLength * 0.4);
      canvas.vertex(0, scaledLength);
      canvas.vertex(scaledWidth / 2, scaledLength * 0.4);
      canvas.vertex(0, 0);
      canvas.endShape();

      canvas.pop();
    }

    canvas.blendMode(this.p.BLEND);
    canvas.pop();
  }

  /**
   * 花を描画（バラ曲線を使用、層状に展開）
   * @param canvas 描画先キャンバス（p5またはp5.Graphics）
   * @param stemHeight 茎の高さ
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param leaves 葉の配列
   * @param bloomProgress 開花の進行度（0-1）
   * @param time 現在時刻（ミリ秒）
   */
  public drawBloom(canvas: p5 | p5.Graphics, stemHeight: number, volume: number, pitch: number, pitchChange: number, leaves: Leaf[], bloomProgress: number, time: number = this.p.millis()): void {
    const seedPos = this.getSeedPosition();

    // 茎の先端の揺れを計算（茎と完全に同じロジック）
    let swayAmount = pitchChange * 0.5; // 茎と同じ
    
    // 風の揺れを追加（drawSproutと同じロジック）
    if (volume < 20) {
      // 音量0-19の範囲で、微妙な風の揺れ
      const lowVolumeFactor = volume / 20; // 0-1
      const windSway = Math.sin(time / 800) * 8 * lowVolumeFactor; // ±8の揺れ
      swayAmount += windSway;
    } else {
      // 音量20以上でも風の揺れを追加（より強く）
      const highVolumeFactor = Math.min(volume / 100, 1); // 0-1
      const windSway = Math.sin(time / 800) * 12 * highVolumeFactor; // ±12の揺れ
      swayAmount += windSway;
    }
    
    const swayInfluence = 1.0; // 先端なので最大の揺れ
    const stemSwayX = swayAmount * swayInfluence;

    // 音量に応じたうねり（茎と完全に同じ）
    const volumeFactorForUndulation = volume / 100;
    const undulationAmount = volumeFactorForUndulation * 30; // 茎と同じ
    const t = 1.0; // 先端
    const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
    const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
    const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
    const undulationX = (wave1 + wave2 + wave3) * t; // 先端なので最大のうねり

    // 花の中心位置（茎の先端と完全に一致）
    const flowerCenterX = seedPos.x + stemSwayX + undulationX;
    const flowerCenterY = seedPos.y - stemHeight;

    // 画面の向きを判定
    const isPortrait = canvas.height > canvas.width;

    // 音量に応じた係数（複数箇所で使用）
    const volumeFactor = volume / 100;

    // 花のサイズ（画面サイズに応じて、より大きく）
    const baseFlowerSizeFixed = canvas.height * (isPortrait ? 0.18 : 0.225); // 縦向きは18%、横向きは22.5%（1.5倍）
    let baseFlowerSize = baseFlowerSizeFixed;

    // 花のサイズを2段階で制御（滑らかに遷移）
    // フェーズ1（bloomProgress 0.2-0.6）：徐々に成長（0%→100%）
    // フェーズ2（bloomProgress 0.6-1.0）：最大サイズに達し、音量で揺らぐ

    if (bloomProgress < 0.6) {
      // 成長フェーズ：bloomProgressに応じて0%→100%まで成長
      // bloomProgress 0.2で0%、0.6で100%
      const growthProgress = Math.max(0, (bloomProgress - 0.2) / 0.4); // 0-1
      // イージング適用（滑らかな加速・減速）
      const easedGrowth = growthProgress * growthProgress * (3 - 2 * growthProgress);
      const growthScale = easedGrowth; // 0%から100%まで成長
      baseFlowerSize *= growthScale;

      // 成長中も音量で少し揺らぐ（±10%）
      const volumeVariation = 0.9 + volumeFactor * 0.2;
      baseFlowerSize *= volumeVariation;
    } else {
      // 揺らぎフェーズ：音量に応じて揺らぐ（基本サイズは100%）
      const volumeScale = 0.85 + volumeFactor * 0.3; // 音量0で85%、音量100で115%（±15%の揺らぎ）
      baseFlowerSize *= volumeScale;
    }

    // 音高に応じたk値（花びらの数）
    let baseK = this.roseCurve.calculateKFromPitch(pitch, 3, 5.95, 200, 800);

    // 成長に応じて花びらの数を増やす
    if (bloomProgress < 0.6) {
      // 成長フェーズ：花びらの数も徐々に増える
      const growthProgress = Math.max(0, (bloomProgress - 0.2) / 0.4); // 0-1
      const easedGrowth = growthProgress * growthProgress * (3 - 2 * growthProgress);
      // 最初は少ない花びら（k=2）から、徐々に増える
      const minK = 2.0; // 最小の花びらの数
      baseK = minK + (baseK - minK) * easedGrowth;
    }

    this.targetK = baseK;

    // 音高の変化により敏感に反応（花びらの数がより変化する）
    const kVariation = Math.sin(time / 800) * 0.5; // ±0.5の揺らぎ
    this.targetK += kVariation;

    // k値をスムージング（急激な変化を防ぐ）
    const smoothingFactor = 0.02; // さらに滑らかに（0.05→0.02）
    this.previousK = this.previousK + (this.targetK - this.previousK) * smoothingFactor;
    const k = this.previousK;

    // 音高に応じた色相の変化（HSBカラーモードを使用）
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 満開後の色の移り変わりは無効化（音高のみで色を決定）
    let hueShift = 0;
    // if (bloomProgress >= 1.0) {
    //   // 満開後は時間に応じて色相がゆっくり変化（30秒で1周）
    //   hueShift = (time / 30000) * 360; // 30秒で360度回転
    // }

    // 音高に応じた基本色相（温かい〜冷たい）
    // 低音: 10度（赤オレンジ、温かい）、高音: 260度（青紫、冷たい）
    this.targetHue = this.lerp(10, 260, normalizedPitch) + hueShift;

    // 色相をスムージング（チラつかない程度に速く）
    const hueSmoothingFactor = 0.02; // 2%ずつ変化（0.005→0.02で4倍速く）
    // 色相は円環なので、最短経路で補間
    let hueDiff = this.targetHue - this.previousHue;
    if (hueDiff > 180) hueDiff -= 360;
    if (hueDiff < -180) hueDiff += 360;
    this.previousHue = (this.previousHue + hueDiff * hueSmoothingFactor + 360) % 360;
    const baseHue = this.previousHue;

    // 音量に応じた輝き（発光効果の強さ）
    const glowStrength = 0.3 + volumeFactor * 0.7; // 0.3-1.0

    // 音量に応じた細かい揺れ
    const shimmer = Math.sin(time / 100) * volumeFactor * 3; // ±3px

    // ガク（萼）を描画（花の根元）- より大きく目立つように
    // 固定サイズを使用してガクが伸び縮みしないようにする
    this.drawCalyx(canvas, flowerCenterX, flowerCenterY, baseFlowerSizeFixed * 0.5, normalizedPitch, bloomProgress);

    // 花びらを3層に分けて描画（蓮のような立体感）
    // 内層: 上部、小さい、立ち上がる
    // 中層: 中間、中サイズ、少し開く
    // 外層: 下部、大きい、横に広がる
    const layers = 3;

    for (let layer = 0; layer < layers; layer++) {
      // 花びらの表示タイミング制御とフェードイン
      // bloomProgress 0-0.2: ガクのみ（花びらは非表示）
      // bloomProgress 0.2-0.6: 花びらが成長（サイズ0→100%、最初の10%でフェードイン）
      // bloomProgress 0.6-1.0: 花びら完全表示、音量で揺らぐ

      let petalAlpha = 1.0; // 花びらの透明度

      if (bloomProgress < 0.2) {
        // ガクのみの段階、花びらは表示しない
        continue;
      } else if (bloomProgress < 0.24) {
        // フェードイン期間（0.2-0.24、成長の最初の10%）
        const fadeProgress = (bloomProgress - 0.2) / 0.04; // 0-1
        petalAlpha = fadeProgress; // 徐々に不透明に
      }

      // 全ての層を常に表示（bloomProgress >= 0.2の場合）
      // サイズは音量で制御されるため、展開アニメーションは不要
      const easedProgress = 1.0; // 常に完全表示

      // 蓮のような立体感: 外側ほど少しだけ大きく（サイズ差を小さくして滑らかに）
      // 内層(0): 0.85倍（小さく立ち上がる）
      // 中層(1): 0.95倍（中間）
      // 外層(2): 1.05倍（少し大きく横に広がる）
      const layerSizeRatio = 0.85 + (layer / (layers - 1)) * 0.2; // 0.85から1.05（差を小さく）
      const layerSize = baseFlowerSize * layerSizeRatio * easedProgress;

      // 層ごとのk値の微調整（外側ほど花びらが多く見える）
      const layerK = k + layer * 0.3;

      // 層ごとの回転は無効化（たわみだけで表現）
      const layerRotation = 0; // 回転なし

      // 蓮のような立体感: 外側の層ほど少しだけ低い位置（オフセットを小さく）
      // 内層(0): 上（-5%）、中層(1): 中間（0%）、外層(2): 下（+5%）
      const depthOffset = (layer - 1) * baseFlowerSize * 0.05 * easedProgress; // 外側ほど少し下に（0.15→0.05）

      // バラ曲線の点を計算（音量に応じて解像度を変える）
      // 音量が大きいほど詳細に、小さいほど粗く（パフォーマンス最適化）
      const minPoints = 180; // 最小点数（音量0の時）- 滑らかさを保つ
      const maxPoints = 240; // 最大点数（音量100の時）
      const safeVolumeFactor = Math.max(0, Math.min(1, volumeFactor)); // 0-1に制限
      const pointCount = Math.floor(minPoints + safeVolumeFactor * (maxPoints - minPoints));
      const curvePoints = this.roseCurve.calculateCurve(layerSize, layerK, pointCount);

      // 直交座標に変換（たわみを適用）
      const cartesianPoints = curvePoints.map((point, index) => {
        const theta = point.theta; // 回転なし、元の角度をそのまま使用

        // 花びらごとのディレイ（時間のズレ）
        const petalDelay = index * 0.05; // 各花びらに0.05秒のズレ
        const delayedTime = time + petalDelay * 1000;

        // 角度に応じて半径を調整（蓮のような形状）
        const angleFromTop = theta % (2 * Math.PI);
        let radiusMultiplier = 1.0;

        // 上半分（π < θ < 2π）：画面上側、横方向に広げる
        if (angleFromTop > Math.PI) {
          const upwardAngle = angleFromTop - Math.PI;
          const upwardFactor = Math.abs(Math.sin(upwardAngle));
          radiusMultiplier = 1.0 + upwardFactor * 0.3; // 1.0-1.3（横に広がる）
        } else {
          // 下半分（0 < θ < π）：画面下側、蓮のように小さく抑える
          const downwardAngle = angleFromTop;
          const downwardFactor = Math.abs(Math.sin(downwardAngle));
          radiusMultiplier = 0.5 + downwardFactor * 0.2; // 0.5-0.7（下側をさらに小さく）
        }

        // 花びらのたわみ（根元は固定、先端が揺れる）
        // 半径が大きいほど（先端に近いほど）たわみが大きい
        const distanceFromCenter = point.r / layerSize; // 0-1（中心からの距離の割合）

        // 音量に応じたたわみの強さ（風の強さ）- より控えめに
        const windStrength = volumeFactor * 10 * distanceFromCenter; // 20→10に減少

        // ノイズ関数的な揺れ（滑らかな波）
        // 各花びらで異なる周期とオフセットを持つ
        const noiseX = Math.sin(delayedTime / 1200 + index * 0.5) * windStrength; // 周期をさらに長く（800→1200）
        const noiseY = Math.cos(delayedTime / 1500 + index * 0.7) * windStrength * 0.2; // Y方向をさらに控えめ（0.3→0.2）

        // 音高変化による追加のたわみ（突風）- より控えめに
        const gustStrength = pitchChange * 0.3 * distanceFromCenter; // 0.5→0.3に減少

        // 総合的なたわみ（主にX方向、Y方向は控えめ）
        const totalBendX = noiseX + gustStrength;
        const totalBendY = noiseY;

        const adjustedRadius = point.r * radiusMultiplier;

        // 基本座標を計算
        const baseCartesian = this.roseCurve.polarToCartesian(
          adjustedRadius,
          theta, // 回転なし
          flowerCenterX,
          flowerCenterY + depthOffset
        );

        // たわみを適用（根元は固定、先端が揺れる）
        return {
          x: baseCartesian.x + totalBendX,
          y: baseCartesian.y + totalBendY
        };
      });

      // 花の座標を粒子として収集
      // 花の色を計算（HSBからRGB）
      this.p.colorMode(this.p.HSB, 360, 100, 100);
      const flowerHue = (baseHue + layer * 15) % 360;
      const flowerSaturation = 70 - layer * 5;
      const flowerBrightness = 90 - layer * 10;
      const flowerColorObj = this.p.color(flowerHue, flowerSaturation, flowerBrightness);
      this.p.colorMode(this.p.RGB, 255);

      const flowerR = Math.floor(this.p.red(flowerColorObj));
      const flowerG = Math.floor(this.p.green(flowerColorObj));
      const flowerB = Math.floor(this.p.blue(flowerColorObj));
      const flowerColor = `rgb(${flowerR}, ${flowerG}, ${flowerB})`;

      // 層の透明度（内側ほど濃く、外側ほど薄く）
      const layerAlpha = 1 - layer * 0.15;

      // 各層の花びらの点を粒子として追加（無効化 - パフォーマンス改善）
      // for (const point of cartesianPoints) { ... }

      // 層ごとの色相オフセット（グラデーション効果）
      const layerHueOffset = layer * 15; // 層ごとに15度ずつ色相をずらす

      // 花びらの塗りつぶし（グラデーション + 前後の明暗差）
      this.p.blendMode(this.p.BLEND);

      // 花びらを個別に描画してグラデーションを適用
      const petalCount = cartesianPoints.length;
      for (let i = 0; i < petalCount; i++) {
        const nextI = (i + 1) % petalCount;

        // 中心から花びらへのグラデーション
        // 中心: より明るく鮮やか、外側: 少し暗く深い色
        const petalT = i / petalCount; // 0-1

        // 花びらごとに微妙に色相を変える（虹色効果）
        const petalHueOffset = petalT * 30; // 花びら全体で30度の色相変化

        // 前後の明暗差を強調（奥の花びらを暗く、手前を明るく）
        // 角度に応じて明度を変える: 手前（下側、θ=π/2付近）を明るく、奥（上側、θ=3π/2付近）を暗く
        const angle = (cartesianPoints[i].x - flowerCenterX) !== 0
          ? Math.atan2(cartesianPoints[i].y - (flowerCenterY + depthOffset), cartesianPoints[i].x - flowerCenterX)
          : 0;
        const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2); // 0-2π

        // 手前（下側、π/2付近）で明るく、奥（上側、3π/2付近）で暗く
        let depthBrightness = 0;
        if (normalizedAngle < Math.PI) {
          // 下半分（0-π）: 手前なので明るい
          depthBrightness = 15 * Math.sin(normalizedAngle); // 0-15の明度追加
        } else {
          // 上半分（π-2π）: 奥なので暗い
          depthBrightness = -15 * Math.sin(normalizedAngle - Math.PI); // -15-0の明度減少
        }

        // HSBで色を計算
        const petalHue = (baseHue + layerHueOffset + petalHueOffset) % 360;
        const petalSaturation = 70 - layer * 5; // 外側の層ほど少し彩度を下げる
        const baseBrightness = 90 - layer * 10; // 外層(2)を内層(0)より暗く（90→70）
        const petalBrightness = Math.max(30, Math.min(100, baseBrightness + depthBrightness)); // 前後の明暗差を追加
        
        // RGB値を直接計算（p5.jsの色オブジェクトを使わない）
        const rgb = this.hsbToRgb(petalHue, petalSaturation, petalBrightness);
        const petalR = rgb.r;
        const petalG = rgb.g;
        const petalB = rgb.b;

        // 三角形で花びらのセグメントを描画（中心→点i→点i+1）
        canvas.fill(petalR, petalG, petalB, 25 * layerAlpha * easedProgress);
        canvas.noStroke();
        canvas.beginShape();
        canvas.vertex(flowerCenterX, flowerCenterY + depthOffset); // 中心
        canvas.vertex(cartesianPoints[i].x, cartesianPoints[i].y);
        canvas.vertex(cartesianPoints[nextI].x, cartesianPoints[nextI].y);
        canvas.endShape(this.p.CLOSE);
      }

      // 花びらの輪郭線を描画（通常合成、細い線）
      // HSBで輪郭色を計算（より明るく）
      this.p.colorMode(this.p.HSB, 360, 100, 100);
      const outlineHue = (baseHue + layerHueOffset) % 360;
      const outlineSaturation = 60; // 彩度を下げて明るく
      const outlineBrightness = 100; // 最大輝度
      const outlineColor = this.p.color(outlineHue, outlineSaturation, outlineBrightness);
      
      // RGB値を即座に抽出（メモリリーク回避）
      const outlineR = this.p.red(outlineColor);
      const outlineG = this.p.green(outlineColor);
      const outlineB = this.p.blue(outlineColor);
      this.p.colorMode(this.p.RGB, 255);

      canvas.stroke(outlineR, outlineG, outlineB, 200 * layerAlpha * easedProgress * petalAlpha);
      canvas.strokeWeight(0.5);
      canvas.noFill();
      canvas.beginShape();
      for (const point of cartesianPoints) {
        canvas.vertex(point.x, point.y);
      }
      canvas.endShape(this.p.CLOSE);

      // 花の中心（明るい核）を削除（グローエフェクトのため）
    }

    canvas.blendMode(this.p.BLEND);
  }

  /**
   * 芽を描画（collapseY制限付き）
   * collapseYより下（Y座標が大きい）の部分のみ描画
   * @param progress 成長進行度（0-1）
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param reduceGlow グロー効果を減らすか
   * @param stemHeight 茎の高さ
   * @param leaves 葉の配列
   * @param time 現在時刻
   * @param collapseY 崩壊ラインのY座標（これより上は描画しない）
   */
  private drawSproutWithCollapseY(progress: number, volume: number, pitch: number, pitchChange: number, reduceGlow: boolean, stemHeight: number, leaves: Leaf[], time: number, collapseY: number): void {
    const seedPos = this.getSeedPosition();

    // 茎の長さ
    const length = stemHeight;

    // 音高に応じた色の変化
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 音高の変化に応じた揺れ
    const swayAmount = pitchChange * 0.5;

    // 音量に応じたうねり
    const volumeFactor = volume / 100;
    const undulationAmount = volumeFactor * 30;

    // フックの強度
    const hookStrength = Math.max(0, 1 - progress / 0.8);

    // 画面の向きを判定
    const isPortrait = this.p.height > this.p.width;

    // 芽の太さ
    const stemWidth = this.p.height * (isPortrait ? 0.006 : 0.007);

    // 芽を複数のセグメントで描画
    const segments = 30;
    const centerPoints: Array<{x: number, y: number}> = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentLength = length * t;

      // フック状の曲がり
      let offsetX = 0;
      let offsetY = 0;

      if (hookStrength > 0 && t > 0.2) {
        const hookT = (t - 0.2) / 0.8;
        const easeHookT = hookT * hookT * (3 - 2 * hookT);
        const hookHorizontal = isPortrait ? 0.04 : 0.05;
        const horizontalCurve = easeHookT * easeHookT * (3 - 2 * easeHookT);
        offsetX = horizontalCurve * this.p.height * hookHorizontal * hookStrength;

        if (hookT > 0.2) {
          const liftT = (hookT - 0.2) / 0.8;
          const hookVertical = isPortrait ? 0.02 : 0.025;
          const liftCurve = liftT * liftT * liftT * (liftT * (liftT * 6 - 15) + 10);
          offsetY = -liftCurve * this.p.height * hookVertical * hookStrength;
        }
      }

      // 音高変化による揺れ
      const swayInfluence = t;

      // 音量によるうねり
      let undulationX = 0;
      if (hookStrength < 0.5) {
        const undulationStrength = 1 - hookStrength * 2;
        const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
        const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
        const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
        undulationX = (wave1 + wave2 + wave3) * undulationStrength * t;
      }

      const x = seedPos.x + swayAmount * swayInfluence + offsetX + undulationX;
      const y = seedPos.y - currentLength + offsetY;

      // collapseYより下（Y座標が大きい）の点のみ追加
      if (y >= collapseY) {
        centerPoints.push({x, y});
      }
    }

    // 描画する点が2つ未満なら描画しない
    if (centerPoints.length < 2) {
      // 葉だけ描画を試みる
      if (leaves && leaves.length > 0) {
        for (const leaf of leaves) {
          // 葉のY座標がcollapseYより下なら描画
          if (leaf.y >= collapseY) {
            this.updateLeafSway(leaf, pitchChange, time);
            this.drawLeaf(this.p, leaf, pitch);
          }
        }
      }
      return;
    }

    // 中心線に沿って太さを持った形状を作成
    const leftPoints: Array<{x: number, y: number}> = [];
    const rightPoints: Array<{x: number, y: number}> = [];

    for (let i = 0; i < centerPoints.length; i++) {
      const point = centerPoints[i];

      // 元のセグメント位置を計算（太さの変化のため）
      const heightFromSeed = seedPos.y - point.y;
      const t = heightFromSeed / length;

      // 根元から先端に向かって細くなる
      const widthMultiplier = this.lerp(1.0, 0.3, t);
      const currentWidth = stemWidth * widthMultiplier;

      // 進行方向の角度を計算
      let angle: number;
      if (i < centerPoints.length - 1) {
        const next = centerPoints[i + 1];
        angle = Math.atan2(next.y - point.y, next.x - point.x);
      } else {
        const prev = centerPoints[i - 1];
        angle = Math.atan2(point.y - prev.y, point.x - prev.x);
      }

      // 垂直方向のオフセット
      const perpAngle = angle + Math.PI / 2;
      const offsetX = Math.cos(perpAngle) * currentWidth;
      const offsetY = Math.sin(perpAngle) * currentWidth;

      leftPoints.push({x: point.x + offsetX, y: point.y + offsetY});
      rightPoints.push({x: point.x - offsetX, y: point.y - offsetY});
    }

    // 透明度の計算関数
    const getAlphaMultiplier = (t: number): number => {
      return 1.0;
    };

    // 1. 外側のグロー効果
    const glowStrength = 0.5;

    this.p.blendMode(this.p.ADD);
    const glowLayers = 4; // 8→4に減らして軽量化
    for (let layer = 0; layer < glowLayers; layer++) {
      const layerT = layer / glowLayers;

      for (let i = 0; i < centerPoints.length - 1; i++) {
        const heightFromSeed = seedPos.y - centerPoints[i].y;
        const segmentT = heightFromSeed / length;

        const widthMultiplier = this.lerp(1.0, 0.3, segmentT);
        const currentStemWidth = stemWidth * widthMultiplier;
        const glowWidth = currentStemWidth + layerT * 10;

        const r = this.lerp(80, 10, normalizedPitch);
        const g = this.lerp(220, 100, normalizedPitch);
        const b = this.lerp(180, 60, normalizedPitch);

        const baseAlpha = (1 - layerT * layerT * layerT) * 3 * glowStrength;
        const alphaMultiplier = getAlphaMultiplier(segmentT);

        this.p.stroke(r, g, b, baseAlpha * alphaMultiplier);
        this.p.strokeWeight(glowWidth * 2);
        this.p.line(
          centerPoints[i].x, centerPoints[i].y,
          centerPoints[i + 1].x, centerPoints[i + 1].y
        );
      }
    }

    // 2. 芽の本体
    this.p.blendMode(this.p.BLEND);
    this.p.noStroke();

    const bodyR = this.lerp(70, 20, normalizedPitch);
    const bodyG = this.lerp(200, 120, normalizedPitch);
    const bodyB = this.lerp(160, 80, normalizedPitch);

    for (let i = 0; i < centerPoints.length - 1; i++) {
      const heightFromSeed = seedPos.y - centerPoints[i].y;
      const segmentT = heightFromSeed / length;
      const alphaMultiplier = getAlphaMultiplier(segmentT);

      this.p.fill(bodyR, bodyG, bodyB, 30 * alphaMultiplier);

      this.p.beginShape();
      this.p.vertex(leftPoints[i].x, leftPoints[i].y);
      this.p.vertex(leftPoints[i + 1].x, leftPoints[i + 1].y);
      this.p.vertex(rightPoints[i + 1].x, rightPoints[i + 1].y);
      this.p.vertex(rightPoints[i].x, rightPoints[i].y);
      this.p.endShape(this.p.CLOSE);
    }

    // 3. 輪郭線
    this.p.blendMode(this.p.ADD);
    const edgeLayers = 4;
    for (let layer = 0; layer < edgeLayers; layer++) {
      const layerT = layer / edgeLayers;
      const baseThickness = 0.5 + layerT * 2;

      const r = this.lerp(150, 60, normalizedPitch);
      const g = 255;
      const b = this.lerp(240, 160, normalizedPitch);

      const baseAlpha = (1 - layerT * layerT) * 40;

      this.p.noFill();

      // 左側の輪郭
      for (let i = 0; i < leftPoints.length - 1; i++) {
        const heightFromSeed = seedPos.y - centerPoints[i].y;
        const segmentT = heightFromSeed / length;
        const alphaMultiplier = getAlphaMultiplier(segmentT);

        const widthMultiplier = this.lerp(1.0, 0.3, segmentT);
        const thickness = baseThickness * widthMultiplier;

        this.p.stroke(r, g, b, baseAlpha * alphaMultiplier);
        this.p.strokeWeight(thickness);
        this.p.line(leftPoints[i].x, leftPoints[i].y, leftPoints[i + 1].x, leftPoints[i + 1].y);
      }

      // 右側の輪郭
      for (let i = 0; i < rightPoints.length - 1; i++) {
        const heightFromSeed = seedPos.y - centerPoints[i].y;
        const segmentT = heightFromSeed / length;
        const alphaMultiplier = getAlphaMultiplier(segmentT);

        const widthMultiplier = this.lerp(1.0, 0.3, segmentT);
        const thickness = baseThickness * widthMultiplier;

        this.p.stroke(r, g, b, baseAlpha * alphaMultiplier);
        this.p.strokeWeight(thickness);
        this.p.line(rightPoints[i].x, rightPoints[i].y, rightPoints[i + 1].x, rightPoints[i + 1].y);
      }
    }

    this.p.blendMode(this.p.BLEND);
    this.p.noStroke();

    // 葉を描画（collapseYより下のもののみ）
    if (leaves && leaves.length > 0) {
      for (const leaf of leaves) {
        // 葉のY座標がcollapseYより下なら描画
        if (leaf.y >= collapseY) {
          // 葉の高さを計算
          const leafHeight = seedPos.y - leaf.y;

          // 茎のその位置でのX座標オフセットを計算
          const t = leafHeight / length;
          const swayInfluence = t;
          const swayX = swayAmount * swayInfluence;

          // 音量によるうねりを追加
          let undulationX = 0;
          if (hookStrength < 0.5) {
            const undulationStrength = 1 - hookStrength * 2;
            const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
            const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
            const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
            undulationX = (wave1 + wave2 + wave3) * undulationStrength * t;
          }

          // 葉のX座標を茎の位置に合わせて更新
          leaf.x = seedPos.x + swayX + undulationX;

          // 葉の揺れを更新
          this.updateLeafSway(leaf, pitchChange, time);

          // 葉を描画
          this.drawLeaf(this.p, leaf, pitch);
        }
      }
    }
  }

  /**
   * 花を描画（collapseY制限付き）
   * collapseYより下（Y座標が大きい）の部分のみ描画
   * @param stemHeight 茎の高さ
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param leaves 葉の配列
   * @param bloomProgress 開花進行度（0-1）
   * @param time 現在時刻
   * @param collapseY 崩壊ラインのY座標（これより上は描画しない）
   */
  private drawBloomWithCollapseY(stemHeight: number, volume: number, pitch: number, pitchChange: number, leaves: Leaf[], bloomProgress: number, time: number, collapseY: number): void {
    const seedPos = this.getSeedPosition();

    // 茎の先端の揺れを計算
    const swayAmount = pitchChange * 0.5;
    const swayInfluence = 1.0;
    const stemSwayX = swayAmount * swayInfluence;

    // 音量に応じたうねり
    const volumeFactorForUndulation = volume / 100;
    const undulationAmount = volumeFactorForUndulation * 30;
    const t = 1.0;
    const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
    const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
    const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
    const undulationX = (wave1 + wave2 + wave3) * t;

    // 花の中心位置
    const flowerCenterX = seedPos.x + stemSwayX + undulationX;
    const flowerCenterY = seedPos.y - stemHeight;

    // 花の中心がcollapseYより上なら描画しない
    if (flowerCenterY < collapseY) {
      return;
    }

    // 画面の向きを判定
    const isPortrait = this.p.height > this.p.width;

    // 花のサイズ
    const baseFlowerSize = this.p.height * (isPortrait ? 0.18 : 0.225);

    // 音高に応じたk値
    const k = this.roseCurve.calculateKFromPitch(pitch, 3, 7, 200, 800);

    // 音高に応じた色相
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    // 満開後の色の移り変わり
    let hueShift = 0;
    if (bloomProgress >= 1.0) {
      hueShift = (time / 30000) * 360;
    }

    // 色相の変化範囲を狭めてチカチカを抑える（330-60 → 340-40）
    // スムージングを追加
    this.targetHue = this.lerp(340, 40, normalizedPitch) + hueShift;
    this.previousHue += (this.targetHue - this.previousHue) * 0.1; // スムージング係数0.1
    const baseHue = this.previousHue;

    // 音量に応じた輝き
    const volumeFactor = volume / 100;
    const glowStrength = 0.3 + volumeFactor * 0.7;

    // ガクを描画（collapseYチェック済み）
    this.drawCalyx(this.p, flowerCenterX, flowerCenterY, baseFlowerSize * 0.5, normalizedPitch, bloomProgress);

    // 花びらを3層に分けて描画
    const layers = 3;

    for (let layer = 0; layer < layers; layer++) {
      // 各層の展開タイミング
      const layerStartProgress = layer / layers;
      const layerEndProgress = (layer + 1) / layers;

      // この層の展開進行度
      let layerProgress = 0;
      if (bloomProgress > layerStartProgress) {
        layerProgress = Math.min(1, (bloomProgress - layerStartProgress) / (layerEndProgress - layerStartProgress));
      }

      if (layerProgress <= 0) continue;

      const easedProgress = layerProgress * layerProgress * (3 - 2 * layerProgress);

      // 層のサイズ
      const layerSizeRatio = 0.4 + (layer / (layers - 1)) * 0.7;
      const layerSize = baseFlowerSize * layerSizeRatio * easedProgress;

      const layerK = k + layer * 0.3;
      const depthOffset = (layer - 1) * baseFlowerSize * 0.15 * easedProgress;

      // バラ曲線の点を計算
      const curvePoints = this.roseCurve.calculateCurve(layerSize, layerK, 360);

      // 直交座標に変換
      const cartesianPoints = curvePoints.map((point, index) => {
        const theta = point.theta;

        const petalDelay = index * 0.05;
        const delayedTime = time + petalDelay * 1000;

        const angleFromTop = theta % (2 * Math.PI);
        let radiusMultiplier = 1.0;

        if (angleFromTop > Math.PI) {
          const upwardAngle = angleFromTop - Math.PI;
          const upwardFactor = Math.abs(Math.sin(upwardAngle));
          radiusMultiplier = 0.9 + upwardFactor * 0.27;
        } else {
          const downwardAngle = angleFromTop;
          const downwardFactor = Math.abs(Math.sin(downwardAngle));
          radiusMultiplier = 0.63 - downwardFactor * 0.14;
        }

        const distanceFromCenter = point.r / layerSize;
        const windStrength = volumeFactor * 10 * distanceFromCenter;

        const noiseX = Math.sin(delayedTime / 1200 + index * 0.5) * windStrength;
        const noiseY = Math.cos(delayedTime / 1500 + index * 0.7) * windStrength * 0.2;

        const gustStrength = pitchChange * 0.3 * distanceFromCenter;

        const totalBendX = noiseX + gustStrength;
        const totalBendY = noiseY;

        const adjustedRadius = point.r * radiusMultiplier;

        const baseCartesian = this.roseCurve.polarToCartesian(
          adjustedRadius,
          theta,
          flowerCenterX,
          flowerCenterY + depthOffset
        );

        return {
          x: baseCartesian.x + totalBendX,
          y: baseCartesian.y + totalBendY
        };
      });

      // 層の透明度
      const layerAlpha = 1 - layer * 0.15;

      // 層ごとの色相オフセット
      const layerHueOffset = layer * 15;

      // 1. 外側のグロー効果
      this.p.blendMode(this.p.ADD);
      const glowLayers = 4; // 8→4に減らして軽量化
      for (let glowLayer = 0; glowLayer < glowLayers; glowLayer++) {
        const glowT = glowLayer / glowLayers;
        const glowSize = layerSize * (1 + glowT * 1.2);

        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const glowHue = (baseHue + layerHueOffset) % 360;
        const glowSaturation = 80;
        const glowBrightness = 100;
        
        // RGB値を直接計算（p5.jsの色オブジェクトを使わない）
        const glowRgb = this.hsbToRgb(glowHue, glowSaturation, glowBrightness);
        this.p.colorMode(this.p.RGB, 255);

        const alpha = (1 - glowT * glowT * glowT) * 3 * glowStrength * layerAlpha * easedProgress;

        this.p.noFill();
        this.p.stroke(glowRgb.r, glowRgb.g, glowRgb.b, alpha);
        this.p.strokeWeight(layerSize * 0.2);

        this.p.circle(flowerCenterX, flowerCenterY + depthOffset, glowSize * 2);
      }

      // 2. 花びらの塗りつぶし
      this.p.blendMode(this.p.BLEND);

      const petalCount = cartesianPoints.length;
      for (let i = 0; i < petalCount; i++) {
        const nextI = (i + 1) % petalCount;

        const petalT = i / petalCount;
        const petalHueOffset = petalT * 30;

        const angle = (cartesianPoints[i].x - flowerCenterX) !== 0
          ? Math.atan2(cartesianPoints[i].y - (flowerCenterY + depthOffset), cartesianPoints[i].x - flowerCenterX)
          : 0;
        const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);

        let depthBrightness = 0;
        if (normalizedAngle < Math.PI) {
          depthBrightness = 15 * Math.sin(normalizedAngle);
        } else {
          depthBrightness = -15 * Math.sin(normalizedAngle - Math.PI);
        }

        const petalHue = (baseHue + layerHueOffset + petalHueOffset) % 360;
        const petalSaturation = 70 - layer * 5;
        const baseBrightness = 90 - layer * 10;
        const petalBrightness = Math.max(30, Math.min(100, baseBrightness + depthBrightness));
        
        // RGB値を直接計算（p5.jsの色オブジェクトを使わない）
        const rgb = this.hsbToRgb(petalHue, petalSaturation, petalBrightness);

        this.p.fill(rgb.r, rgb.g, rgb.b, 35 * layerAlpha * easedProgress);
        this.p.noStroke();
        this.p.beginShape();
        this.p.vertex(flowerCenterX, flowerCenterY + depthOffset);
        this.p.vertex(cartesianPoints[i].x, cartesianPoints[i].y);
        this.p.vertex(cartesianPoints[nextI].x, cartesianPoints[nextI].y);
        this.p.endShape(this.p.CLOSE);
      }

      // 3. 花びらの輪郭線
      this.p.blendMode(this.p.ADD);
      const edgeLayers = 4;
      for (let edgeLayer = 0; edgeLayer < edgeLayers; edgeLayer++) {
        const edgeT = edgeLayer / edgeLayers;
        const thickness = 0.5 + edgeT * 2;

        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const edgeHue = (baseHue + layerHueOffset) % 360;
        const edgeSaturation = 60;
        const edgeBrightness = 100;
        
        // RGB値を直接計算（p5.jsの色オブジェクトを使わない）
        const edgeRgb = this.hsbToRgb(edgeHue, edgeSaturation, edgeBrightness);
        this.p.colorMode(this.p.RGB, 255);

        const alpha = (1 - edgeT * edgeT) * 50 * glowStrength * layerAlpha * easedProgress;

        this.p.stroke(edgeRgb.r, edgeRgb.g, edgeRgb.b, alpha);
        this.p.strokeWeight(thickness);
        this.p.noFill();

        this.p.beginShape();
        for (const point of cartesianPoints) {
          this.p.vertex(point.x, point.y);
        }
        this.p.endShape(this.p.CLOSE);
      }
    }

    // 4. 花の中心
    this.p.blendMode(this.p.ADD);
    const centerLayers = 8;
    for (let layer = 0; layer < centerLayers; layer++) {
      const centerT = layer / centerLayers;
      const centerSize = baseFlowerSize * 0.15 * (1 + centerT) * bloomProgress;

      this.p.colorMode(this.p.HSB, 360, 100, 100);
      const centerHue = (baseHue + 30) % 360;
      const centerSaturation = this.lerp(20, 60, centerT);
      const centerBrightness = 100;
      const centerColor = this.p.color(centerHue, centerSaturation, centerBrightness);

      // RGB値を即座に抽出（メモリリーク回避）
      const centerR = this.p.red(centerColor);
      const centerG = this.p.green(centerColor);
      const centerB = this.p.blue(centerColor);
      this.p.colorMode(this.p.RGB, 255);

      const alpha = (1 - centerT * centerT) * 30 * glowStrength * bloomProgress;

      this.p.fill(centerR, centerG, centerB, alpha);
      this.p.noStroke();
      this.p.circle(flowerCenterX, flowerCenterY, centerSize * 2);
    }

    this.p.blendMode(this.p.BLEND);
  }

  /**
   * メインの描画メソッド
   */
  public render(state: GrowthState, params: RenderParameters, time: number = this.p.millis()): void {
    // レイヤーを初期化
    this.ensureLayers();

    // 背景を描画（メインキャンバスに直接）
    this.drawBackground();

    // 波紋を描画（背景の上、他の要素の下、メインキャンバスに直接）
    if (params.ripples && params.ripples.length > 0) {
      const rippleAlphaMultiplier = params.rippleAlphaMultiplier !== undefined ? params.rippleAlphaMultiplier : 1.0;
      this.drawRipples(params.ripples, rippleAlphaMultiplier);
    }

    // bodyLayerをクリア
    if (this.bodyLayer) {
      this.bodyLayer.clear();
    }

    // 状態に応じた描画
    switch (state) {
      case GrowthState.SEED:
        // 種子はメインキャンバスに直接描画（レイヤー分けしない）
        // seedAlphaを使用して透明度を制御
        const seedAlpha = params.seedAlpha !== undefined ? params.seedAlpha : 1;
        this.drawSeed(this.p, time, params.volume, this.previousVolume, seedAlpha);
        this.previousVolume = params.volume;
        break;
      case GrowthState.SPROUT:
        // 種子をフェードアウトしながら描画（progress 0-0.3で消える）
        const seedFadeOut = Math.max(0, 1 - params.progress / 0.3);
        // 種子はメインキャンバスに直接描画（レイヤー分けしない）
        this.drawSeed(this.p, time, params.volume, this.previousVolume, seedFadeOut);
        this.previousVolume = params.volume;

        // 茎と葉はbodyLayerに描画
        if (this.bodyLayer) {
          this.drawSprout(this.bodyLayer, params.progress, params.volume, params.pitch, params.pitchChange, params.reduceGlow, params.stemHeight, params.leaves, time, params.witherAmount || 0);
        }
        break;
      case GrowthState.BLOOM:
        // 茎と葉を描画
        if (this.bodyLayer) {
          this.drawSprout(this.bodyLayer, 1.0, params.volume, params.pitch, params.pitchChange, false, params.stemHeight, params.leaves, time, params.witherAmount || 0);
        }

        // 花を描画
        if (this.bodyLayer) {
          this.drawBloom(this.bodyLayer, params.stemHeight, params.volume, params.pitch, params.pitchChange, params.leaves, params.growthProgress, time);
        }

        // アンビエントグロー（メインキャンバスに直接）
        this.drawAmbientGlow(params.stemHeight, params.volume, params.pitch, params.pitchChange, params.growthProgress);

        // 開花完了時にキャッシュを作成（1回のみ）
        if (params.growthProgress >= 1.0 && !this.cachedFlowerImage && this.bodyLayer) {
          this.cachedFlowerImage = this.bodyLayer.get();
        }
        break;
      case GrowthState.SCATTER:
        // SCATTER状態：毎フレーム花を描画してからワイプ消去 + パーティクル生成
        if (params.wipeProgress !== undefined && this.bodyLayer) {
          const scatterProgress = params.wipeProgress;

          // ワイプ完了前は毎フレーム花を描画（アニメーション継続）
          if (scatterProgress < 1.0) {
            // 毎フレーム花を描画
            this.drawSprout(this.bodyLayer, 1.0, params.volume, params.pitch, params.pitchChange, false, params.stemHeight, params.leaves, time, params.witherAmount || 0);
            this.drawBloom(this.bodyLayer, params.stemHeight, params.volume, params.pitch, params.pitchChange, params.leaves, 1.0, time);

            // アンビエントグロー（徐々に消す）
            const glowAlpha = Math.max(0, 1.0 - scatterProgress);
            this.drawAmbientGlow(params.stemHeight, params.volume, params.pitch, params.pitchChange, 1.0, glowAlpha);
          }

          const seedPos = this.getSeedPosition();

          // 種子を描画（収束開始後、徐々に現れる）
          if (params.seedAlpha !== undefined && params.seedAlpha > 0) {
            this.drawSeed(this.p, time, params.volume, this.previousVolume, params.seedAlpha);
          }

          // 崩壊範囲：画面上部から地面まで（全体を崩壊させる）
          const topY = 0;
          const groundY = this.bodyLayer.height;

          // ワイプラインのY座標（画面上部から下へ）
          const wipeY = topY + (groundY - topY) * scatterProgress;

          // ノイズパラメータ（音量に応じて変化）
          const volumeFactor = params.volume / 100;
          const noiseScale = 0.01;
          const noiseAmplitude = 15 + volumeFactor * 30; // 15-45（音量が大きいほどボロボロに崩れる）

          // ワイプ消去とパーティクル生成を同時に処理（1ミリのズレもなし）
          if (scatterProgress < 1.0 && params.particles) {
            const maxParticles = 300; // パーティクル数削減（400→300）
            const samplingInterval = 20; // サンプリング間隔拡大（15→20）

            // パーティクル数が上限に達している場合は生成をスキップ
            const canGenerateParticles = params.particles.length < maxParticles;

            // ワイプラインに沿ってピクセルをサンプリング＆消去
            this.bodyLayer.push();
            this.bodyLayer.erase(255, 255);
            this.bodyLayer.noStroke();
            this.bodyLayer.fill(255);
            this.bodyLayer.beginShape();

            for (let x = 0; x <= this.bodyLayer.width; x += 5) {
              const noiseValue = this.p.noise(x * noiseScale, time * 0.001);
              const offsetY = (noiseValue - 0.5) * noiseAmplitude;
              const currentWipeY = wipeY + offsetY;

              this.bodyLayer.vertex(x, currentWipeY);

              // パーティクル生成（ワイプラインと完全同期）- 上限チェック
              if (canGenerateParticles && x % samplingInterval === 0 && params.particles.length < maxParticles) {
                // ワイプライン上のピクセルの色を取得
                const pixelY = Math.floor(currentWipeY);
                if (pixelY >= 0 && pixelY < this.bodyLayer.height) {
                  const pixel = this.bodyLayer.get(x, pixelY);

                  // 透明でないピクセルの場合、パーティクルを生成
                  if (pixel[3] > 10) {
                    // パーティクル生成確率（密度調整）
                    const currentRatio = params.particles.length / maxParticles;
                    const probability = 0.15 * (1 - currentRatio);

                    if (Math.random() < probability) {
                      // 粒子サイズをランダム化
                      let size: number;
                      const sizeRand = Math.random();
                      if (sizeRand < 0.3) {
                        size = 2.0 + Math.random() * 2.0; // 大粒子（30%）
                      } else if (sizeRand < 0.8) {
                        size = 1.0 + Math.random() * 1.0; // 中粒子（50%）
                      } else {
                        size = 0.5 + Math.random() * 0.5; // 小粒子（20%）
                      }

                      // 【音量】→ 崩壊のスピード（初速度の大きさ）
                      const volumeFactor = params.volume / 100;

                      // 下向きの基本速度（音量が大きいほど速く崩れる）
                      const baseVy = (1.0 + volumeFactor * 3.0) + Math.random() * 2.0; // 1.0-6.0の下向き速度

                      // 横方向のランダムな動き（音量が大きいほど激しく）
                      const baseVx = (Math.random() - 0.5) * (2.0 + volumeFactor * 4.0); // 音量で-1 to 1 → -3 to 3

                      params.particles.push({
                        x,
                        y: pixelY,
                        vx: baseVx,
                        vy: baseVy,
                        color: `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`,
                        alpha: 0.9 + Math.random() * 0.1, // 初期透明度を高く（軌跡用）
                        size: size,
                        targetX: seedPos.x,
                        targetY: seedPos.y,
                        life: 1.0,
                        maxLife: 3 + Math.random() * 2,
                        birthTime: time,
                        isScatter: true // SCATTER状態のパーティクルとしてマーク
                      });
                    }
                  }
                }
              }
            }

            // 上部を閉じる
            this.bodyLayer.vertex(this.bodyLayer.width, 0);
            this.bodyLayer.vertex(0, 0);
            this.bodyLayer.endShape(this.p.CLOSE);

            this.bodyLayer.noErase();
            this.bodyLayer.pop();
          }

          // パーティクルを更新（SCATTER状態のパーティクルのみ種子に収束）
          for (const particle of params.particles) {
            if (particle.isScatter) {
              // SCATTER状態のパーティクル：重力で落下 → 地面に到達 → 種子に向かって収束
              const dx = seedPos.x - particle.x;
              const dy = seedPos.y - particle.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // 地面に到達したかチェック（種子のY座標付近、判定を緩和）
              const isOnGround = particle.y >= seedPos.y - 100; // 判定範囲をさらに拡大（-50→-100）

              // 画面上部に溜まっているかチェック（上部20%のエリア）
              const isAtTop = this.bodyLayer && particle.y < this.bodyLayer.height * 0.2;

              // パーティクルの年齢（秒）
              const particleAge = (time - particle.birthTime) / 1000;

              // 画面外に出たかチェック
              const isOutOfBounds = particle.y < -100 || particle.y > this.bodyLayer!.height + 100 ||
                                    particle.x < -100 || particle.x > this.bodyLayer!.width + 100;
              
              // 画面外に出たパーティクルを画面内に戻す（バウンド）
              if (isOutOfBounds) {
                // 画面の境界内に制限
                particle.x = Math.max(0, Math.min(this.bodyLayer!.width, particle.x));
                particle.y = Math.max(0, Math.min(this.bodyLayer!.height, particle.y));
                
                // 速度を反転して跳ね返る
                if (particle.x <= 0 || particle.x >= this.bodyLayer!.width) {
                  particle.vx *= -0.5;
                }
                if (particle.y <= 0 || particle.y >= this.bodyLayer!.height) {
                  particle.vy *= -0.5;
                }
              }
              
              const shouldConverge = isOnGround || distance < 150 || isOutOfBounds || particleAge > 3 || isAtTop; // 上部に溜まったら収束

              if (shouldConverge) {
                // 地面に到達または種子に近い：種子に向かって収束
                if (distance > 20) { // 到達判定距離を15→20に拡大
                  // 種子に向かう方向
                  const dirX = dx / distance;
                  const dirY = dy / distance;

                  // 強い加速度で確実に種子に向かう
                  const acceleration = Math.max(1.0, 15 / (distance + 1));

                  particle.vx += dirX * acceleration;
                  particle.vy += dirY * acceleration;

                  // 速度制限を緩和
                  const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
                  const maxSpeed = 20; // 速度制限を緩和
                  if (speed > maxSpeed) {
                    particle.vx = (particle.vx / speed) * maxSpeed;
                    particle.vy = (particle.vy / speed) * maxSpeed;
                  }

                  // 減衰を弱める
                  particle.vx *= 0.98;
                  particle.vy *= 0.98;

                  particle.x += particle.vx;
                  particle.y += particle.vy;

                  // 透明度は維持（消えない）
                  particle.alpha = Math.min(1.0, particle.alpha + 0.01);
                } else {
                  // 種子に到達したら消滅
                  particle.alpha = 0;
                }
              } else {
                // 空中：【ピッチ】→ 砂の舞う方向（上昇 or 下降）

                // ピッチを正規化（200-800Hzを0-1に）
                const normalizedPitch = this.constrain((params.pitch - 200) / 600, 0, 1);

                // ピッチによる垂直方向の力（強化版）
                // 低い声（0）：重力が強く働く（下に沈む）
                // 高い声（1）：強い上向きの力が働く（舞い上がる）
                const pitchForceY = (normalizedPitch - 0.5) * 0.8; // -0.4（下） to +0.4（上）に強化

                // 基本重力（常に下向き）
                const baseGravity = 0.15;

                // 最終的な垂直方向の力（重力 - ピッチによる上昇力）
                particle.vy += baseGravity - pitchForceY;

                // 横方向の揺らぎ（ピッチで変化、強化版）
                // 高い声：軽やかに大きく横に揺れる
                // 低い声：あまり揺れない
                const horizontalSway = normalizedPitch * (Math.random() - 0.5) * 0.6; // 0.3→0.6に強化
                particle.vx += horizontalSway;

                // 空気抵抗（ピッチで変化）
                // 高い声：抵抗が大きい（ふわふわ）
                // 低い声：抵抗が小さい（ストンと落ちる）
                const airResistance = 0.96 + normalizedPitch * 0.03; // 0.96-0.99
                particle.vx *= airResistance;
                particle.vy *= airResistance;

                particle.x += particle.vx;
                particle.y += particle.vy;

                // 画面端に近づいたら速度を減衰させる（柔らかい制限）
                if (this.bodyLayer) {
                  const margin = 50; // 減衰開始位置
                  const dampingStrength = 0.9; // 減衰率
                  
                  // 左右の端
                  if (particle.x < margin) {
                    const factor = particle.x / margin;
                    particle.vx *= factor * dampingStrength;
                  } else if (particle.x > this.bodyLayer.width - margin) {
                    const factor = (this.bodyLayer.width - particle.x) / margin;
                    particle.vx *= factor * dampingStrength;
                  }
                  
                  // 上下の端
                  if (particle.y < margin) {
                    const factor = particle.y / margin;
                    particle.vy *= factor * dampingStrength;
                  } else if (particle.y > this.bodyLayer.height - margin) {
                    const factor = (this.bodyLayer.height - particle.y) / margin;
                    particle.vy *= factor * dampingStrength;
                  }
                }

                // 透明度減少
                particle.alpha -= 0.002;
              }
            }
          }

          // 透明度が0以下のパーティクルを削除（画面外チェックは削除）
          if (this.bodyLayer) {
            const validParticles = params.particles.filter(p => p.alpha > 0);

            // 配列を完全にクリアしてから再構築
            params.particles.splice(0, params.particles.length, ...validParticles);
          }
        }
        break;
    }

    // bodyLayerからglowLayerを生成（最適化版、4フレームに1回更新）
    this.frameCount++;
    if (this.bodyLayer && this.glowLayer && this.frameCount % 4 === 0) {
      this.glowLayer.clear();
      this.applyBlurOptimized(this.bodyLayer, this.glowLayer, 10); // 最適化版を使用
    }

    // glowLayerを加算合成で描画（透明度を上げて輝きを増やす）
    if (this.glowLayer) {
      this.p.push();
      this.p.blendMode(this.p.ADD);
      this.p.tint(255, 80); // 透明度31%に設定（40→80に上げて輝きを増やす）
      this.p.image(this.glowLayer, 0, 0);
      this.p.noTint();
      this.p.blendMode(this.p.BLEND);
      this.p.pop();
    }

    // bodyLayerを通常合成で描画
    if (this.bodyLayer) {
      this.p.image(this.bodyLayer, 0, 0);
    }

    // パーティクルを描画（メインキャンバスに直接）
    if (params.particles && params.particles.length > 0) {
      this.drawParticles(params.particles);
    }
  }

  /**
   * 種子の位置を取得
   * 画面中央下（高さの85%位置）
   */
  public getSeedPosition(): Point {
    return {
      x: this.p.width / 2,
      y: this.p.height * 0.85
    };
  }

  /**
   * アンビエントグロー（花の光が空間を照らす）
   * @param stemHeight 茎の高さ
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param bloomProgress 開花の進行度（0-1）
   * @param alphaMultiplier 透明度係数（0-1、デフォルトは1.0）
   */
  private drawAmbientGlow(stemHeight: number, volume: number, pitch: number, pitchChange: number, bloomProgress: number, alphaMultiplier: number = 1.0): void {
    const seedPos = this.getSeedPosition();

    // 茎の先端の揺れを計算
    const swayAmount = pitchChange * 0.5;
    const volumeFactorForUndulation = volume / 100;
    const undulationAmount = volumeFactorForUndulation * 30;
    const t = 1.0;
    const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
    const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
    const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
    const undulationX = (wave1 + wave2 + wave3) * t;

    const flowerCenterX = seedPos.x + swayAmount + undulationX;
    const flowerCenterY = seedPos.y - stemHeight;

    // 音量に応じた明るさと範囲（控えめに）
    const volumeFactor = volume / 100;
    const glowIntensity = bloomProgress * volumeFactor * 0.5; // 0.5倍に減らす

    // 音高に応じた色
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);

    this.p.push();
    this.p.blendMode(this.p.ADD);
    this.p.noStroke();

    // 複数の円を重ねて柔らかいグローを作る（層を減らす）
    const layers = 10; // 15→10に減らす
    for (let i = 0; i < layers; i++) {
      const layerT = i / layers;

      // 範囲（音量が大きいほど広がる、少し小さく）
      const baseRadius = this.p.height * 0.25; // 0.3→0.25に減らす
      const maxRadius = this.p.height * 0.6; // 0.8→0.6に減らす
      const radius = this.lerp(baseRadius, maxRadius, volumeFactor) * (1 + layerT * 1.5); // 2→1.5に減らす

      // 色（ピンク〜オレンジ〜黄色）
      const r = Math.floor(this.lerp(255, 200, normalizedPitch));
      const g = Math.floor(this.lerp(180, 220, normalizedPitch));
      const b = Math.floor(this.lerp(200, 100, normalizedPitch));

      // 透明度（中心が明るく、外側に向かって減衰、控えめに）
      const alpha = glowIntensity * (1 - layerT * layerT * layerT) * 5 * alphaMultiplier; // alphaMultiplierを適用

      this.p.fill(r, g, b, alpha);
      this.p.circle(flowerCenterX, flowerCenterY, radius * 2);
    }

    this.p.blendMode(this.p.BLEND);
    this.p.pop();
  }

  /**
   * Canvasの幅を取得
   */
  public getWidth(): number {
    return this.p.width;
  }

  /**
   * Canvasの高さを取得
   */
  public getHeight(): number {
    return this.p.height;
  }

  /**
   * パーティクルを生成
   * @param x 生成位置X
   * @param y 生成位置Y
   * @param count 生成数
   * @param pitch 音高（Hz）- 色に影響
   * @param volume 音量（0-100）- 速度に影響
   * @param time 現在時刻（ミリ秒）
   * @returns 生成されたパーティクルの配列
   */
  public generateParticles(x: number, y: number, count: number, pitch: number, volume: number, time: number): Particle[] {
    const particles: Particle[] = [];
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);
    const volumeFactor = volume / 100;

    for (let i = 0; i < count; i++) {
      // ランダムな方向
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.0 + Math.random() * 2.5) * volumeFactor * 2; // より速く

      // 音高に応じた色（より明るく、白っぽく）
      const r = Math.floor(this.lerp(255, 255, normalizedPitch)); // 常に明るく
      const g = Math.floor(this.lerp(220, 255, normalizedPitch)); // より明るく
      const b = Math.floor(this.lerp(200, 150, normalizedPitch));

      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.0, // より上向きに
        color: `rgb(${r}, ${g}, ${b})`,
        alpha: 1.0,
        size: 1 + Math.random() * 2, // より細かく（1-3px）
        targetX: x,
        targetY: y,
        life: 1.0,
        maxLife: 2.0 + Math.random() * 1.5, // より長く（2-3.5秒）
        birthTime: time
      });
    }

    return particles;
  }

  /**
   * パーティクルを更新
   * @param particles パーティクルの配列
   * @param time 現在時刻（ミリ秒）
   * @param deltaTime フレーム間の時間（秒）
   */
  public updateParticles(particles: Particle[], time: number, deltaTime: number): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // 寿命を減らす
      const age = (time - p.birthTime) / 1000; // 秒
      p.life = 1 - (age / p.maxLife);

      // 寿命が尽きたら削除
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      // 位置を更新
      p.x += p.vx;
      p.y += p.vy;

      // 画面境界チェック：画面外に出たパーティクルを削除
      const margin = 50; // 画面外50pxまで許容
      if (p.x < -margin || p.x > this.p.width + margin ||
          p.y < -margin || p.y > this.p.height + margin) {
        particles.splice(i, 1);
        continue;
      }

      // 重力と空気抵抗
      p.vy += 0.05; // 重力
      p.vx *= 0.98; // 空気抵抗
      p.vy *= 0.98;

      // 透明度を寿命に応じて減少
      p.alpha = p.life;
    }
  }

  /**
   * パーティクルを描画
   * @param particles パーティクルの配列
   */
  public drawParticles(particles: Particle[]): void {
    // パーティクルの数を制限（最大1000個）
    const maxParticles = 1000;
    const particlesToDraw = particles.length > maxParticles
      ? particles.slice(0, maxParticles)
      : particles;

    this.p.push();
    this.p.blendMode(this.p.ADD); // 加算合成で軌跡効果

    for (const particle of particlesToDraw) {
      // パーティクルの検証
      if (!particle || typeof particle.x !== 'number' || typeof particle.y !== 'number' ||
          typeof particle.alpha !== 'number' || typeof particle.size !== 'number' ||
          !particle.color) {
        continue; // 不正なパーティクルをスキップ
      }

      // 色をRGB値に分解
      const colorMatch = particle.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!colorMatch) continue;

      const r = parseInt(colorMatch[1]);
      const g = parseInt(colorMatch[2]);
      const b = parseInt(colorMatch[3]);

      // グロー効果（軌跡を強調）- 10%削減
      for (let layer = 0; layer < 2; layer++) {
        const layerT = layer / 2;
        const glowSize = particle.size * (1 + layerT * 3); // 軌跡を長く
        const glowAlpha = particle.alpha * (1 - layerT * layerT) * 27; // 30→27（10%削減）

        this.p.noStroke();
        this.p.fill(r, g, b, glowAlpha);
        this.p.circle(particle.x, particle.y, glowSize * 2);
      }

      // 本体（明るく）- 10%削減
      this.p.fill(r, g, b, particle.alpha * 90); // 100→90（10%削減）
      this.p.circle(particle.x, particle.y, particle.size * 2);

      // 中心の白い輝き - 10%削減
      this.p.fill(255, 255, 255, particle.alpha * 108); // 120→108（10%削減）
      this.p.circle(particle.x, particle.y, particle.size * 0.4);
    }

    this.p.blendMode(this.p.BLEND);
    this.p.pop();
  }

  /**
   * 波紋を生成
   * @param x 中心X座標
   * @param y 中心Y座標
   * @param volume 音量（0-100）- 波紋の大きさに影響
   * @param time 現在時刻（ミリ秒）
   * @returns 生成された波紋
   */
  public generateRipple(x: number, y: number, volume: number, time: number): Ripple {
    const volumeFactor = volume / 100;
    const maxRadius = this.p.height * 0.3 * (0.5 + volumeFactor * 0.5); // 音量で大きさが変わる
    const duration = 2000 + volumeFactor * 1000; // 2-3秒

    return {
      x: x,
      y: y,
      radius: 0,
      maxRadius: maxRadius,
      alpha: 1.0,
      birthTime: time,
      duration: duration
    };
  }

  /**
   * 波紋を更新
   * @param ripples 波紋の配列
   * @param time 現在時刻（ミリ秒）
   */
  public updateRipples(ripples: Ripple[], time: number): void {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      const age = time - ripple.birthTime;
      const progress = age / ripple.duration;

      if (progress >= 1.0) {
        // 寿命が尽きたら削除
        ripples.splice(i, 1);
        continue;
      }

      // 半径を拡大（イージング付き）
      const easedProgress = progress * progress * (3 - 2 * progress); // smoothstep
      ripple.radius = ripple.maxRadius * easedProgress;

      // 透明度を減少
      ripple.alpha = 1.0 - progress;
    }
  }

  /**
   * 波紋を描画（パースペクティブ効果付き）
   * @param ripples 波紋の配列
   */
  /**
   * 波紋を描画
   * @param ripples 波紋の配列
   * @param alphaMultiplier 透明度係数（0-1、デフォルトは1.0）
   */
  public drawRipples(ripples: Ripple[], alphaMultiplier: number = 1.0): void {
    this.p.push();
    this.p.blendMode(this.p.ADD);
    this.p.noFill();

    for (const ripple of ripples) {
      // 複数の楕円を重ねて柔らかい波紋を作る（奥行き方向に広がる）
      const layers = 3;
      for (let layer = 0; layer < layers; layer++) {
        const layerT = layer / layers;
        const layerRadius = ripple.radius + layerT * 20; // 各層を少しずつ大きく
        const layerAlpha = ripple.alpha * (1 - layerT * 0.5) * 30 * alphaMultiplier; // 外側ほど薄く、透明度係数を適用

        // 緑がかった白色
        this.p.stroke(200, 255, 220, layerAlpha);
        this.p.strokeWeight(3 - layerT * 2); // 外側ほど細く

        // 楕円で奥行き方向の広がりを表現（Y軸を圧縮）
        const radiusX = layerRadius * 2; // 横幅（左右）
        const radiusY = layerRadius * 2 * 0.4; // 縦幅（奥行き）を40%に圧縮

        // 広がるにつれて少し上にオフセット（遠近感を強調）
        const yOffset = -layerRadius * 0.15;

        this.p.ellipse(ripple.x, ripple.y + yOffset, radiusX, radiusY);
      }
    }

    this.p.blendMode(this.p.BLEND);
    this.p.pop();
  }
  /**
   * 散る状態を描画（光の粒子として飛散、声に反応）
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param particles パーティクルの配列
   * @param time 現在時刻（ミリ秒）
   */
  private drawScatter(volume: number, pitch: number, pitchChange: number, particles: Particle[], time: number): void {
    // 声に応じた風の力
    const volumeFactor = volume / 100;
    const windForceX = pitchChange * 0.3; // 音高変化で横方向の風
    const windForceY = -volumeFactor * 2; // 音量で上向きの風（大きいほど上昇）

    // パーティクルを更新（声に反応して動く）
    for (const particle of particles) {
      // 風の力を速度に加算
      particle.vx += windForceX * 0.1;
      particle.vy += windForceY * 0.1;

      // 空気抵抗
      particle.vx *= 0.98;
      particle.vy *= 0.98;

      // 重力（弱め）
      particle.vy += 0.02;

      // 位置更新
      particle.x += particle.vx;
      particle.y += particle.vy;

      // 寿命を減らす
      const age = (time - particle.birthTime) / 1000;
      particle.life = 1 - (age / particle.maxLife);
      particle.alpha = particle.life;
    }

    // パーティクルを描画（光の粒子として）
    this.drawParticles(particles);

    // 寿命が尽きたパーティクルを削除
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  /**
   * 散る状態の花を描画（輪郭が崩れていく）
   * @param stemHeight 茎の高さ
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param leaves 葉の配列
   * @param scatterAge 散る状態の経過時間（秒）
   * @param time 現在時刻（ミリ秒）
   * @param particles パーティクルの配列（輪郭から生成）
   */
  private drawScatteringBloom(stemHeight: number, volume: number, pitch: number, pitchChange: number, leaves: Leaf[], scatterAge: number, time: number, particles: Particle[]): void {
    const seedPos = this.getSeedPosition();

    // 茎の先端の揺れを計算（茎と完全に同じロジック）
    const swayAmount = pitchChange * 0.5;
    const swayInfluence = 1.0;
    const stemSwayX = swayAmount * swayInfluence;

    // 音量に応じたうねり
    const volumeFactorForUndulation = volume / 100;
    const undulationAmount = volumeFactorForUndulation * 30;
    const t = 1.0;
    const wave1 = Math.sin(t * Math.PI * 2) * undulationAmount * 0.6;
    const wave2 = Math.sin(t * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
    const wave3 = Math.sin(t * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
    const undulationX = (wave1 + wave2 + wave3) * t;

    // 花の中心位置
    const flowerCenterX = seedPos.x + stemSwayX + undulationX;
    const flowerCenterY = seedPos.y - stemHeight;

    // 画面の向きを判定
    const isPortrait = this.p.height > this.p.width;

    // 花のサイズ
    const baseFlowerSize = this.p.height * (isPortrait ? 0.18 : 0.225);

    // 音高に応じたk値
    const k = this.roseCurve.calculateKFromPitch(pitch, 3, 7, 200, 800);

    // 音高に応じた色相
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);
    // 色相の変化範囲を狭めてチカチカを抑える（330-60 → 340-40）
    const baseHue = this.lerp(340, 40, normalizedPitch);

    // 音量に応じた輝き
    const volumeFactor = volume / 100;
    const glowStrength = 0.3 + volumeFactor * 0.7;

    // 散る進行度（声の大きさに応じて速度が変わる）
    // 大きい声: 速く散る、小さい声: ゆっくり砂のように崩れる
    const scatterSpeed = 0.5 + volumeFactor * 1.5; // 0.5-2.0倍速
    const effectiveScatterAge = scatterAge * scatterSpeed;

    // 崩れる進行度（0-1、外側から内側へ）
    const crumbleProgress = Math.min(1, effectiveScatterAge / 15); // 15秒基準で完全に崩れる

    // ガクを描画（最後まで残る）
    this.drawCalyx(this.p, flowerCenterX, flowerCenterY, baseFlowerSize * 0.5, normalizedPitch, 1.0);

    // 花びらを3層に分けて描画（外側から崩れていく）
    const layers = 3;

    for (let layer = 0; layer < layers; layer++) {
      // 外側の層から崩れる（layer 2 → 1 → 0）
      const layerCrumbleStart = (2 - layer) / 3; // 外層:0, 中層:0.33, 内層:0.67
      const layerCrumbleEnd = (3 - layer) / 3; // 外層:0.33, 中層:0.67, 内層:1.0

      // この層の崩れ進行度（0-1）
      let layerCrumbleProgress = 0;
      if (crumbleProgress > layerCrumbleStart) {
        layerCrumbleProgress = Math.min(1, (crumbleProgress - layerCrumbleStart) / (layerCrumbleEnd - layerCrumbleStart));
      }

      // 層が完全に崩れたらスキップ
      if (layerCrumbleProgress >= 1) continue;

      // 層のサイズ
      const layerSizeRatio = 0.4 + (layer / (layers - 1)) * 0.7;
      const layerSize = baseFlowerSize * layerSizeRatio;

      // 層ごとのk値
      const layerK = k + layer * 0.3;

      // 蓮のような立体感
      const depthOffset = (layer - 1) * baseFlowerSize * 0.15;

      // バラ曲線の点を計算
      const curvePoints = this.roseCurve.calculateCurve(layerSize, layerK, 360);

      // 直交座標に変換
      const cartesianPoints = curvePoints.map((point, index) => {
        const theta = point.theta;

        // 花びらごとのディレイ
        const petalDelay = index * 0.05;
        const delayedTime = time + petalDelay * 1000;

        // 角度に応じて半径を調整
        const angleFromTop = theta % (2 * Math.PI);
        let radiusMultiplier = 1.0;

        if (angleFromTop > Math.PI) {
          const upwardAngle = angleFromTop - Math.PI;
          const upwardFactor = Math.abs(Math.sin(upwardAngle));
          radiusMultiplier = 0.9 + upwardFactor * 0.27;
        } else {
          const downwardAngle = angleFromTop;
          const downwardFactor = Math.abs(Math.sin(downwardAngle));
          radiusMultiplier = 0.63 - downwardFactor * 0.14;
        }

        // 花びらのたわみ
        const distanceFromCenter = point.r / layerSize;
        const windStrength = volumeFactor * 10 * distanceFromCenter;

        const noiseX = Math.sin(delayedTime / 1200 + index * 0.5) * windStrength;
        const noiseY = Math.cos(delayedTime / 1500 + index * 0.7) * windStrength * 0.2;

        const gustStrength = pitchChange * 0.3 * distanceFromCenter;

        const totalBendX = noiseX + gustStrength;
        const totalBendY = noiseY;

        const adjustedRadius = point.r * radiusMultiplier;

        const baseCartesian = this.roseCurve.polarToCartesian(
          adjustedRadius,
          theta,
          flowerCenterX,
          flowerCenterY + depthOffset
        );

        return {
          x: baseCartesian.x + totalBendX,
          y: baseCartesian.y + totalBendY,
          r: adjustedRadius,
          theta: theta
        };
      });

      // 輪郭からパーティクルを生成（崩れる部分から）
      // 外側から内側へ崩れる
      const crumbleRadius = layerSize * (1 - layerCrumbleProgress); // 崩れていない部分の半径

      // 境界付近からパーティクルを生成（声が大きいほど多く生成）
      const particleGenRate = 0.05 + volumeFactor * 0.25; // 5-30%の確率（少し控えめに）
      if (Math.random() < particleGenRate) {
        // 境界付近の点を探す（crumbleRadius ± 10%の範囲）
        const edgeFadeWidth = layerSize * 0.15;
        const edgePoints = cartesianPoints.filter(p =>
          p.r > crumbleRadius - edgeFadeWidth && p.r <= crumbleRadius + edgeFadeWidth
        );

        if (edgePoints.length > 0) {
          // 境界付近のランダムな点からパーティクルを生成
          const randomIndex = Math.floor(Math.random() * edgePoints.length);
          const edgePoint = edgePoints[randomIndex];

          // パーティクルを1-2個生成（控えめに）
          const particleCount = Math.floor(1 + Math.random() * 1.5);
          const newParticles = this.generateParticles(
            edgePoint.x,
            edgePoint.y,
            particleCount,
            pitch,
            volume,
            time
          );
          particles.push(...newParticles);
        }
      }

      // 層の透明度（崩れるにつれて薄くなる）
      const layerAlpha = (1 - layer * 0.15) * (1 - layerCrumbleProgress * 0.5);

      // 層ごとの色相オフセット
      const layerHueOffset = layer * 15;

      // 1. 外側のグロー効果（崩れていない部分のみ）
      this.p.blendMode(this.p.ADD);
      const glowLayers = 4; // 8→4に減らして軽量化
      for (let glowLayer = 0; glowLayer < glowLayers; glowLayer++) {
        const glowT = glowLayer / glowLayers;
        const glowSize = crumbleRadius * (1 + glowT * 1.2); // 崩れていない部分のサイズ

        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const glowHue = (baseHue + layerHueOffset) % 360;
        const glowSaturation = 80;
        const glowBrightness = 100;
        const glowColor = this.p.color(glowHue, glowSaturation, glowBrightness);
        
        // RGB値を即座に抽出（メモリリーク回避）
        const glowR = this.p.red(glowColor);
        const glowG = this.p.green(glowColor);
        const glowB = this.p.blue(glowColor);
        this.p.colorMode(this.p.RGB, 255);

        const alpha = (1 - glowT * glowT * glowT) * 3 * glowStrength * layerAlpha;

        this.p.noFill();
        this.p.stroke(glowR, glowG, glowB, alpha);
        this.p.strokeWeight(crumbleRadius * 0.2);

        this.p.circle(flowerCenterX, flowerCenterY + depthOffset, glowSize * 2);
      }

      // 2. 花びらの塗りつぶし（崩れていない部分のみ、境界を滑らかに）
      this.p.blendMode(this.p.BLEND);

      const petalCount = cartesianPoints.length;
      for (let i = 0; i < petalCount; i++) {
        const nextI = (i + 1) % petalCount;
        const point = cartesianPoints[i];
        const nextPoint = cartesianPoints[nextI];

        // この花びらが崩れる範囲内かチェック
        if (point.r > crumbleRadius && nextPoint.r > crumbleRadius) continue; // 両方崩れた部分はスキップ

        const petalT = i / petalCount;
        const petalHueOffset = petalT * 30;

        // 前後の明暗差
        const angle = (point.x - flowerCenterX) !== 0
          ? Math.atan2(point.y - (flowerCenterY + depthOffset), point.x - flowerCenterX)
          : 0;
        const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);

        let depthBrightness = 0;
        if (normalizedAngle < Math.PI) {
          depthBrightness = 15 * Math.sin(normalizedAngle);
        } else {
          depthBrightness = -15 * Math.sin(normalizedAngle - Math.PI);
        }

        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const petalHue = (baseHue + layerHueOffset + petalHueOffset) % 360;
        const petalSaturation = 70 - layer * 5;
        const baseBrightness = 90 - layer * 10;
        const petalBrightness = Math.max(30, Math.min(100, baseBrightness + depthBrightness));
        const petalColor = this.p.color(petalHue, petalSaturation, petalBrightness);

        // RGB値を即座に抽出（メモリリーク回避）
        const petalR = this.p.red(petalColor);
        const petalG = this.p.green(petalColor);
        const petalB = this.p.blue(petalColor);
        this.p.colorMode(this.p.RGB, 255);

        // 崩れる境界付近で透明度を滑らかに変化させる
        const edgeFadeWidth = layerSize * 0.15; // 境界のぼかし幅（15%）
        let edgeFade = 1.0;

        // 各頂点の透明度を計算
        const pointFade = point.r > crumbleRadius - edgeFadeWidth
          ? Math.max(0, (crumbleRadius - point.r) / edgeFadeWidth)
          : 1.0;
        const nextPointFade = nextPoint.r > crumbleRadius - edgeFadeWidth
          ? Math.max(0, (crumbleRadius - nextPoint.r) / edgeFadeWidth)
          : 1.0;

        // 平均透明度を使用
        edgeFade = (pointFade + nextPointFade) / 2;

        const finalAlpha = 80 * layerAlpha * edgeFade;

        this.p.fill(petalR, petalG, petalB, finalAlpha);
        this.p.noStroke();
        this.p.beginShape();
        this.p.vertex(flowerCenterX, flowerCenterY + depthOffset);
        this.p.vertex(point.x, point.y);
        this.p.vertex(nextPoint.x, nextPoint.y);
        this.p.endShape(this.p.CLOSE);
      }

      // 3. 花びらの輪郭線（崩れていない部分のみ、境界を滑らかに）
      this.p.blendMode(this.p.ADD);
      const edgeLayers = 4;
      for (let edgeLayer = 0; edgeLayer < edgeLayers; edgeLayer++) {
        const edgeT = edgeLayer / edgeLayers;
        const thickness = 0.5 + edgeT * 2;

        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const edgeHue = (baseHue + layerHueOffset) % 360;
        const edgeSaturation = 60;
        const edgeBrightness = 100;
        const edgeColor = this.p.color(edgeHue, edgeSaturation, edgeBrightness);
        
        // RGB値を即座に抽出（メモリリーク回避）
        const edgeR = this.p.red(edgeColor);
        const edgeG = this.p.green(edgeColor);
        const edgeB = this.p.blue(edgeColor);
        this.p.colorMode(this.p.RGB, 255);

        const baseAlpha = (1 - edgeT * edgeT) * 50 * glowStrength * layerAlpha;

        this.p.strokeWeight(thickness);
        this.p.noFill();

        // 境界のぼかし幅
        const edgeFadeWidth = layerSize * 0.15;

        // 各セグメントを個別に描画して透明度を調整
        for (let i = 0; i < cartesianPoints.length; i++) {
          const nextI = (i + 1) % cartesianPoints.length;
          const point = cartesianPoints[i];
          const nextPoint = cartesianPoints[nextI];

          // 両方の点が崩れた範囲外ならスキップ
          if (point.r > crumbleRadius && nextPoint.r > crumbleRadius) continue;

          // 各点の透明度を計算
          const pointFade = point.r > crumbleRadius - edgeFadeWidth
            ? Math.max(0, (crumbleRadius - point.r) / edgeFadeWidth)
            : 1.0;
          const nextPointFade = nextPoint.r > crumbleRadius - edgeFadeWidth
            ? Math.max(0, (crumbleRadius - nextPoint.r) / edgeFadeWidth)
            : 1.0;

          // 平均透明度
          const segmentFade = (pointFade + nextPointFade) / 2;
          const segmentAlpha = baseAlpha * segmentFade;

          if (segmentAlpha > 0) {
            this.p.stroke(edgeR, edgeG, edgeB, segmentAlpha);
            this.p.line(point.x, point.y, nextPoint.x, nextPoint.y);
          }
        }
      }
    }

    // 4. 花の中心（最後まで残る）
    const centerAlpha = 1 - crumbleProgress * 0.7; // 中心は最後まで少し残る
    if (centerAlpha > 0) {
      this.p.blendMode(this.p.ADD);
      const centerLayers = 8;
      for (let layer = 0; layer < centerLayers; layer++) {
        const centerT = layer / centerLayers;
        const centerSize = baseFlowerSize * 0.15 * (1 + centerT) * (1 - crumbleProgress * 0.5);

        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const centerHue = (baseHue + 30) % 360;
        const centerSaturation = this.lerp(20, 60, centerT);
        const centerBrightness = 100;
        const centerColor = this.p.color(centerHue, centerSaturation, centerBrightness);

        // RGB値を即座に抽出（メモリリーク回避）
        const centerR = this.p.red(centerColor);
        const centerG = this.p.green(centerColor);
        const centerB = this.p.blue(centerColor);
        this.p.colorMode(this.p.RGB, 255);

        const alpha = (1 - centerT * centerT) * 30 * glowStrength * centerAlpha;

        this.p.fill(centerR, centerG, centerB, alpha);
        this.p.noStroke();
        this.p.circle(flowerCenterX, flowerCenterY, centerSize * 2);
      }
    }

    this.p.blendMode(this.p.BLEND);

    // パーティクルを更新（声に反応して動く）
    this.drawScatter(volume, pitch, pitchChange, particles, time);
  }

  /**
   * 花の形状を構造パーティクル（点の集合）として生成
   * @param stemHeight 茎の高さ
   * @param pitch 音高（Hz）
   * @param time 現在時刻（ミリ秒）
   * @returns 構造パーティクルの配列
   */
  private generateFlowerStructuralParticles(stemHeight: number, pitch: number, time: number): Particle[] {
    const particles: Particle[] = [];
    const seedPos = this.getSeedPosition();

    // 花の中心位置（茎の先端）
    const flowerCenterX = seedPos.x;
    const flowerCenterY = seedPos.y - stemHeight;

    // 画面の向きを判定
    const isPortrait = this.p.height > this.p.width;
    const baseFlowerSize = this.p.height * (isPortrait ? 0.18 : 0.225);

    // 音高に応じたk値（花びらの数）
    const k = this.roseCurve.calculateKFromPitch(pitch, 3, 7, 200, 800);

    // 音高に応じた色相
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);
    // 色相の変化範囲を狭めてチカチカを抑える（330-60 → 340-40）
    const baseHue = this.lerp(340, 40, normalizedPitch);

    // 3層の花びらを点で表現
    const layers = 3;

    for (let layer = 0; layer < layers; layer++) {
      const layerSizeRatio = 0.4 + (layer / (layers - 1)) * 0.7; // 0.4から1.1
      const layerSize = baseFlowerSize * layerSizeRatio;
      const layerK = k + layer * 0.3;
      const depthOffset = (layer - 1) * baseFlowerSize * 0.15;

      // バラ曲線の点を計算（360度、1度ごとに点を配置）
      const angleStep = 1; // 1度ごと
      for (let angle = 0; angle < 360; angle += angleStep) {
        const theta = (angle * Math.PI) / 180;

        // バラ曲線の半径を計算: r = a * cos(k * θ)
        const r = layerSize * Math.cos(layerK * theta);

        // rが負の場合は反対方向
        const adjustedR = Math.abs(r);
        const adjustedTheta = r < 0 ? theta + Math.PI : theta;

        // 横広がり調整
        const angleFromTop = adjustedTheta % (2 * Math.PI);
        let radiusMultiplier = 1.0;
        if (angleFromTop > Math.PI) {
          const upwardAngle = angleFromTop - Math.PI;
          const upwardFactor = Math.abs(Math.sin(upwardAngle));
          radiusMultiplier = 0.9 + upwardFactor * 0.27;
        } else {
          const downwardAngle = angleFromTop;
          const downwardFactor = Math.abs(Math.sin(downwardAngle));
          radiusMultiplier = 0.63 - downwardFactor * 0.14;
        }

        const finalRadius = adjustedR * radiusMultiplier;
        const cartesian = this.roseCurve.polarToCartesian(
          finalRadius,
          adjustedTheta,
          flowerCenterX,
          flowerCenterY + depthOffset
        );

        // 層ごとの色相オフセット
        const layerHueOffset = layer * 15;
        const petalT = angle / 360;
        const petalHueOffset = petalT * 30;

        // 前後の明暗差
        let depthBrightness = 0;
        const normalizedAngle = (adjustedTheta + Math.PI * 2) % (Math.PI * 2);
        if (normalizedAngle < Math.PI) {
          depthBrightness = 15 * Math.sin(normalizedAngle);
        } else {
          depthBrightness = -15 * Math.sin(normalizedAngle - Math.PI);
        }

        // HSBで色を計算
        this.p.colorMode(this.p.HSB, 360, 100, 100);
        const petalHue = (baseHue + layerHueOffset + petalHueOffset) % 360;
        const petalSaturation = 70 - layer * 5;
        const baseBrightness = 90 - layer * 10;
        const petalBrightness = Math.max(30, Math.min(100, baseBrightness + depthBrightness));
        const petalColor = this.p.color(petalHue, petalSaturation, petalBrightness);

        // RGB値を即座に抽出（メモリリーク回避）
        const petalR = Math.floor(this.p.red(petalColor));
        const petalG = Math.floor(this.p.green(petalColor));
        const petalB = Math.floor(this.p.blue(petalColor));
        this.p.colorMode(this.p.RGB, 255);

        // 構造パーティクルを生成
        particles.push({
          x: cartesian.x,
          y: cartesian.y,
          vx: 0,
          vy: 0,
          color: `rgb(${petalR}, ${petalG}, ${petalB})`,
          alpha: 0.9,
          size: 3.5, // 点のサイズ（より大きく）
          targetX: seedPos.x,
          targetY: seedPos.y,
          life: 1,
          maxLife: 10,
          birthTime: time,
          isStructural: true,
          originalX: cartesian.x,
          originalY: cartesian.y,
          noiseOffsetX: Math.random() * 1000,
          noiseOffsetY: Math.random() * 1000,
          releaseTime: undefined,
          isReleased: false,
          // 高さ情報を追加（上から崩れるため、Y座標が小さいほど早く崩れる）
          heightRatio: (seedPos.y - cartesian.y) / stemHeight // 0（根元）から1（花の先端）
        });
      }
    }

    return particles;
  }

  /**
   * 茎と葉の形状を構造パーティクル（点の集合）として生成
   * @param stemHeight 茎の高さ
   * @param leaves 葉の配列
   * @param pitch 音高（Hz）
   * @param time 現在時刻（ミリ秒）
   * @returns 構造パーティクルの配列
   */
  private generateStemLeafStructuralParticles(stemHeight: number, leaves: Leaf[], pitch: number, time: number): Particle[] {
    const particles: Particle[] = [];
    const seedPos = this.getSeedPosition();

    // 音高に応じた色
    const normalizedPitch = this.constrain((pitch - 200) / 600, 0, 1);
    const bodyR = this.lerp(70, 20, normalizedPitch);
    const bodyG = this.lerp(200, 120, normalizedPitch);
    const bodyB = this.lerp(160, 80, normalizedPitch);
    const stemColor = `rgb(${Math.floor(bodyR)}, ${Math.floor(bodyG)}, ${Math.floor(bodyB)})`;

    // 茎を点で表現（縦方向に点を配置）
    const stemPointCount = Math.floor(stemHeight / 3); // 3pxごとに点
    for (let i = 0; i < stemPointCount; i++) {
      const t = i / stemPointCount;
      const currentHeight = stemHeight * t;
      const x = seedPos.x + (Math.random() - 0.5) * 4; // 茎の太さ分のランダム
      const y = seedPos.y - currentHeight;

      particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        color: stemColor,
        alpha: 0.7,
        size: 3,
        targetX: seedPos.x,
        targetY: seedPos.y,
        life: 1,
        maxLife: 10,
        birthTime: time,
        isStructural: true,
        originalX: x,
        originalY: y,
        noiseOffsetX: Math.random() * 1000,
        noiseOffsetY: Math.random() * 1000,
        releaseTime: undefined,
        isReleased: false,
        // 高さ情報を追加（上から崩れるため）
        heightRatio: (seedPos.y - y) / stemHeight // 0（根元）から1（茎の先端）
      });
    }

    // 葉を点で表現
    for (const leaf of leaves) {
      if (leaf.lengthProgress <= 0) continue;

      // 葉の輪郭に沿って点を配置
      const leafPointCount = Math.floor(leaf.size / 2); // 2pxごとに点
      for (let i = 0; i < leafPointCount; i++) {
        const t = i / leafPointCount;

        // ベジェ曲線上の点を計算（簡略版）
        const x = leaf.x + Math.cos(leaf.angle) * leaf.size * t * leaf.lengthProgress;
        const y = leaf.y - Math.sin(leaf.angle) * leaf.size * t * leaf.lengthProgress;

        // 幅方向にもランダムに配置
        const width = leaf.size * 0.4 * leaf.widthProgress * Math.sin(t * Math.PI);
        const offsetX = (Math.random() - 0.5) * width;
        const offsetY = (Math.random() - 0.5) * width * 0.3;

        particles.push({
          x: x + offsetX,
          y: y + offsetY,
          vx: 0,
          vy: 0,
          color: stemColor,
          alpha: 0.7,
          size: 3,
          targetX: seedPos.x,
          targetY: seedPos.y,
          life: 1,
          maxLife: 10,
          birthTime: time,
          isStructural: true,
          originalX: x + offsetX,
          originalY: y + offsetY,
          noiseOffsetX: Math.random() * 1000,
          noiseOffsetY: Math.random() * 1000,
          releaseTime: undefined,
          isReleased: false,
          // 高さ情報を追加（葉の位置に基づく）
          heightRatio: (seedPos.y - (y + offsetY)) / stemHeight // 0（根元）から1（葉の先端）
        });
      }
    }

    return particles;
  }

  /**
   * 全体を散らす処理（花・葉・茎すべてを粒子化して飛散→収束）
   * collapseYより下は通常描画、collapseYより上はパーティクル化
   * @param stemHeight 茎の高さ
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param pitchChange 音高の変化量
   * @param leaves 葉の配列
   * @param scatterAge 散る状態の経過時間（秒）
   * @param particlePhase 'scatter'（散る）または'converge'（収束）
   * @param time 現在時刻（ミリ秒）
   * @param particles パーティクルの配列
   */
  private drawFullScatter(stemHeight: number, volume: number, pitch: number, pitchChange: number, leaves: Leaf[], scatterAge: number, particlePhase: 'scatter' | 'converge', time: number, particles: Particle[]): void {
    const seedPos = this.getSeedPosition();

    // 散る進行度（20秒かけて完全に崩壊）
    const scatterDuration = 20;
    const scatterProgress = Math.min(1, scatterAge / scatterDuration);

    // 崩壊の波のY座標（上から下へ移動）
    // scatterProgress 0: 花の先端、scatterProgress 1: 根元
    const collapseY = seedPos.y - stemHeight * (1 - scatterProgress);

    // 1. collapseYより下の部分は通常描画（collapseYより上は描画しない）
    if (scatterProgress < 1.0) {
      this.p.push();

      // 茎と葉を描画（collapseYパラメータを渡す）
      this.drawSproutWithCollapseY(1.0, volume, pitch, pitchChange, false, stemHeight, leaves, time, collapseY);

      // 花を描画（collapseYパラメータを渡す）
      this.drawBloomWithCollapseY(stemHeight, volume, pitch, pitchChange, leaves, 1.0, time, collapseY);

      this.p.pop();
    }

    // 2. スキャンライン（光の線）を描画
    if (scatterProgress < 1.0) {
      this.p.push();
      this.p.blendMode(this.p.ADD);

      // 水平の光の線
      const lineThickness = 3;
      for (let i = 0; i < 5; i++) {
        const offset = i * 2;
        const alpha = (5 - i) * 50;
        this.p.stroke(255, 255, 255, alpha);
        this.p.strokeWeight(lineThickness - i * 0.5);
        this.p.line(0, collapseY + offset, this.p.width, collapseY + offset);
        this.p.line(0, collapseY - offset, this.p.width, collapseY - offset);
      }

      this.p.blendMode(this.p.BLEND);
      this.p.pop();
    }

    // 3. collapseYより上の部分をパーティクルとして描画
    // 初回のみ：構造パーティクルを生成
    const structuralParticles = particles.filter(p => p.isStructural);
    if (structuralParticles.length === 0) {
      console.log('[SCATTER] Generating particles...');

      // 花の構造パーティクルを生成
      const flowerParticles = this.generateFlowerStructuralParticles(stemHeight, pitch, time);
      console.log(`[SCATTER] Flower particles: ${flowerParticles.length}`);
      particles.push(...flowerParticles);

      // 茎と葉の構造パーティクルを生成
      const stemLeafParticles = this.generateStemLeafStructuralParticles(stemHeight, leaves, pitch, time);
      console.log(`[SCATTER] Stem/leaf particles: ${stemLeafParticles.length}`);
      particles.push(...stemLeafParticles);
    }

    // 4. パーティクルの更新と描画（解放されたもののみ）
    this.p.push();
    this.p.blendMode(this.p.ADD);

    let releasedCount = 0;
    let drawnCount = 0;

    for (const particle of particles) {
      if (!particle.isStructural) continue;

      // 解放タイミングの判定（Y座標ベースで上から順番に崩れる）
      if (!particle.isReleased) {
        // パーティクルのY座標がcollapseYより上（小さい）なら解放
        if ((particle.originalY || particle.y) <= collapseY) {
          particle.isReleased = true;
          particle.releaseTime = time;
        }
      }

      // 解放されたパーティクルのみ描画
      if (particle.isReleased) {
        releasedCount++;

        // 解放された点：風のような動き + 重力
        const releaseAge = (time - (particle.releaseTime || time)) / 1000;

        // パーリンノイズで風の力を計算
        const noiseScale = 0.002;
        const noiseStrength = 50;
        const noiseX = this.p.noise(
          (particle.originalX || 0) * noiseScale + (particle.noiseOffsetX || 0),
          time * 0.0005
        ) * 2 - 1;
        const noiseY = this.p.noise(
          (particle.originalY || 0) * noiseScale + (particle.noiseOffsetY || 0),
          time * 0.0005 + 1000
        ) * 2 - 1;

        // 風の力を速度に加算
        particle.vx += noiseX * noiseStrength * 0.01;
        particle.vy += noiseY * noiseStrength * 0.01;

        // 重力を加算
        const gravity = 0.3;
        particle.vy += gravity;

        // 空気抵抗
        particle.vx *= 0.98;
        particle.vy *= 0.98;

        // 位置更新
        particle.x += particle.vx;
        particle.y += particle.vy;

        // 透明度を徐々に下げる
        particle.alpha = Math.max(0, 1 - releaseAge / 5);

        // 点を描画（グロー効果付き）
        if (particle.alpha > 0.01) {
          drawnCount++;

          // 色を解析してRGB値を取得
          const colorMatch = particle.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (!colorMatch) continue;

          const r = parseInt(colorMatch[1]);
          const g = parseInt(colorMatch[2]);
          const b = parseInt(colorMatch[3]);

          // グロー効果（外側の薄い円）
          this.p.fill(r, g, b, particle.alpha * 60);
          this.p.noStroke();
          this.p.circle(particle.x, particle.y, particle.size * 2.5);

          // メインの点
          this.p.fill(r, g, b, particle.alpha * 255);
          this.p.noStroke();
          this.p.circle(particle.x, particle.y, particle.size);
        }
      }
    }

    console.log(`[SCATTER] progress=${scatterProgress.toFixed(2)}, collapseY=${collapseY.toFixed(0)}, released=${releasedCount}, drawn=${drawnCount}`);

    this.p.blendMode(this.p.BLEND);
    this.p.pop();
  }

  /**
   * HSLをRGBに変換
   * @param h 色相（0-360）
   * @param s 彩度（0-100）
   * @param l 明度（0-100）
   * @returns RGB値（0-255）
   */
  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * キャッシュをクリア（状態リセット時に使用）
   */
  public clearCache(): void {
    this.cachedFlowerImage = null;

    // レイヤーをクリア（メモリリーク防止）
    if (this.bodyLayer) {
      this.bodyLayer.clear();
      // ガベージコレクションを促進
      const ctx = this.bodyLayer.drawingContext as CanvasRenderingContext2D;
      if (ctx && ctx.clearRect) {
        ctx.clearRect(0, 0, this.bodyLayer.width, this.bodyLayer.height);
      }
    }
    if (this.glowLayer) {
      this.glowLayer.clear();
      const ctx = this.glowLayer.drawingContext as CanvasRenderingContext2D;
      if (ctx && ctx.clearRect) {
        ctx.clearRect(0, 0, this.glowLayer.width, this.glowLayer.height);
      }
    }
    if (this.tempGlowLayer) {
      this.tempGlowLayer.clear();
      const ctx = this.tempGlowLayer.drawingContext as CanvasRenderingContext2D;
      if (ctx && ctx.clearRect) {
        ctx.clearRect(0, 0, this.tempGlowLayer.width, this.tempGlowLayer.height);
      }
    }

    // フレームカウントをリセット
    this.frameCount = 0;
  }

  /**
   * HSB色空間からRGB色空間への変換（p5.jsの色オブジェクトを使わない）
   * @param h 色相（0-360）
   * @param s 彩度（0-100）
   * @param b 明度（0-100）
   * @returns RGB値（0-255）
   */
  private hsbToRgb(h: number, s: number, b: number): { r: number; g: number; b: number } {
    h = h / 360;
    s = s / 100;
    b = b / 100;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = b * (1 - s);
    const q = b * (1 - f * s);
    const t = b * (1 - (1 - f) * s);

    let r, g, bl;
    switch (i % 6) {
      case 0: r = b; g = t; bl = p; break;
      case 1: r = q; g = b; bl = p; break;
      case 2: r = p; g = b; bl = t; break;
      case 3: r = p; g = q; bl = b; break;
      case 4: r = t; g = p; bl = b; break;
      case 5: r = b; g = p; bl = q; break;
      default: r = g = bl = 0;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(bl * 255)
    };
  }
}
