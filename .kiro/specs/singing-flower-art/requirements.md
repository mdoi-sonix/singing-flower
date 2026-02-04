# 要件定義書

## はじめに

本システムは、ユーザーの歌声（音量と音高）に反応してインタラクティブに花が成長・開花・散るビジュアルアートを提供します。マイク入力から音声を解析し、リアルタイムで視覚的なフィードバックを生成することで、音楽と視覚芸術を融合した体験を実現します。

## 用語集

- **System**: 歌で花を育てるインタラクティブアートシステム全体
- **Audio_Analyzer**: マイク入力から音量と音高を解析するコンポーネント
- **Growth_Controller**: 音声入力に基づいて花の成長段階を管理するコンポーネント
- **Renderer**: Canvas上に花の視覚要素を描画するコンポーネント
- **State_Machine**: 花の成長段階（種子、芽、茎と葉、開花、散る）を管理する状態機械
- **Particle_System**: 花が散る際のパーティクル効果を管理するシステム
- **Rose_Curve**: バラ曲線（極座標方程式 r = a * cos(k * θ)）を用いた花びらの描画アルゴリズム

## 要件

### 要件1: 音声入力の取得と解析

**ユーザーストーリー**: ユーザーとして、マイクに向かって歌うことで、システムが私の声の音量と音高を認識し、それに応じて花が反応するようにしたい。

#### 受入基準

1. WHEN システムが起動したとき、THE System SHALL ユーザーにマイクへのアクセス許可を要求する
2. WHEN マイクアクセスが許可されたとき、THE Audio_Analyzer SHALL リアルタイムで音声データを取得する
3. WHEN 音声データが取得されたとき、THE Audio_Analyzer SHALL 音量（デシベル）を計算する
4. WHEN 音声データが取得されたとき、THE Audio_Analyzer SHALL 音高（周波数Hz）を計算する
5. THE Audio_Analyzer SHALL 少なくとも毎秒30回の頻度で音量と音高を更新する

### 要件2: 種子状態の表現

**ユーザーストーリー**: ユーザーとして、初期状態で画面中央下に小さな種子が脈動している様子を見たい。

#### 受入基準

1. WHEN システムが初期化されたとき、THE State_Machine SHALL 種子状態から開始する
2. WHILE 種子状態にあるとき、THE Renderer SHALL 画面中央下（画面高さの75%位置）に小さな円を描画する
3. WHILE 種子状態にあるとき、THE Renderer SHALL 円を周期的に拡大縮小させて脈動効果を表現する
4. WHEN 音量が閾値を超えたとき、THE Growth_Controller SHALL 種子状態から芽状態への遷移を開始する

### 要件3: 芽状態の表現

**ユーザーストーリー**: ユーザーとして、歌い始めると種子から芽が伸びる様子を見たい。

#### 受入基準

1. WHEN 種子状態から芽状態に遷移したとき、THE Renderer SHALL 種子位置（画面中央下）から上方向へ一本の線を描画する
2. WHILE 芽状態にあるとき、THE Growth_Controller SHALL 音量に応じて線の長さを増加させる
3. WHILE 芽状態にあるとき、THE Renderer SHALL 音高に応じて線の色を変化させる（高い声で明るい緑、低い声で深い緑）
4. WHILE 芽状態にあるとき、THE Renderer SHALL 音高の変化に応じて線を左右に揺らす
5. WHEN 線の長さが閾値に達したとき、THE Growth_Controller SHALL 芽状態から茎と葉状態への遷移を開始する

### 要件4: 茎と葉状態の表現

**ユーザーストーリー**: ユーザーとして、歌い続けることで茎が伸び、左右に葉が生成される様子を見たい。葉は美しくしなり、光る葉脈が走る様子を楽しみたい。

#### 受入基準

1. WHEN 芽状態から茎と葉状態に遷移したとき、THE Renderer SHALL 茎を継続的に上方向へ伸ばす
2. WHILE 茎と葉状態にあるとき、THE Growth_Controller SHALL 音量に応じて茎の成長速度を増加させる
3. WHILE 茎と葉状態にあるとき、THE Renderer SHALL 茎の左右に動的に葉を生成する
4. WHILE 茎と葉状態にあるとき、THE Growth_Controller SHALL 音量に応じて葉の生成速度を増加させる
5. WHILE 茎と葉状態にあるとき、THE Renderer SHALL 音高に応じて茎と葉の色を変化させる（高い声で明るい緑、低い声で深い緑）
6. WHILE 茎と葉状態にあるとき、THE Renderer SHALL 音高の変化に応じて茎と葉を揺らす
7. WHILE 茎と葉状態にあるとき、THE Renderer SHALL ベジェ曲線を用いて葉を描画する
8. WHILE 茎と葉状態にあるとき、THE Renderer SHALL 音高に応じて葉のベジェ曲線の制御点を調整し、葉をしならせる
9. WHILE 茎と葉状態にあるとき、THE Renderer SHALL 葉を茎に近い部分は濃い緑、先端は明るい緑のグラデーションで描画する
10. WHILE 茎と葉状態にあるとき、THE Renderer SHALL 歌っていない時も葉をゆっくりと上下に揺らす
11. WHEN 音量が閾値を超えたとき、THE Renderer SHALL 葉の中に光る葉脈を一瞬表示する
12. WHILE 葉脈が表示されているとき、THE Renderer SHALL 葉脈の明るさを徐々に減衰させる
13. WHEN 茎の長さが閾値に達したとき、THE Growth_Controller SHALL 茎と葉状態から開花状態への遷移を開始する

### 要件5: 開花状態の表現

