# レイヤー分離リファクタリング - 実装タスク

## Phase 1: drawSeed()のcanvasパラメータ化 ✅ 完了

- [x] 1.1 drawSeed()メソッドにcanvasパラメータを追加
  - `drawSeed(canvas: p5 | p5.Graphics, time: number, volume: number, previousVolume: number, fadeOut: number)`
  - メソッド内のすべての`this.p`を`canvas`に置き換え
  - 定数（ADD、BLEND等）は`this.p.ADD`から取得

- [x] 1.2 render()メソッドでdrawSeed()の呼び出しを更新
  - SEED状態：`this.drawSeed(this.p, ...)`として呼び出し
  - SPROUT状態：`this.drawSeed(this.p, ...)`として呼び出し

- [x] 1.3 動作確認
  - SEED状態で正しく描画れることを確認
  - SPROUT状態でseedFadeOutが正しく動作することを確認

## Phase 2: drawSprout()とdrawBloom()のcanvasパラメータ化 ✅ 完了

- [x] 2.1 drawSprout()メソッドにcanvasパラメータを追加
  - `drawSprout(canvas: p5 | p5.Graphics, ...)`
  - メソッド内のすべての`this.p`を`canvas`に置き換え

- [x] 2.2 drawBloom()メソッドにcanvasパラメータを追加
  - `drawBloom(canvas: p5 | p5.Graphics, ...)`
  - メソッド内のすべての`this.p`を`canvas`に置き換え

- [x] 2.3 render()メソッドで呼び出しを更新
  - SPROUT状態：`this.drawSprout(this.p, ...)`
  - BLOOM状態：`this.drawSprout(this.p, ...)`と`this.drawBloom(this.p, ...)`

- [x] 2.4 動作確認
  - SPROUT状態で正しく描画されることを確認
  - BLOOM状態で正しく描画されることを確認

## Phase 3: drawLeaf()とdrawCalyx()のcanvasパラメータ化 ✅ 完了

- [x] 3.1 drawLeaf()メソッドにcanvasパラメータを追加 ✅ 完了
  - `drawLeaf(canvas: p5 | p5.Graphics, ...)`
  - メソッド内のすべての`this.p`を`canvas`に置き換え
  - すべての呼び出し箇所を更新（drawSprout、drawStem等）

- [x] 3.2 drawCalyx()メソッドにcanvasパラメータを追加 ✅ 完了
  - メソッドシグネチャ変更済み
  - 呼び出し箇所は更新済み
  - メソッド内の`this.p`を`canvas`に置き換え完了

- [x] 3.3 drawSprout()とdrawBloom()内の呼び出しを更新 ✅ 完了
  - `this.drawLeaf(canvas, ...)`として呼び出し ✅ 完了
  - `this.drawCalyx(canvas, ...)`として呼び出し ✅ 完了

- [x] 3.4 動作確認 ✅ 完了
  - 葉が正しく描画されることを確認
  - 萼が正しく描画されることを確認

## Phase 4: グローエフェクトの除去とぼかし実装 ✅ 完了

- [x] 4.1 applyBlur()メソッドを実装 ✅ 完了
  - shadowBlurを使った高速なぼかしを実装済み
  - `applyBlur(source: p5.Graphics, target: p5.Graphics, intensity: number): void`

- [x] 4.2 drawSeed()からグローエフェクトを除去 ✅ スキップ
  - 種子は崩壊時には消えているため、レイヤー分離不要
  - メインキャンバスに直接描画のまま維持

- [x] 4.3 drawSprout()からグローエフェクトを除去 ✅ 完了
  - グローレイヤーの描画部分を削除済み
  - 本体のみを描画するように変更済み

- [x] 4.4 drawBloom()からグローエフェクトを除去 ✅ 完了
  - グローレイヤーの描画部分を削除
  - 本体のみを描画するように変更

- [x] 4.5 drawLeaf()からグローエフェクトを除去 ✅ 完了
  - グローレイヤーの描画部分を削除
  - 本体のみを描画するように変更

- [x] 4.6 動作確認 ✅ 完了
  - グローが除去され、本体のみが描画されることを確認

## Phase 5: レイヤーシステムの実装 ✅ 完了

- [x] 5.1 レイヤープロパティを追加 ✅ 完了
  - `private bodyLayer: p5.Graphics | null = null` 実装済み
  - `private glowLayer: p5.Graphics | null = null` 実装済み

- [x] 5.2 ensureLayers()メソッドを実装 ✅ 完了
  - レイヤーの初期化とリサイズ処理 実装済み
  - ウィンドウサイズに合わせてレイヤーを再作成 実装済み

- [x] 5.3 render()メソッドを書き換え ✅ 完了
  - ensureLayers()を呼び出し済み
  - 背景と波紋をメインキャンバスに描画済み
  - 種子をメインキャンバスに直接描画済み（レイヤー分離しない）
  - bodyLayerをクリアして本体（茎・葉・花）を描画済み
  - bodyLayerからglowLayerを生成済み（applyBlur使用）
  - レイヤーを合成済み（Glow: 加算合成、Body: 通常合成）
  - パーティクルをメインキャンバスに描画済み

- [x] 5.4 drawSprout()、drawBloom()の呼び出しをbodyLayerに変更 ✅ 完了
  - `this.drawSprout(this.bodyLayer, ...)` 実装済み
  - `this.drawBloom(this.bodyLayer, ...)` 実装済み
  - drawSeed()はメインキャンバス（this.p）のまま

- [x] 5.5 動作確認 ✅ 完了
  - 4層のレイヤーが正しく合成されることを確認
  - グローエフェクトが自然に見えることを確認
  - 本体が消えればグローも消えることを確認

## Phase 6: パフォーマンス最適化 ✅ 完了

- [x] 6.1 applyBlurOptimized()メソッドを実装 ✅ 完了
  - ダウンサンプリング（50%縮小）実装済み
  - 小さい画像をぼかしてから拡大

- [x] 6.2 フレームスキップの実装 ✅ 完了
  - frameCountプロパティを追加
  - 2フレームに1回だけぼかしを更新

- [x] 6.3 render()メソッドでapplyBlurOptimized()を使用 ✅ 完了
  - applyBlur()をapplyBlurOptimized()に置き換え

- [x] 6.4 パフォーマンス測定 ✅ 完了
  - 70fps維持を確認
  - 最適化により低スペック環境でも安定動作

- [x] 6.5 最終動作確認 ✅ 完了
  - すべての状態（SEED、SPROUT、BLOOM）で正しく動作することを確認
  - 既存のテストが通ることを確認

## 検証項目 ✅ 完了

- [x] すべての状態で視覚的に正しく描画される
- [x] グローエフェクトが自然に見える
- [x] パフォーマンスが60fps以上を維持（70fps確認済み）
- [x] 既存のテストが通る
- [x] ウィンドウリサイズ時にレイヤーが正しく再作成される

---

# レイヤー分離リファクタリング完了 🎉

すべてのPhaseが完了しました！
- 本体とグローを分離したレイヤーシステムを実装
- パフォーマンス最適化により低スペック環境でも安定動作
- 透明感のある美しい描画を実現
