# 設計書: Singing Flower Art

## 概要

本システムは、p5.jsとWeb Audio APIを使用して、ユーザーの歌声に反応するインタラクティブなビジュアルアートを実現します。マイク入力から音量と音高をリアルタイムで解析し、花の成長段階を状態機械で管理しながら、美しいアニメーションを描画します。

技術スタック：
- p5.js（描画とアニメーションループ）
- Web Audio API（音声解析）
- TypeScript（実装言語）
- Vite（ビルドツール）

## アーキテクチャ

システムは以下の主要コンポーネントで構成されます：

```
┌─────────────────────────────────────────────────────────┐
│                   p5.js Sketch                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ AudioAnalyzer│  │StateMachine  │  │ Drawing      │ │
│  │              │  │              │  │ Functions    │ │
│  │ - volume     │─▶│ - state      │─▶│ - draw()     │ │
│  │ - pitch      │  │ - transition │  │ - setup()    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                     │                                    │
│              ┌──────▼──────┐                            │
│              │GrowthController                          │
│              │ - updateGrowth()                         │
│              └─────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

データフロー：
1. AudioAnalyzer: マイク入力 → 音量・音高データ
2. GrowthController: 音声データ → 成長パラメータ
3. StateMachine: 成長パラメータ → 状態遷移判定
4. p5.js draw(): 状態 + 音声データ → Canvas描画

## コンポーネントとインターフェース

### 1. AudioAnalyzer

**責務**: マイク入力から音量と音高をリアルタイムで解析

**インターフェース**:
```typescript
interface AudioAnalyzer {
  initialize(): Promise<void>
  getVolume(): number  // 0-100のデシベル値
  getPitch(): number   // Hz単位の周波数
  isActive(): boolean
  dispose(): void
}
```

**実装詳細**:
- Web Audio APIの`AudioContext`を使用
- `getUserMedia()`でマイクアクセスを取得
- `AnalyserNode`で周波数データを取得
- 音量: FFTデータから平均振幅を計算
- 音高: 自己相関法またはFFTのピーク検出で基本周波数を推定

### 2. StateMachine

**責務**: 花の成長段階を管理し、状態遷移を制御

**状態定義**:
```typescript
enum GrowthState {
  SEED,      // 種子
  SPROUT,    // 芽
  STEM,      // 茎と葉
  BLOOM,     // 開花
  SCATTER    // 散る
}
```

**インターフェース**:
```typescript
interface StateMachine {
  getCurrentState(): GrowthState
  update(volume: number, growthProgress: number): void
  reset(): void
}
```

**状態遷移ロジック**:
- SEED → SPROUT: 音量が閾値（例: 30dB）を超える
- SPROUT → STEM: 芽の長さが閾値（例: 100px）に達する
- STEM → BLOOM: 茎の長さが閾値（例: 300px）に達する
- BLOOM → SCATTER: 音量が散る閾値（例: 70dB）を超える
- SCATTER → SEED: 全パーティクルが消滅

### 3. GrowthController

**責務**: 音声データに基づいて成長パラメータを計算

**インターフェース**:
```typescript
interface GrowthController {
  update(volume: number, pitch: number, deltaTime: number): GrowthParameters
}