**ユーザーストーリー**: ユーザーとして、茎が十分に成長すると花が開花し、私の声に応じて花びらが変化する様子を見たい。

#### 受入基準

1. WHEN 茎と葉状態から開花状態に遷移したとき、THE Renderer SHALL バラ曲線アルゴリズムを用いて花を描画する
2. WHEN 茎と葉状態から開花状態に遷移したとき、THE Renderer SHALL 茎と葉を継続して表示する
3. WHILE 開花状態にあるとき、THE Renderer SHALL 音量に応じて花の輝き（発光効果）を強くする
4. WHILE 開花状態にあるとき、THE Renderer SHALL 音量に応じて花びらを細かく揺らす
5. WHILE 開花状態にあるとき、THE Renderer SHALL 音高に応じてバラ曲線の係数を変化させる（高い声で花びらが細かく増え、低い声で大きくゆったりした花びらになる）
6. WHILE 開花状態にあるとき、THE Renderer SHALL 音高に応じて花の色を変化させる（高い音で淡い色、低い音で深い色）
7. WHILE 開花状態にあるとき、THE Renderer SHALL 様々な色に花を変化させる
8. WHEN 音量が散る閾値を超えたとき、THE Growth_Controller SHALL 開花状態から散る状態への遷移を開始する

### 要件6: 散る状態の表現

**ユーザーストーリー**: ユーザーとして、大きな声を出すことで花が一気に散り、パーティクルが飛散した後、種子位置に吸い寄せられて土に還る様子を見たい。

#### 受入基準

1. WHEN 開花状態から散る状態に遷移したとき、THE Particle_System SHALL 全ての描画要素をパーティクル化する
2. WHEN パーティクル化が実行されたとき、THE Particle_System SHALL 音量をパーティクルの初速度として設定する
3. WHILE 散る状態の初期段階にあるとき、THE Particle_System SHALL 音高に応じてパーティクルの移動方向を変化させる（高い声で上方向、低い声で下方向）
4. WHILE 散る状態の初期段階にあるとき、THE Renderer SHALL 各パーティクルを物理演算に基づいて移動させる
5. WHILE 散る状態の初期段階にあるとき、THE Renderer SHALL パーティクルを徐々に透明化させる
6. WHEN パーティクルの透明度が閾値（例: 0.3）に達したとき、THE Particle_System SHALL 収束段階に遷移する
7. WHILE 散る状態の収束段階にあるとき、THE Particle_System SHALL 全てのパーティクルを種子位置（画面中央下）に向かって移動させる
8. WHILE 散る状態の収束段階にあるとき、THE Particle_System SHALL 種子位置に近づくほどパーティクルの速度を増加させる
9. WHEN 全てのパーティクルが種子位置に到達したとき、THE State_Machine SHALL 散る状態から種子状態へ遷移する
10. WHEN 散る状態から種子状態へ遷移したとき、THE Renderer SHALL 種子の脈動を開始する

### 要件7: ビジュアルデザインの実装

**ユーザーストーリー**: ユーザーとして、美しい背景と残像効果により、幻想的なビジュアル体験を得たい。

#### 受入基準

1. THE Renderer SHALL 背景を中央がディープネイビー、外側がブラックの放射状グラデーションで描画する
2. THE Renderer SHALL 背景に薄い透明度を持たせることで残像効果を実現する
3. WHILE 散る状態にあるとき、THE Renderer SHALL パーティクルが光の残像を残しながら移動する効果を表現する
4. THE Renderer SHALL Canvas要素を用いて全ての描画を実行する
5. THE Renderer SHALL 少なくとも毎秒30フレームで描画を更新する

### 要件8: バラ曲線の実装

**ユーザーストーリー**: 開発者として、バラ曲線アルゴリズムを用いて美しい花びらを描画したい。

#### 受入基準

1. THE Rose_Curve SHALL 極座標方程式 r = a * cos(k * θ) を実装する
2. THE Rose_Curve SHALL パラメータ a（振幅）を調整可能にする
3. THE Rose_Curve SHALL パラメータ k（花びらの数を決定する係数）を調整可能にする
4. WHEN 音高が変化したとき、THE Rose_Curve SHALL パラメータ k を動的に変化させる
5. THE Rose_Curve SHALL 極座標から直交座標への変換を実行する

### 要件9: システムの初期化とライフサイクル

**ユーザーストーリー**: ユーザーとして、システムが正常に起動し、エラーが発生した場合は適切に通知されることを期待する。

#### 受入基準

1. WHEN システムが起動したとき、THE System SHALL Canvas要素を初期化する
2. WHEN システムが起動したとき、THE System SHALL Audio_Analyzerを初期化する
3. WHEN システムが起動したとき、THE System SHALL State_Machineを種子状態で初期化する
4. IF マイクアクセスが拒否されたとき、THEN THE System SHALL ユーザーにエラーメッセージを表示する
5. IF Web Audio APIがサポートされていないとき、THEN THE System SHALL ユーザーに互換性エラーメッセージを表示する
6. THE System SHALL アニメーションループを開始し、継続的に描画を更新する

### 要件10: レスポンシブデザイン

**ユーザーストーリー**: ユーザーとして、様々な画面サイズでアートを楽しみたい。

#### 受入基準

1. THE Renderer SHALL ウィンドウサイズに応じてCanvas要素のサイズを調整する
2. WHEN ウィンドウサイズが変更されたとき、THE Renderer SHALL Canvas要素を再初期化する
3. THE Renderer SHALL 描画要素の位置とサイズをウィンドウサイズに対する相対値で計算する
4. THE System SHALL モバイルデバイスとデスクトップの両方で動作する
