/**
 * 花の成長段階を表す列挙型
 */
export enum GrowthState {
  SEED = 'SEED',       // 種子
  SPROUT = 'SPROUT',   // 芽
  STEM = 'STEM',       // 茎と葉
  BLOOM = 'BLOOM',     // 開花
  SCATTER = 'SCATTER'  // 散る
}

/**
 * 2D座標を表すインターフェース
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 成長パラメータを表すインターフェース
 */
export interface GrowthParameters {
  growthSpeed: number;      // 成長速度倍率
  swayAmount: number;       // 揺れの振幅
  colorHue: number;         // 色相（0-360）
  colorSaturation: number;  // 彩度（0-100）
  colorLightness: number;   // 明度（0-100）
}

/**
 * 葉を表すインターフェース
 */
export interface Leaf {
  x: number;                // 茎上の取り付け位置
  y: number;
  angle: number;            // 茎からの角度（左右）
  size: number;             // サイズ
  baseColor: string;        // 茎に近い部分の濃い緑
  tipColor: string;         // 先端の明るい緑
  swayOffset: number;       // 揺れのオフセット
  bendAmount: number;       // ベジェ曲線のしなり具合（音高に応じて変化）
  veinBrightness: number;   // 葉脈の明るさ（0-1、音量が大きい時に1）
  idleSwayPhase: number;    // アイドル時の揺れの位相
  unfurlProgress: number;   // 展開の進行度（0-1、0=丸まった状態、1=完全展開）
  birthTime: number;        // 生成された時刻（ミリ秒）
  lengthProgress: number;   // 長さの成長進行度（0-1）
  widthProgress: number;    // 幅の展開進行度（0-1）
  rotationProgress: number; // 角度の回転進行度（0-1）
  targetWidth: number;      // 音高に応じた最終的な幅（0.3-1.0）
  unfoldDelay: number;      // 展開のタイミングオフセット（秒）
  isLeft: boolean;          // 左側の葉かどうか
  shapeSeed: number;        // 形状の個体差シード（0-1）
  birthPitch: number;       // 生成時の音高（Hz）
  widthRatio: number;       // 横幅の比率（0.7-1.3、生成時のピッチで決定）
  stemPositionRatio: number; // 茎上の相対位置（0=根元、1=先端）- 生成時に固定
}

/**
 * パーティクルを表すインターフェース
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;               // x方向速度
  vy: number;               // y方向速度
  color: string;
  alpha: number;            // 透明度
  size: number;
  targetX: number;          // 収束先のx座標（種子位置）
  targetY: number;          // 収束先のy座標（種子位置）
  life: number;             // 残り寿命（0-1）
  maxLife: number;          // 最大寿命（秒）
  birthTime: number;        // 生成時刻（ミリ秒）
  // 構造パーティクル用（花の形状を構成する点）
  isStructural?: boolean;   // 構造パーティクルかどうか
  originalX?: number;       // 元の位置X（結合状態の位置）
  originalY?: number;       // 元の位置Y（結合状態の位置）
  noiseOffsetX?: number;    // パーリンノイズ用オフセットX
  noiseOffsetY?: number;    // パーリンノイズ用オフセットY
  releaseTime?: number;     // 解放された時刻（ミリ秒）
  isScatter?: boolean;      // SCATTER状態で生成されたパーティクルかどうか
  isReleased?: boolean;     // 解放されたかどうか
  heightRatio?: number;     // 高さの比率（0=根元、1=先端）上から崩れる用
  // パーツ情報（どの要素に属しているか）
  partType?: 'flower' | 'stem' | 'leaf';  // パーツの種類
  partIndex?: number;       // パーツのインデックス（葉の場合は何番目の葉か）
  isCrumbling?: boolean;    // 崩壊中かどうか（scanYラインを超えたか）
}

/**
 * 波紋を表すインターフェース
 */
export interface Ripple {
  x: number;                // 中心X座標
  y: number;                // 中心Y座標
  radius: number;           // 現在の半径
  maxRadius: number;        // 最大半径
  alpha: number;            // 透明度
  birthTime: number;        // 生成時刻（ミリ秒）
  duration: number;         // 持続時間（ミリ秒）
}

/**
 * 描画要素を表すインターフェース
 */
export interface VisualElement {
  type: 'seed' | 'stem' | 'leaf' | 'petal';
  x: number;
  y: number;
  color: string;
  size: number;
}

/**
 * アプリケーション状態を表すインターフェース
 */
export interface AppState {
  growthState: GrowthState;
  seedPosition: Point;          // 種子の位置（画面中央下）
  stemHeight: number;
  sproutMaxLength?: number;     // SPROUT状態の最終長さ（STEM状態で使用）
  leaves: Leaf[];
  bloomProgress: number;        // 開花の進行度（0-1、イージング適用後）
  bloomProgressRaw: number;     // 開花の進行度（0-1、線形）
  particles: Particle[];
  ripples: Ripple[];            // 波紋の配列
  particlePhase: 'scatter' | 'converge';  // パーティクルの段階
  lastUpdateTime: number;
  scatterStartTime?: number;    // SCATTER状態の開始時刻（ミリ秒）
  convergeStartTime?: number;   // 収束開始時刻（ミリ秒）
  accumulatedVolume: number;    // SCATTER中の累積音量（崩れる速度の計算用）
  volumeSampleCount: number;    // 音量サンプル数
  seedResetTime?: number;       // SEED状態に戻った時刻（ミリ秒）
  bloomReadyTime?: number;      // 開花準備が整った時刻（ミリ秒、条件継続確認用）
  // 新しい成長エネルギーシステム
  growthEnergy: number;         // 成長エネルギー（音量を蓄積）
  totalEnergyCollected: number; // 開花までに集めた総エネルギー（鑑賞時間の計算用）
  witherAmount: number;         // 萎れ具合（0-1、0=元気、1=完全に萎れてU字型）
}

/**
 * 描画パラメータを表すインターフェース
 */
export interface RenderParameters {
  volume: number;
  pitch: number;
  progress: number;           // 現在の状態の進行度（0-1）
  pitchChange: number;        // 音高の変化量
  growthProgress: number;
  growthParams: GrowthParameters;
  stemHeight: number;
  leaves: Leaf[];
  particles: Particle[];
  ripples: Ripple[];          // 波紋の配列
  reduceGlow?: boolean;       // グロー効果を減らすか（オプション）
  scatterAge?: number;        // SCATTER状態の経過時間（秒）
  wipeProgress?: number;      // ワイプの進行度（0-1、音量で制御）
  particlePhase?: 'scatter' | 'converge';  // パーティクルの段階
  allParticles?: Particle[];  // 全パーツの粒子配列（花・茎・葉すべて）
  scanY?: number;             // 崩壊ライン（画面上部から下部へ移動）
  seedAlpha?: number;         // 種子の透明度（0-1、収束に応じて増加）
  rippleAlphaMultiplier?: number; // 波紋の透明度係数（0-1、収束に応じて減少）
  witherAmount?: number;      // 萎れ具合（0-1、0=元気、1=完全に萎れてU字型）
}

/**
 * AudioAnalyzerのインターフェース
 */
export interface AudioAnalyzer {
  initialize(): Promise<void>;
  getVolume(): number;
  getPitch(): number;
  isActive(): boolean;
  dispose(): void;
}