interface GrowthParameters {
  growthSpeed: number      // 成長速度倍率
  swayAmount: number       // 揺れの振幅
  colorHue: number         // 色相（0-360）
  colorSaturation: number  // 彩度（0-100）
  colorLightness: number   // 明度（0-100）
}
```

**計算ロジック**:
- 成長速度: `growthSpeed = 1 + (volume / 100) * 2` （音量が大きいほど速い）
- 揺れ: `swayAmount = (pitch - basePitch) / 100` （音高の変化に応じて）
- 色相: 音高を色相にマッピング（例: 200Hz→120°緑、400Hz→180°シアン）
- 明度: 音高が高いほど明るく（例: `lightness = 30 + pitch / 10`）

### 4. p5.js描画関数

**責務**: p5.jsのsetup()とdraw()で花の視覚要素を描画

**主要関数**:
```typescript
// p5.jsスケッチ内の関数
function setup(): void
function draw(): void
function windowResized(): void
function drawBackground(): void
function drawSeed(): void
function drawSprout(): void
function drawStem(): void
function drawLeaf(leaf: Leaf): void
function drawBloom(): void
function drawParticles(): void
```

**描画の詳細**:
- `setup()`: Canvas初期化、コンポーネント初期化
- `draw()`: 毎フレーム呼ばれる描画ループ
- `windowResized()`: ウィンドウリサイズ時の処理
- `drawBackground()`: 放射状グラデーション背景（複数の円を重ねて描画）
- `drawSeed()`: 脈動する円
- `drawSprout()`: 上に伸びる線
- `drawStem()`: 茎と葉
- `drawLeaf()`: ベジェ曲線で描画される葉（詳細は後述）
- `drawBloom()`: バラ曲線の花
- `drawParticles()`: パーティクル効果

**p5.jsの利点**:
- アニメーションループが自動管理される
- 描画関数がシンプルで直感的
- 数学関数（sin, cos, lerp等）が組み込み
- リサイズ処理が簡単

**葉の描画詳細**:

葉は以下の特徴を持つ：

1. **形状**: p5.jsのbezier()関数で描画
   - 制御点は音高（pitch）に応じて調整され、葉がしなる
   - ベジェ曲線の制御点計算:
     ```
     起点: (x0, y0) = 茎の取り付け位置
     制御点1: (x1, y1) = (x0 + size * 0.3 * cos(angle), y0 + size * 0.3 * sin(angle) + bendAmount)
     制御点2: (x2, y2) = (x0 + size * 0.7 * cos(angle), y0 + size * 0.7 * sin(angle) + bendAmount * 0.5)
     終点: (x3, y3) = (x0 + size * cos(angle), y0 + size * sin(angle))
     
     bendAmount = (pitch - basePitch) / 50  // 音高によるしなり
     ```

2. **色**: 茎から先端へのグラデーション
   - 茎に近い部分: 濃い緑（例: `color(120, 60%, 25%)`）
   - 先端: 光を透過したような明るい緑（例: `color(120, 70%, 65%)`）
   - p5.jsの`lerpColor()`を使用してグラデーション描画

3. **アイドル時の揺れ**: 歌っていない時もゆっくり上下に揺れる
   ```
   idleSwayAmount = sin(millis() * 0.0005 + leaf.idleSwayPhase) * 2
   leafY += idleSwayAmount
   ```

4. **音高による揺れ**: 音高変化に応じて追加の揺れ
   ```
   pitchSwayAmount = (pitch - previousPitch) * 0.1
   leafY += pitchSwayAmount
   ```

5. **葉脈**: 音量が大きい時に光る線が一瞬走る
   - 音量が閾値（例: 60dB）を超えた時、`veinBrightness` を 1.0 に設定
   - その後、徐々に減衰: `veinBrightness *= 0.95` （毎フレーム）
   - 葉脈は葉の中央を通る細い線として描画
   - 色: `color(255, 255, 200, veinBrightness * 255)` （黄色がかった白）

### 5. RoseCurve

**責務**: バラ曲線アルゴリズムで花びらを生成

**インターフェース**:
```typescript
interface RoseCurve {
  generate(a: number, k: number, points: number): Point[]
}

interface Point {
  x: number
  y: number
}
```

**アルゴリズム**:
```
極座標方程式: r = a * cos(k * θ)
直交座標変換:
  x = r * cos(θ) = a * cos(k * θ) * cos(θ)
  y = r * sin(θ) = a * cos(k * θ) * sin(θ)

パラメータ:
- a: 花の大きさ（振幅）
- k: 花びらの数を決定（k=3で3枚、k=5で5枚など）
- θ: 0から2πまで回転

