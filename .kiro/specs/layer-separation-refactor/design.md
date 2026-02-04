# レイヤー分離リファクタリング - 設計ドキュメント

## 1. アーキテクチャ概要

### 1.1 レイヤー構成

4層のレイヤーシステムを実装します：

```
┌─────────────────────────────────┐
│   Particles Layer (通常合成)    │ ← パーティクル（マスク無視）
├─────────────────────────────────┤
│   Body Layer (通常合成)          │ ← 茎・葉・花（クリッピング可能）
├─────────────────────────────────┤
│   Glow Layer (加算合成)          │ ← Bodyをぼかしたもの
├─────────────────────────────────┤
│   Background (常に表示)          │ ← 背景グラデーション・波紋
└─────────────────────────────────┘
```

### 1.2 レイヤーの役割

- **Background**: メインキャンバスに直接描画、クリアしない
- **Body Layer**: `p5.Graphics`、毎フレームクリア、本体を描画
- **Glow Layer**: `p5.Graphics`、Body Layerをコピーしてぼかす
- **Particles**: メインキャンバスに直接描画

## 2. 描画メソッドのリファクタリング

### 2.1 canvasパラメータの追加

すべての描画メソッドに`canvas`パラメータを追加します：

```typescript
// 変更前
private drawSeed(time: number, volume: number, previousVolume: number, fadeOut: number): void

// 変更後
private drawSeed(canvas: p5 | p5.Graphics, time: number, volume: number, previousVolume: number, fadeOut: number): void
```

### 2.2 対象メソッド

以下のメソッドを変更します：

1. `drawSeed(canvas, ...)`
2. `drawSprout(canvas, ...)`
3. `drawBloom(canvas, ...)`
4. `drawLeaf(canvas, ...)`
5. `drawCalyx(canvas, ...)`
6. `drawSproutAsParticles(canvas, ...)` ※使用されていない場合は削除検討
7. `drawLeafAsParticles(canvas, ...)` ※使用されていない場合は削除検討

### 2.3 実装方針

各メソッド内で`this.p`を使用している箇所を`canvas`に置き換えます：

```typescript
// 変更前
this.p.fill(255, 0, 0);
this.p.circle(x, y, radius);

// 変更後
canvas.fill(255, 0, 0);
canvas.circle(x, y, radius);
```

**注意点:**
- `p5.Graphics`には`ADD`、`BLEND`などの定数がないため、`this.p.ADD`、`this.p.BLEND`を使用
- `this.p.TWO_PI`、`this.p.sin()`などのユーティリティは`this.p`から取得

## 3. グローエフェクトの実装

### 3.1 現在の問題

`p5.Graphics.filter(BLUR)`にシェーダー初期化の問題があります。

### 3.2 解決策：カスタムぼかし実装

`filter()`の代わりに、手動でぼかしを実装します：

```typescript
private applyBlur(source: p5.Graphics, target: p5.Graphics, intensity: number): void {
  target.clear();
  target.loadPixels();
  source.loadPixels();
  
  const radius = Math.floor(intensity);
  
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      
      // 周囲のピクセルを平均化
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < source.width && ny >= 0 && ny < source.height) {
            const idx = (ny * source.width + nx) * 4;
            r += source.pixels[idx];
            g += source.pixels[idx + 1];
            b += source.pixels[idx + 2];
            a += source.pixels[idx + 3];
            count++;
          }
        }
      }
      
      const idx = (y * target.width + x) * 4;
      target.pixels[idx] = r / count;
      target.pixels[idx + 1] = g / count;
      target.pixels[idx + 2] = b / count;
      target.pixels[idx + 3] = a / count;
    }
  }
  
  target.updatePixels();
}
```

**パフォーマンス最適化案:**
- ぼかし半径を小さくする（5-10ピクセル）
- ダウンサンプリング：Body Layerを縮小してからぼかし、拡大して合成
- フレームスキップ：2フレームに1回だけぼかしを更新

### 3.3 代替案：WebGL filter()

もし`filter()`が動作する場合：

```typescript
if (this.glowLayer && this.bodyLayer) {
  this.glowLayer.clear();
  this.glowLayer.image(this.bodyLayer, 0, 0);
  
  // WebGLモードでfilter()を試す
  try {
    this.glowLayer.filter(this.p.BLUR, 15);
  } catch (e) {
    // フォールバック：カスタムぼかし
    this.applyBlur(this.bodyLayer, this.glowLayer, 15);
  }
}
```

## 4. render()メソッドの実装

### 4.1 描画フロー