p5.jsでの実装:
for (let theta = 0; theta < TWO_PI; theta += 0.01) {
  const r = a * cos(k * theta);
  const x = r * cos(theta);
  const y = r * sin(theta);
  vertex(x, y);
}
```

**音高による変化**:
- 高い声: k値を増やす（例: k = 3 + pitch / 200）→ 花びらが細かく増える
- 低い声: k値を減らす（例: k = 2）→ 大きくゆったりした花びら

### 6. ParticleSystem

**責務**: 花が散る際のパーティクル効果を管理（飛散と収束の2段階）

**インターフェース**:
```typescript
interface ParticleSystem {
  createParticles(elements: VisualElement[], seedPosition: Point): void
  update(deltaTime: number, volume: number, pitch: number): void
  getParticles(): Particle[]
  isComplete(): boolean
  getPhase(): 'scatter' | 'converge'  // 飛散段階か収束段階か
}

interface Particle {
  x: number
  y: number
  vx: number  // x方向速度
  vy: number  // y方向速度
  color: string
  alpha: number  // 透明度
  size: number
  targetX: number  // 収束先のx座標（種子位置）
  targetY: number  // 収束先のy座標（種子位置）
}
```

**物理演算**:

**飛散段階（scatter）**:
```
初速度: v0 = volume / 10  （音量が大きいほど速い）
方向: 音高に応じて
  - 高い声: vy = -v0 * 2 (上方向)
  - 低い声: vy = v0 * 0.5 (下方向)
  - vx = random(-v0, v0) (ランダムな横方向)

更新:
  x += vx * deltaTime
  y += vy * deltaTime
  vy += gravity * deltaTime  (重力加速度)
  alpha -= fadeSpeed * deltaTime  (徐々に透明化)

段階遷移条件:
  alpha < 0.3 の時、収束段階へ移行
```

**収束段階（converge）**:
```
目標: 全パーティクルを種子位置 (seedX, seedY) に移動

各パーティクルの更新:
  dx = targetX - x
  dy = targetY - y
  distance = sqrt(dx² + dy²)
  
  // 距離に応じて速度を増加（近いほど速い）
  speed = baseSpeed * (1 + (maxDistance - distance) / maxDistance * 5)
  
  // 目標方向への速度ベクトル
  vx = (dx / distance) * speed
  vy = (dy / distance) * speed
  
  x += vx * deltaTime
  y += vy * deltaTime
  
  // 透明度は維持または微増
  alpha = min(alpha + 0.01, 1.0)

完了条件:
  全パーティクルが種子位置から半径5px以内に到達
```

## データモデル

### Leaf（葉）

```typescript
interface Leaf {
  x: number          // 茎上の取り付け位置
  y: number
  angle: number      // 茎からの角度（左右）
  size: number       // サイズ
  baseColor: string  // 茎に近い部分の濃い緑
  tipColor: string   // 先端の明るい緑
  swayOffset: number // 揺れのオフセット
  bendAmount: number // ベジェ曲線のしなり具合（音高に応じて変化）
  veinBrightness: number // 葉脈の明るさ（0-1、音量が大きい時に1）
  idleSwayPhase: number  // アイドル時の揺れの位相
}
```

### VisualElement（描画要素）

```typescript
interface VisualElement {
  type: 'seed' | 'stem' | 'leaf' | 'petal'
  x: number
  y: number
  color: string
  size: number
}
```

### AppState（アプリケーション状態）

```typescript
interface AppState {
  growthState: GrowthState
  seedPosition: Point  // 種子の位置（画面中央下）
  stemHeight: number
  leaves: Leaf[]
  bloomProgress: number  // 開花の進行度（0-1）
  particles: Particle[]
  particlePhase: 'scatter' | 'converge'  // パーティクルの段階
  lastUpdateTime: number
}
```

## 正確性プロパティ

プロパティとは、システムの全ての有効な実行において真であるべき特性や振る舞いのことです。これらは人間が読める仕様と機械で検証可能な正確性保証の橋渡しとなります。


### プロパティ1: 音声データの継続的な取得

*任意の*マイクアクセス許可後、Audio_Analyzerは音声データを継続的に取得し、音量と音高を計算する

**検証: 要件 1.2, 1.3, 1.4**

### プロパティ2: 音量による状態遷移

*任意の*音量値に対して、閾値を超えた場合、State_Machineは適切な次の状態へ遷移する（種子→芽、開花→散る）

**検証: 要件 2.4, 5.8**

### プロパティ3: 成長進行による状態遷移

*任意の*成長進行度に対して、閾値に達した場合、State_Machineは適切な次の状態へ遷移する（芽→茎と葉、茎と葉→開花）

**検証: 要件 3.5, 4.7**

### プロパティ4: 音量による成長速度の変化

*任意の*音量値に対して、GrowthControllerは音量が大きいほど成長速度（茎の伸び、葉の生成速度）を増加させる

**検証: 要件 3.2, 4.2, 4.4**

### プロパティ5: 音高による色の変化

*任意の*音高値に対して、Rendererは音高が高いほど明るい色、低いほど深い色を適用する（芽、茎と葉、花）

**検証: 要件 3.3, 4.5, 5.6**

### プロパティ6: 音高変化による揺れ

*任意の*音高変化に対して、Rendererは揺れの振幅を変化させる（芽、茎と葉、花びら）

**検証: 要件 3.4, 4.6**

### プロパティ6-A: 葉のアイドル時の揺れ

*任意の*時間経過に対して、Rendererは音声入力がない場合でも葉をゆっくりと周期的に揺らす

**検証: 要件 4.10**

### プロパティ6-B: 音高による葉のしなり

*任意の*音高値に対して、Rendererは音高が高いほど葉のベジェ曲線の制御点を調整し、葉をしならせる

**検証: 要件 4.8**

### プロパティ6-C: 音量による葉脈の表示

*任意の*音量値に対して、音量が閾値を超えた場合、Rendererは葉脈を表示し、その後徐々に減衰させる

**検証: 要件 4.11, 4.12**

### プロパティ6-D: 葉のグラデーション

*任意の*葉に対して、Rendererは茎に近い部分を濃い緑、先端を明るい緑のグラデーションで描画する

**検証: 要件 4.9**

### プロパティ7: 種子の脈動アニメーション

*任意の*時間経過に対して、種子状態のRendererは円のサイズを周期的に変化させる

**検証: 要件 2.3**

### プロパティ8: 茎と葉の継続表示

*任意の*開花状態において、Rendererは茎と葉を継続して描画する

**検証: 要件 5.2**

### プロパティ9: 音量による花の輝きと揺れ

*任意の*音量値に対して、開花状態のRendererは音量が大きいほど花の輝きを強くし、花びらの揺れを細かくする

**検証: 要件 5.3, 5.4**

### プロパティ10: 音高によるバラ曲線係数の変化

*任意の*音高値に対して、RoseCurveは音高が高いほどk値を増やし（花びらが細かく増える）、低いほどk値を減らす（大きくゆったりした花びら）

**検証: 要件 5.5, 8.4**

### プロパティ11: バラ曲線の数学的正確性

*任意の*パラメータa、k、θに対して、RoseCurveは極座標方程式 r = a * cos(k * θ) を正確に計算する

**検証: 要件 8.1**

### プロパティ12: バラ曲線パラメータの調整可能性

*任意の*パラメータa（振幅）とk（係数）の値に対して、RoseCurveは異なる曲線を生成する

**検証: 要件 8.2, 8.3**

### プロパティ13: 極座標から直交座標への変換

*任意の*極座標(r, θ)に対して、RoseCurveは直交座標(x, y)への変換を実行し、逆変換で元の極座標を復元できる（ラウンドトリップ）

**検証: 要件 8.5**

### プロパティ14: 音量によるパーティクル初速度

*任意の*音量値に対して、ParticleSystemは音量が大きいほどパーティクルの初速度を大きく設定する

**検証: 要件 6.2**

### プロパティ15: 音高によるパーティクル移動方向

*任意の*音高値に対して、ParticleSystemは音高が高いほど上方向、低いほど下方向にパーティクルを移動させる

**検証: 要件 6.3**

### プロパティ16: パーティクルの物理演算（飛散段階）

*任意の*パーティクルに対して、飛散段階のRendererは重力と速度に基づいて位置を更新する

**検証: 要件 6.4**

### プロパティ17: パーティクルの透明化（飛散段階）

*任意の*時間経過に対して、飛散段階のRendererはパーティクルの透明度を徐々に減少させる

**検証: 要件 6.5**

### プロパティ17-A: パーティクルの収束段階への遷移

*任意の*パーティクル群に対して、透明度が閾値を下回った時、ParticleSystemは収束段階に遷移する

**検証: 要件 6.6**

### プロパティ17-B: パーティクルの種子位置への収束

*任意の*パーティクルに対して、収束段階のParticleSystemはパーティクルを種子位置に向かって移動させる

**検証: 要件 6.7**

### プロパティ17-C: 距離に応じた収束速度の増加

*任意の*パーティクルに対して、収束段階のParticleSystemは種子位置に近いほど速度を増加させる

**検証: 要件 6.8**

### プロパティ17-D: 収束完了時の状態遷移

*任意の*パーティクル群に対して、全てが種子位置に到達した時、State_Machineは種子状態に遷移する

**検証: 要件 6.9**

### プロパティ18: ウィンドウサイズに応じたCanvas調整

*任意の*ウィンドウサイズに対して、RendererはCanvasのサイズを調整し、描画要素の位置とサイズを相対値で計算する

**検証: 要件 10.1, 10.3**

## エラー処理

### エラーケース

1. **マイクアクセス拒否**
   - ユーザーがマイクアクセスを拒否した場合
   - 対応: エラーメッセージを表示し、静的な花のアニメーション（音声なし）を提供

2. **Web Audio API非サポート**
   - ブラウザがWeb Audio APIをサポートしていない場合
   - 対応: 互換性エラーメッセージを表示し、サポートされているブラウザを案内

3. **マイク入力なし**
   - マイクが接続されていない、または音声が検出されない場合
   - 対応: 「音声が検出されません」というメッセージを表示

4. **Canvas初期化失敗**
   - Canvas要素の取得または初期化に失敗した場合
   - 対応: エラーメッセージを表示し、ページのリロードを促す

### エラーハンドリング戦略

```typescript
try {
  await audioAnalyzer.initialize()
} catch (error) {
  if (error.name === 'NotAllowedError') {
    showError('マイクアクセスが拒否されました')
  } else if (error.name === 'NotFoundError') {
    showError('マイクが見つかりません')
  } else {
    showError('音声の初期化に失敗しました')
  }
  // フォールバック: 静的アニメーションモード
  startStaticMode()
}
```

## テスト戦略

### デュアルテストアプローチ

本システムでは、ユニットテストとプロパティベーステストの両方を使用します：

- **ユニットテスト**: 特定の例、エッジケース、エラー条件を検証
- **プロパティテスト**: 全ての入力に対する普遍的なプロパティを検証

両者は補完的であり、包括的なカバレッジを実現します。

### プロパティベーステスト設定

- **ライブラリ**: fast-check（JavaScript/TypeScript用）
- **反復回数**: 各プロパティテストで最低100回
- **タグ形式**: `Feature: singing-flower-art, Property {番号}: {プロパティテキスト}`

### テスト対象

#### ユニットテスト

1. **初期化テスト**
   - システム起動時の初期状態（種子状態）
   - Canvas要素の初期化
   - AudioAnalyzerの初期化
   - エラーケース（マイクアクセス拒否、API非サポート）

2. **状態遷移テスト**
   - 各状態遷移の具体例
   - 種子→芽、芽→茎と葉、茎と葉→開花、開花→散る、散る→種子

3. **描画テスト**
   - 背景グラデーションの描画
   - Canvas APIの使用確認
   - ウィンドウリサイズ時の再初期化

4. **エッジケース**
   - 音量が0の場合
   - 音高が極端に高い/低い場合
   - パーティクルが0個の場合

#### プロパティテスト

各正確性プロパティ（プロパティ1〜18）に対して、1つのプロパティテストを実装します：

1. **プロパティ1**: ランダムな音声データで音量・音高計算をテスト
2. **プロパティ2**: ランダムな音量値で状態遷移をテスト
3. **プロパティ3**: ランダムな成長進行度で状態遷移をテスト
4. **プロパティ4**: ランダムな音量値で成長速度の単調増加をテスト
5. **プロパティ5**: ランダムな音高値で色の明度変化をテスト
6. **プロパティ6**: ランダムな音高変化で揺れの発生をテスト
6-A. **プロパティ6-A**: ランダムな時間経過で葉のアイドル揺れの周期性をテスト
6-B. **プロパティ6-B**: ランダムな音高値で葉のしなり（ベジェ曲線制御点の変化）をテスト
6-C. **プロパティ6-C**: ランダムな音量値で葉脈の表示と減衰をテスト
6-D. **プロパティ6-D**: ランダムな葉で茎から先端へのグラデーションをテスト
7. **プロパティ7**: ランダムな時間経過で脈動の周期性をテスト
8. **プロパティ8**: ランダムな開花状態で茎と葉の存在をテスト
9. **プロパティ9**: ランダムな音量値で輝きと揺れの増加をテスト
10. **プロパティ10**: ランダムな音高値でk値の変化をテスト
11. **プロパティ11**: ランダムなa、k、θでバラ曲線の計算精度をテスト
12. **プロパティ12**: ランダムなa、kで異なる曲線生成をテスト
13. **プロパティ13**: ランダムな極座標で座標変換のラウンドトリップをテスト
14. **プロパティ14**: ランダムな音量値でパーティクル初速度の単調増加をテスト
15. **プロパティ15**: ランダムな音高値でパーティクル方向の変化をテスト
16. **プロパティ16**: ランダムなパーティクルで飛散段階の物理演算の適用をテスト
17. **プロパティ17**: ランダムな時間経過で飛散段階の透明度の単調減少をテスト
17-A. **プロパティ17-A**: ランダムなパーティクル群で透明度閾値到達時の収束段階遷移をテスト
17-B. **プロパティ17-B**: ランダムなパーティクルで収束段階の種子位置への移動をテスト
17-C. **プロパティ17-C**: ランダムなパーティクルで距離に応じた収束速度の増加をテスト
17-D. **プロパティ17-D**: ランダムなパーティクル群で全到達時の状態遷移をテスト
18. **プロパティ18**: ランダムなウィンドウサイズでCanvas調整をテスト

### テスト実装例

```typescript
// プロパティテスト例: プロパティ13（座標変換のラウンドトリップ）
// Feature: singing-flower-art, Property 13: 極座標から直交座標への変換
test('polar to cartesian conversion round trip', () => {
  fc.assert(
    fc.property(
      fc.float({ min: 0, max: 100 }), // r
      fc.float({ min: 0, max: 2 * Math.PI }), // θ
      (r, theta) => {
        const cartesian = polarToCartesian(r, theta)
        const polar = cartesianToPolar(cartesian.x, cartesian.y)
        
        expect(polar.r).toBeCloseTo(r, 5)
        expect(polar.theta).toBeCloseTo(theta, 5)
      }
    ),
    { numRuns: 100 }
  )
})

// ユニットテスト例: 初期化
test('system initializes in seed state', () => {
  const stateMachine = new StateMachine()
  expect(stateMachine.getCurrentState()).toBe(GrowthState.SEED)
})
```

### モックとスタブ

- **AudioContext**: Web Audio APIをモック化してテスト環境で実行
- **p5.js**: テスト時はp5のグローバル関数をモック化
- **Canvas描画**: 描画関数の呼び出しを検証（実際の描画結果は検証しない）

### カバレッジ目標

- ライン カバレッジ: 80%以上
- ブランチ カバレッジ: 75%以上
- 全ての正確性プロパティに対するプロパティテスト: 100%