```typescript
public render(state: GrowthState, params: RenderParameters, time: number): void {
  // 1. レイヤーを初期化
  this.ensureLayers();
  
  // 2. 背景を描画（メインキャンバス、クリアしない）
  this.drawBackground();
  
  // 3. 波紋を描画（メインキャンバス）
  if (params.ripples && params.ripples.length > 0) {
    this.drawRipples(params.ripples);
  }
  
  // 4. Body Layerをクリアして本体を描画
  if (this.bodyLayer) {
    this.bodyLayer.clear();
    
    switch (state) {
      case GrowthState.SEED:
        this.drawSeed(this.bodyLayer, time, params.volume, this.previousVolume, 1);
        break;
      case GrowthState.SPROUT:
        const seedFadeOut = Math.max(0, 1 - params.progress / 0.3);
        this.drawSeed(this.bodyLayer, time, params.volume, this.previousVolume, seedFadeOut);
        this.drawSprout(this.bodyLayer, params.progress, params.volume, params.pitch, params.pitchChange, params.reduceGlow, params.stemHeight, params.leaves, time);
        break;
      case GrowthState.BLOOM:
        this.drawSprout(this.bodyLayer, 1.0, params.volume, params.pitch, params.pitchChange, false, params.stemHeight, params.leaves, time);
        this.drawBloom(this.bodyLayer, params.stemHeight, params.volume, params.pitch, params.pitchChange, params.leaves, params.growthProgress, time);
        break;
    }
  }
  
  // 5. Glow Layerを生成（Body Layerをぼかす）
  if (this.glowLayer && this.bodyLayer) {
    this.applyBlur(this.bodyLayer, this.glowLayer, 10);
  }
  
  // 6. レイヤーを合成
  // Glow Layer（加算合成）
  if (this.glowLayer) {
    this.p.push();
    this.p.blendMode(this.p.ADD);
    this.p.image(this.glowLayer, 0, 0);
    this.p.blendMode(this.p.BLEND);
    this.p.pop();
  }
  
  // Body Layer（通常合成）
  if (this.bodyLayer) {
    this.p.image(this.bodyLayer, 0, 0);
  }
  
  // 7. アンビエントグロー（BLOOM状態のみ、メインキャンバス）
  if (state === GrowthState.BLOOM) {
    this.drawAmbientGlow(params.stemHeight, params.volume, params.pitch, params.pitchChange, params.growthProgress);
  }
  
  // 8. パーティクル（メインキャンバス）
  if (params.particles && params.particles.length > 0) {
    this.drawParticles(params.particles);
  }
}
```

### 4.2 レイヤー初期化

```typescript
private ensureLayers(): void {
  const width = this.p.width;
  const height = this.p.height;
  
  // Body Layer
  if (!this.bodyLayer || this.bodyLayer.width !== width || this.bodyLayer.height !== height) {
    if (this.bodyLayer) this.bodyLayer.remove();
    this.bodyLayer = this.p.createGraphics(width, height);
  }
  
  // Glow Layer
  if (!this.glowLayer || this.glowLayer.width !== width || this.glowLayer.height !== height) {
    if (this.glowLayer) this.glowLayer.remove();
    this.glowLayer = this.p.createGraphics(width, height);
  }
}
```

## 5. グローエフェクトの除去

### 5.1 対象メソッド

以下のメソッドから既存のグローエフェクト（加算合成）を除去します：

- `drawSeed()`: 外側・中間・内側のリング（加算合成部分）
- `drawSprout()`: グローレイヤー（加算合成部分）
- `drawBloom()`: グローレイヤー（加算合成部分）
- `drawLeaf()`: グローレイヤー（加算合成部分）

### 5.2 除去方針

**本体のみを描画**し、グローは`Glow Layer`で自動生成します：

```typescript
// 変更前：グロー + 本体
canvas.blendMode(this.p.ADD);
// グロー描画...
canvas.blendMode(this.p.BLEND);
// 本体描画...

// 変更後：本体のみ
canvas.blendMode(this.p.BLEND);
// 本体描画のみ...
```

**注意:** 輪郭線の発光エフェクトは残す（これは本体の一部として扱う）

## 6. パフォーマンス最適化

### 6.1 ぼかしの最適化

- ぼかし半径：10ピクセル（15から削減）
- ダウンサンプリング：Body Layerを50%に縮小してからぼかし

```typescript
private applyBlurOptimized(source: p5.Graphics, target: p5.Graphics, intensity: number): void {
  // 50%にダウンサンプリング
  const smallWidth = Math.floor(source.width / 2);
  const smallHeight = Math.floor(source.height / 2);
  const tempGraphics = this.p.createGraphics(smallWidth, smallHeight);
  
  tempGraphics.image(source, 0, 0, smallWidth, smallHeight);
  
  // 小さい画像をぼかす
  this.applyBlur(tempGraphics, tempGraphics, intensity / 2);
  
  // 元のサイズに拡大
  target.clear();
  target.image(tempGraphics, 0, 0, target.width, target.height);
  
  tempGraphics.remove();
}
```

### 6.2 フレームスキップ

```typescript
private frameCount = 0;

public render(...): void {
  // ...
  
  // 2フレームに1回だけぼかしを更新
  if (this.frameCount % 2 === 0 && this.glowLayer && this.bodyLayer) {
    this.applyBlurOptimized(this.bodyLayer, this.glowLayer, 10);
  }
  this.frameCount++;
  
  // ...
}
```

## 7. テスト戦略

### 7.1 視覚的テスト

- 各状態（SEED、SPROUT、BLOOM）で描画結果を確認
- グローエフェクトが自然に見えるか確認
- パフォーマンス（60fps維持）を確認

### 7.2 単体テスト

- `ensureLayers()`：レイヤーが正しく初期化されるか
- `applyBlur()`：ぼかしが正しく適用されるか（ピクセル値の検証）

## 8. 移行計画

### 8.1 段階的リファクタリング

1. **Phase 1**: `drawSeed()`のみcanvasパラメータ化、動作確認
2. **Phase 2**: `drawSprout()`、`drawBloom()`をcanvasパラメータ化
3. **Phase 3**: `drawLeaf()`、`drawCalyx()`をcanvasパラメータ化
4. **Phase 4**: グローエフェクトを除去、`applyBlur()`実装
5. **Phase 5**: `render()`メソッドでレイヤー合成実装
6. **Phase 6**: パフォーマンス最適化

### 8.2 ロールバック計画

各Phaseで問題が発生した場合、前のPhaseに戻せるようにコミットを分けます。
