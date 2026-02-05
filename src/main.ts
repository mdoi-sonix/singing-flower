import p5 from 'p5';
import { GrowthState, type AppState, type Point, type RenderParameters } from './types';
import { AudioAnalyzer as AudioAnalyzerClass } from './AudioAnalyzer';
import { StateMachine } from './StateMachine';
import { GrowthController } from './GrowthController';
import { Renderer } from './Renderer';
import { ParticleSystem } from './ParticleSystem';

/**
 * p5.jsを使ったSinging Flower Artアプリケーション
 */
const sketch = (p: p5) => {
  let state: AppState;
  let audioAnalyzer: AudioAnalyzerClass;
  let stateMachine: StateMachine;
  let growthController: GrowthController;
  let renderer: Renderer;
  let particleSystem: ParticleSystem | null = null;

  // デモモードフラグ
  let isDemoMode = false; // 初期値をOFFに変更
  let isAutoMode = true; // 自動変化モード（true）か手動設定モード（false）か
  let isAudioReady = false; // マイク初期化完了フラグ

  // 手動設定の値
  let manualVolume = 50;
  let manualPitch = 400;

  // 前フレームの値を保存（スムージング用）
  let previousVolume = 50;
  let previousPitch = 400;
  let previousPitchChange = 0;

  /**
   * 初期化
   */
  p.setup = () => {
    // Canvasを作成（ウィンドウサイズ）
    p.createCanvas(p.windowWidth, p.windowHeight);

    // 初期状態を作成
    state = createInitialState();

    // コンポーネントを初期化
    audioAnalyzer = new AudioAnalyzerClass();
    stateMachine = new StateMachine();
    growthController = new GrowthController();
    renderer = new Renderer(p);

    // フレームレートを設定
    p.frameRate(60);

    // 起動時にマイクアクセスを初期化（デモモードOFFのため）
    (async () => {
      try {
        await audioAnalyzer.initialize();
        isAudioReady = true; // 初期化完了フラグを立てる
        console.log('マイク入力モードで起動 - 初期化完了');
      } catch (error) {
        console.error('マイクアクセスエラー:', error);
        // エラーメッセージを表示
        const errorMsg = document.getElementById('error-message');
        if (errorMsg) {
          errorMsg.textContent = error instanceof Error ? error.message : 'マイクアクセスに失敗しました。デモモードをONにしてください。';
          errorMsg.classList.remove('hidden');
        }
      }
    })();

    // デモモード切り替えボタンのイベントリスナー
    const demoToggle = document.getElementById('demo-toggle');
    const demoControls = document.getElementById('demo-controls');

    if (demoToggle) {
      demoToggle.addEventListener('click', async () => {
        isDemoMode = !isDemoMode;
        demoToggle.textContent = `デモモード: ${isDemoMode ? 'ON' : 'OFF'}`;
        demoToggle.classList.toggle('active', isDemoMode);

        // デモコントロールパネルの表示/非表示
        if (demoControls) {
          demoControls.classList.toggle('visible', isDemoMode);
        }

        if (!isDemoMode) {
          // デモモードOFF：マイク入力を初期化
          try {
            console.log('[Main] マイク入力モードに切り替え中...');
            await audioAnalyzer.initialize();
            isAudioReady = true; // 初期化完了フラグを立てる
            console.log('[Main] マイク入力モードに切り替え完了');
          } catch (error) {
            console.error('[Main] マイクアクセスエラー:', error);
            // エラーメッセージを表示
            const errorMsg = document.getElementById('error-message');
            if (errorMsg) {
              errorMsg.textContent = error instanceof Error ? error.message : 'マイクアクセスに失敗しました';
              errorMsg.classList.remove('hidden');
              setTimeout(() => {
                errorMsg.classList.add('hidden');
              }, 5000);
            }
            // デモモードに戻す
            isDemoMode = true;
            isAudioReady = false;
            demoToggle.textContent = 'デモモード: ON';
            demoToggle.classList.add('active');
            if (demoControls) {
              demoControls.classList.add('visible');
            }
          }

          // スムージング用の変数をリセット（即座に0にする）
          previousVolume = 0;
          previousPitch = 440;
          previousPitchChange = 0;
        } else {
          // デモモードON：AudioAnalyzerを停止
          console.log('[Main] デモモードに切り替え、AudioAnalyzer停止中...');
          audioAnalyzer.dispose();
          isAudioReady = false;
          console.log('[Main] デモモードに切り替え完了');
        }
      });
    }

    // デモコントロールパネルのイベントリスナー
    const modeButtons = document.querySelectorAll('.mode-button');
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    const pitchSlider = document.getElementById('pitch-slider') as HTMLInputElement;
    const volumeValue = document.getElementById('volume-value');
    const pitchValue = document.getElementById('pitch-value');

    // モード切り替えボタン
    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-mode');
        isAutoMode = mode === 'auto';

        // ボタンのアクティブ状態を更新
        modeButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // 手動設定モードの場合、スライダーを有効化
        if (volumeSlider && pitchSlider) {
          volumeSlider.disabled = isAutoMode;
          pitchSlider.disabled = isAutoMode;
        }
      });
    });

    // 音量スライダー
    if (volumeSlider && volumeValue) {
      volumeSlider.addEventListener('input', () => {
        manualVolume = parseFloat(volumeSlider.value);
        volumeValue.textContent = manualVolume.toFixed(0);
      });
    }

    // ピッチスライダー
    if (pitchSlider && pitchValue) {
      pitchSlider.addEventListener('input', () => {
        manualPitch = parseFloat(pitchSlider.value);
        pitchValue.textContent = `${manualPitch.toFixed(0)} Hz`;
      });
    }

    // 初期状態でデモコントロールパネルを非表示（デモモードOFFのため）
    if (demoControls) {
      demoControls.classList.remove('visible');
    }
  };

  /**
   * 描画ループ
   */
  p.draw = () => {
    const time = p.millis();

    // SEED状態に戻った直後は5秒間待機（種子の鳴動）
    // seedResetTimeが-1の場合は初回起動なので、種子を表示
    const seedAge = state.seedResetTime === -1 ? 0 : (state.seedResetTime ? (time - state.seedResetTime) / 1000 : 999);
    const shouldWait = seedAge < 5; // 5秒間待機（種子の鳴動期間）

    // デバッグ用の変数
    let debugPitchChange = 0;

    // SEED状態：音量に応じて成長開始
    // 初回起動時（seedResetTime === -1）の場合のみ、音量で成長開始を判定
    if (state.seedResetTime === -1 && state.growthState !== GrowthState.SCATTER) {
      // SEED状態（初回起動、音量待ち）
      state.growthState = GrowthState.SEED;

      // 音量を取得（マイク初期化完了後のみ）
      let currentVolume = 0;
      if (!isDemoMode && isAudioReady) {
        currentVolume = audioAnalyzer.getVolume();
      } else if (!isDemoMode && !isAudioReady) {
        // マイク初期化中
        currentVolume = 0;
      } else if (isAutoMode) {
        currentVolume = manualVolume;
      } else {
        currentVolume = 50 + Math.sin(time / 1000) * 30; // デモモード
      }

      // 音量が一定以上（15以上）になったら成長開始
      if (currentVolume > 15) {
        state.seedResetTime = time; // 成長開始時刻を記録
        console.log('[SEED] Growth started by volume:', currentVolume);
      }

      // 種子の透明度（常に完全表示）
      const seedAlpha = 1.0;

      const params: RenderParameters = {
        volume: currentVolume,
        pitch: 440,
        progress: 0,
        pitchChange: 0,
        growthProgress: 0,
        growthParams: {
          growthSpeed: 1,
          swayAmount: 0,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        },
        stemHeight: 0,
        leaves: [],
        particles: [],
        ripples: [],
        seedAlpha: seedAlpha // 種子の透明度
      };

      renderer.render(state.growthState, params, time);

    } else if (state.seedResetTime !== -1 && seedAge < 5 && state.growthState !== GrowthState.SCATTER) {
      // SEED状態（収束後の待機中、5秒間鳴動）
      state.growthState = GrowthState.SEED;

      // 音量を取得（表示用、マイク初期化完了後のみ）
      let currentVolume = 0;
      if (!isDemoMode && isAudioReady) {
        currentVolume = audioAnalyzer.getVolume();
      } else if (!isDemoMode && !isAudioReady) {
        currentVolume = 0;
      } else if (!isAutoMode) {
        currentVolume = manualVolume;
      } else {
        currentVolume = 50 + Math.sin(time / 1000) * 30; // デモモード
      }

      // 種子の透明度（常に完全表示）
      const seedAlpha = 1.0;

      const params: RenderParameters = {
        volume: currentVolume,
        pitch: 440,
        progress: 0,
        pitchChange: 0,
        growthProgress: 0,
        growthParams: {
          growthSpeed: 1,
          swayAmount: 0,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        },
        stemHeight: 0,
        leaves: [],
        particles: [],
        ripples: [],
        seedAlpha: seedAlpha // 種子の透明度
      };

      renderer.render(state.growthState, params, time);

    } else if (state.growthState === GrowthState.SEED || state.growthState === GrowthState.SPROUT) {
      // SPROUT状態（芽が伸びる + 葉が増える）
      state.growthState = GrowthState.SPROUT;

      // すべての葉が完全に開ききったかチェック
      const allLeavesFullyOpen = state.leaves.length > 0 && state.leaves.every(leaf =>
        leaf.widthProgress >= 1.0 && leaf.rotationProgress >= 1.0
      );

      // すべての葉が開ききり、かつ茎が最大長に達したらBLOOM状態へ
      const isPortrait = p.height > p.width;
      const heightScale = isPortrait ? 0.25 : 0.35;
      const additionalScale = isPortrait ? 0.1 : 0.15;
      const maxLength = p.height * heightScale;
      const additionalGrowth = p.height * additionalScale;
      const totalMaxLength = maxLength + additionalGrowth;

      // 時間条件を削除：茎の高さと葉の開き具合だけで判定
      if (allLeavesFullyOpen && state.stemHeight >= totalMaxLength) {
        // BLOOM状態へ遷移（次のフレームでBLOOM状態の処理を行う）
        state.growthState = GrowthState.BLOOM;
        // 茎の高さを確実に保存
        state.stemHeight = totalMaxLength;
      }

      // BLOOM状態に遷移した場合は、SPROUT状態の処理をスキップ
      if (state.growthState === GrowthState.BLOOM) {
        // 何もせず、次のelse節でBLOOM状態の処理を行う
      } else {
        // SPROUT状態の処理を続行

        // 音量と音高を取得（デモモードの設定に応じて）
        let rawVolume: number;
        let rawPitch: number;
        let rawPitchChange: number;

        if (!isDemoMode) {
          // デモモードOFF：マイク入力を使用
          rawVolume = audioAnalyzer.getVolume();
          rawPitch = audioAnalyzer.getPitch() || 440; // ピッチが0の場合は440Hzをデフォルト
          rawPitchChange = 0; // 音高変化は計算が複雑なので一旦0
        } else if (!isAutoMode) {
          // 手動設定モード：スライダーの値を使用
          rawVolume = manualVolume;
          rawPitch = manualPitch;
          rawPitchChange = 0; // 手動設定時は揺れなし
        } else {
          // 自動変化モード：変則的に変化させる
          const volumeWave1 = Math.sin(time / 1000) * 5; // -5 to +5
          const volumeWave2 = Math.sin(time / 1700) * 3; // -3 to +3

          // 自動変化モード：変則的に変化させる
          rawVolume = 25 + volumeWave1 + volumeWave2; // 基準値を25に戻す（自然な成長速度）

          const pitchWave1 = Math.sin(time / 800) * 50; // -50 to +50（100→50にさらに縮小）
          const pitchWave2 = Math.sin(time / 1300) * 35; // -35 to +35（75→35にさらに縮小）
          rawPitch = 400 + pitchWave1 + pitchWave2; // テスト用：シンプルな音高変化

          rawPitchChange = Math.sin(time / 500) * 12; // テスト用：シンプルな揺れ
        }

        // スムージング（前フレームとの補間で滑らかに）
        // 慣性のような効果：風がやんでもすぐには止まらない
        const smoothingFactor = 0.05; // 5%ずつ新しい値に近づける（さらにゆっくり、8%→5%）
        const volume = previousVolume + (rawVolume - previousVolume) * smoothingFactor;
        const pitch = previousPitch + (rawPitch - previousPitch) * smoothingFactor;
        const pitchChange = previousPitchChange + (rawPitchChange - previousPitchChange) * smoothingFactor;

      // 次フレーム用に保存
      previousVolume = volume;
      previousPitch = pitch;
      previousPitchChange = pitchChange;

      // デバッグ用にrawVolumeを保存
      debugPitchChange = pitchChange;
      const debugRawVolume = rawVolume;

      // 音量に応じた成長速度（フレーム単位での成長量）
      const volumeFactor = volume / 100;

      // 成長段階に応じて速度を変える

      // 初期成長（芽）は速く、後期成長（茎）は遅く
      let baseGrowthRate: number;
      if (state.stemHeight < maxLength) {
        baseGrowthRate = 0.25; // 芽の段階：0.5→0.25に減速
      } else {
        baseGrowthRate = 0.15; // 茎の段階：0.3→0.15に減速
      }

      // 音量による成長速度の変化（音量が低いとほぼ成長しない）
      // 音量0で0倍、音量100で2倍の範囲
      const growthRate = baseGrowthRate * (volumeFactor * 2.0);

      // 累積的な成長
      if (!state.stemHeight || state.stemHeight === 0) {
        state.stemHeight = 0;
      }

      // 最大長に達していなければ成長を続ける
      if (state.stemHeight < totalMaxLength) {
        state.stemHeight = Math.min(state.stemHeight + growthRate, totalMaxLength);
      }

      const sproutLength = state.stemHeight;
      const progress = Math.min(sproutLength / maxLength, 1.0); // 0-1の進行度（芽の段階）

      // グロー効果を減らすかどうか（芽の段階が完了したら）
      const reduceGlow = sproutLength >= maxLength;

      // 葉を生成（芽が一定の長さに達したら）
      const leafStartHeight = p.height * (isPortrait ? 0.06 : 0.08); // 縦向きは6%、横向きは8%
      if (sproutLength > leafStartHeight) {
        // 葉の最大数を茎の成長度合いに応じて決定（4-8枚）
        // 茎が長く成長するほど葉が多くなる（累積的な成長）
        const growthRatio = sproutLength / totalMaxLength; // 0-1（茎の成長度合い）
        const maxLeaves = Math.floor(4 + growthRatio * 4); // 4-8枚（成長に応じて増加）

        const newLeaf = renderer.generateLeaf(sproutLength, leafStartHeight, volume, pitch, state.leaves);
        if (newLeaf && state.leaves.length < maxLeaves) {
          state.leaves.push(newLeaf);
        }
      }

      // 葉の更新（3段階の成長アニメーション + 震え）
      // 下の葉から順番に開くように、葉のインデックスに応じて展開開始を遅らせる
      const veinThreshold = 55;
      for (let i = 0; i < state.leaves.length; i++) {
        const leaf = state.leaves[i];

        // 音量が高い時に葉脈を光らせる
        if (volume > veinThreshold) {
          leaf.veinBrightness = 1;
        } else {
          leaf.veinBrightness *= 0.95;
          if (leaf.veinBrightness < 0.01) {
            leaf.veinBrightness = 0;
          }
        }

        const leafAge = (time - leaf.birthTime) / 1000; // 秒単位

        // 下の葉から順番に開くように、インデックスに応じた遅延を追加
        // 各葉は前の葉が長さ成長を完了してから開き始める
        const sequentialDelay = i * 0.5; // 各葉は0.5秒ずつ遅れて開始

        // Step 1: Length（長さを伸ばす）- 0-0.7秒（遅延後）
        const lengthDuration = 0.7;
        const adjustedLeafAge = Math.max(0, leafAge - sequentialDelay);

        if (adjustedLeafAge < lengthDuration) {
          leaf.lengthProgress = Math.min(1, adjustedLeafAge / lengthDuration);
          leaf.widthProgress = 0; // 幅はまだ0
          leaf.rotationProgress = 0; // 角度もまだ0
        }
        // Step 2 & 3: Unfold + Rotation（幅を広げて角度を倒す）- 0.7秒 + unfoldDelay から開始
        else {
          leaf.lengthProgress = 1; // 長さは完成
          const unfoldStartTime = lengthDuration + leaf.unfoldDelay;

          if (adjustedLeafAge >= unfoldStartTime) {
            const unfoldAge = adjustedLeafAge - unfoldStartTime;
            const unfoldDuration = 0.8; // 0.8秒かけて展開
            const unfoldProgress = Math.min(1, unfoldAge / unfoldDuration);

            // イージング関数で滑らかに展開（加速→減速）
            const eased = unfoldProgress * unfoldProgress * (3 - 2 * unfoldProgress); // smoothstep

            // 開く瞬間の震え（音量に応じて）
            let tremble = 0;
            if (unfoldProgress < 0.3) { // 最初の30%で震える
              const trembleProgress = unfoldProgress / 0.3; // 0-1
              const volumeFactor = volume / 100;
              const trembleAmount = volumeFactor * 0.15; // 音量が大きいほど震える（最大15%）
              // sin波で震える（周波数を高めに）
              tremble = Math.sin(trembleProgress * Math.PI * 8) * trembleAmount * (1 - trembleProgress);
            }

            leaf.widthProgress = Math.min(1, eased + tremble);
            leaf.rotationProgress = eased;
          }
        }

        // 旧unfurlProgressも更新（互換性のため）
        const totalDuration = 1.5 + leaf.unfoldDelay + sequentialDelay;
        leaf.unfurlProgress = Math.min(1, leafAge / totalDuration);
      }

      // パーティクルを生成（音量と揺れに応じて）- 控えめに
      const seedPos = renderer.getSeedPosition();
      const flowerCenterX = seedPos.x + pitchChange * 0.5;
      const flowerCenterY = seedPos.y - sproutLength;

      // 波紋を生成
      // 1. 音量が高い時に地面から広がる（強い波紋）
      if (volume > 35 && Math.random() < 0.1) { // 音量35以上で10%の確率
        const newRipple = renderer.generateRipple(seedPos.x, seedPos.y, volume, time);
        state.ripples.push(newRipple);
      }
      // 2. 音がない時も時々アンビエント波紋（弱い波紋、地面感を出す）
      else if (Math.random() < 0.02) { // 2%の確率で静かな波紋
        const ambientVolume = 20 + Math.random() * 20; // 20-40の弱い音量
        const newRipple = renderer.generateRipple(seedPos.x, seedPos.y, ambientVolume, time);
        state.ripples.push(newRipple);
      }

      // 波紋を更新
      renderer.updateRipples(state.ripples, time);

      // パーティクルの数を制限（最大100個）- 削減
      const maxParticles = 100; // 150→100

      // 音量が高い時や揺れが大きい時にパーティクルを放出
      if ((volume > 45 || Math.abs(pitchChange) > 30) && state.particles.length < maxParticles) {
        const particleCount = Math.floor(volumeFactor * 1.5); // 0-1.5個（2→1.5に削減）
        if (Math.random() < 0.2) { // 20%の確率（30%→20%に削減）
          const newParticles = renderer.generateParticles(
            flowerCenterX,
            flowerCenterY,
            particleCount,
            pitch,
            volume,
            time
          );
          state.particles.push(...newParticles);
        }
      }

      // パーティクルを更新
      renderer.updateParticles(state.particles, time, 1/60);

      const params: RenderParameters = {
        volume: volume,
        pitch: pitch,
        progress: progress,
        pitchChange: pitchChange,
        growthProgress: 0,
        growthParams: {
          growthSpeed: 1,
          swayAmount: 0,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        },
        stemHeight: sproutLength,
        leaves: state.leaves,
        particles: state.particles,
        ripples: state.ripples,
        reduceGlow: reduceGlow // グロー制御フラグを追加
      };

      renderer.render(state.growthState, params, time);
      } // SPROUT状態の処理終了

    } else {
      // BLOOM状態（花が咲く）またはその他の状態
      // SCATTER状態の場合は後で処理するのでここではスキップ
      if (state.growthState !== GrowthState.SCATTER) {
        state.growthState = GrowthState.BLOOM;
      } else {
        // SCATTER状態の場合は何もしない（後で処理）
      }

      // BLOOM状態の処理
      if (state.growthState === GrowthState.BLOOM) {

      // 開花アニメーション（時間経過のみを追跡、サイズ制御には使わない）
      // 最初の5秒：ガクのみ成長（0-0.2）
      // 5秒以降：花びら表示（0.2-1.0）
      // 合計30秒間花を表示してからSCATTER状態に遷移
      if (state.bloomProgressRaw === undefined || state.bloomProgressRaw === 0) {
        state.bloomProgressRaw = 0;
      }

      const bloomDuration = 10; // 10秒間花を表示
      const bloomSpeed = 1 / (bloomDuration * 60); // 60fps想定

      if (state.bloomProgressRaw < 1) {
        state.bloomProgressRaw = Math.min(1, state.bloomProgressRaw + bloomSpeed);
      }

      // bloomProgressは時間経過のみを表す（0-1）
      state.bloomProgress = state.bloomProgressRaw;

      // 音量と音高をシミュレート（SPROUT状態から滑らかに遷移）
      // BLOOM状態に入ってからの経過時間（bloomProgressを使用）
      const transitionProgress = state.bloomProgress; // bloomProgressをそのまま使用（0-1）

      // 音量・ピッチの遷移にはイージングを適用しない（bloomProgressが既にイージング済み）
      const eased = transitionProgress;

      let rawBloomVolume: number;
      let rawBloomPitch: number;
      let bloomPitchChange: number;

      if (!isDemoMode) {
        // デモモードOFF：マイク入力を使用
        rawBloomVolume = audioAnalyzer.getVolume();
        rawBloomPitch = audioAnalyzer.getPitch() || 440;
        bloomPitchChange = 0;
      } else if (!isAutoMode) {
        // 手動設定モード：スライダーの値を使用
        rawBloomVolume = manualVolume;
        rawBloomPitch = manualPitch;
        bloomPitchChange = 0; // 手動設定時は揺れなし
      } else {
        // 自動変化モード
        // SPROUT状態の最後の値（調整後の変則的なパターンを維持）
        const volumeWave1 = Math.sin(time / 1000) * 5; // -5 to +5
        const volumeWave2 = Math.sin(time / 1700) * 3; // -3 to +3
        const sproutVolume = 25 + volumeWave1 + volumeWave2; // 17-33（調整後の値）

        const pitchWave1 = Math.sin(time / 800) * 50; // -50 to +50
        const pitchWave2 = Math.sin(time / 1300) * 35; // -35 to +35
        const sproutPitch = 400 + pitchWave1 + pitchWave2; // 315-485Hz

        const sproutPitchChange = Math.sin(time / 500) * 12; // ±12

        // BLOOM状態の目標値（開花後も活発に動くが、SPROUT状態と同じくらいの音量範囲）
        const bloomBaseVolume = 30 + Math.sin(time / 1500) * 10; // 20-40（SPROUT状態に近い範囲）
        const bloomBasePitch = 400 + Math.sin(time / 1200) * 200; // 200-600Hz（大幅に拡大）
        const bloomBasePitchChange = Math.sin(time / 800) * 40; // ±40（大幅に拡大）

        // BLOOM状態でも急激な変化を追加（12秒サイクル: 4秒静か → 2秒急激 → 2秒静か → 4秒無音）
        const bloomSuddenPhase = Math.floor((time / 1000) % 12); // 0-11の12秒サイクル
        let bloomSuddenVolume = 0;
        let bloomSuddenPitch = 0;
        let bloomSilenceMultiplier = 1.0;

        if (bloomSuddenPhase < 4) {
          // 0-4秒: 静かで低い（通常）
          bloomSuddenVolume = 0;
          bloomSuddenPitch = 0;
          bloomSilenceMultiplier = 1.0;
        } else if (bloomSuddenPhase < 6) {
          // 4-6秒: 急激に大きく・高く（2秒間）- 音量の変化を抑える
          const suddenT = (bloomSuddenPhase - 4) / 2; // 0-1
          bloomSuddenVolume = 20 * Math.sin(suddenT * Math.PI); // 0-20-0（60から減少）
          bloomSuddenPitch = 400 * Math.sin(suddenT * Math.PI); // 0-400-0（変更なし）
          bloomSilenceMultiplier = 1.0;
        } else if (bloomSuddenPhase < 8) {
          // 6-8秒: また静かに戻る
          bloomSuddenVolume = 0;
          bloomSuddenPitch = 0;
          bloomSilenceMultiplier = 1.0;
        } else {
          // 8-12秒: ほぼ無音（4秒間）
          const silenceT = (bloomSuddenPhase - 8) / 4; // 0-1
          bloomSilenceMultiplier = 0.1 + Math.sin(silenceT * Math.PI) * 0.1; // 0.1-0.2の範囲
          bloomSuddenVolume = 0;
          bloomSuddenPitch = 0;
        }

        rawBloomVolume = (bloomBaseVolume + bloomSuddenVolume) * bloomSilenceMultiplier;
        rawBloomPitch = (bloomBasePitch + bloomSuddenPitch) * bloomSilenceMultiplier + (1 - bloomSilenceMultiplier) * 200;
        bloomPitchChange = bloomBasePitchChange * bloomSilenceMultiplier;
      }

      // スムージング適用後の値で遷移（慣性効果を維持）
      const smoothingFactor = 0.05; // SPROUT状態と同じ係数

      // SPROUT状態の最後の値（手動設定モードの場合も考慮）
      let smoothedSproutVolume: number;
      let smoothedSproutPitch: number;
      let smoothedSproutPitchChange: number;

      if (!isDemoMode) {
        // デモモードOFFの場合、SPROUT状態の値もマイク入力
        const micVolume = audioAnalyzer.getVolume();
        const micPitch = audioAnalyzer.getPitch() || 440;
        smoothedSproutVolume = previousVolume + (micVolume - previousVolume) * smoothingFactor;
        smoothedSproutPitch = previousPitch + (micPitch - previousPitch) * smoothingFactor;
        smoothedSproutPitchChange = previousPitchChange + (0 - previousPitchChange) * smoothingFactor;
      } else if (!isAutoMode) {
        // 手動設定モードの場合、SPROUT状態の値も手動設定値
        smoothedSproutVolume = previousVolume + (manualVolume - previousVolume) * smoothingFactor;
        smoothedSproutPitch = previousPitch + (manualPitch - previousPitch) * smoothingFactor;
        smoothedSproutPitchChange = previousPitchChange + (0 - previousPitchChange) * smoothingFactor;
      } else {
        // 自動変化モードの場合
        const volumeWave1 = Math.sin(time / 1000) * 5;
        const volumeWave2 = Math.sin(time / 1700) * 3;
        const sproutVolume = 25 + volumeWave1 + volumeWave2;

        const pitchWave1 = Math.sin(time / 800) * 50;
        const pitchWave2 = Math.sin(time / 1300) * 35;
        const sproutPitch = 400 + pitchWave1 + pitchWave2;

        const sproutPitchChange = Math.sin(time / 500) * 12;

        smoothedSproutVolume = previousVolume + (sproutVolume - previousVolume) * smoothingFactor;
        smoothedSproutPitch = previousPitch + (sproutPitch - previousPitch) * smoothingFactor;
        smoothedSproutPitchChange = previousPitchChange + (sproutPitchChange - previousPitchChange) * smoothingFactor;
      }

      const smoothedBloomVolume = previousVolume + (rawBloomVolume - previousVolume) * smoothingFactor;
      const smoothedBloomPitch = previousPitch + (rawBloomPitch - previousPitch) * smoothingFactor;
      const smoothedBloomPitchChange = previousPitchChange + (bloomPitchChange - previousPitchChange) * smoothingFactor;

      // 徐々に遷移
      const volume = smoothedSproutVolume * (1 - eased) + smoothedBloomVolume * eased;
      const pitch = smoothedSproutPitch * (1 - eased) + smoothedBloomPitch * eased;
      const pitchChange = smoothedSproutPitchChange * (1 - eased) + smoothedBloomPitchChange * eased;

      // 次フレーム用に保存
      previousVolume = volume;
      previousPitch = pitch;
      previousPitchChange = pitchChange;

      // 茎の高さはSPROUT状態で到達した値を保持（強制的に伸ばさない）
      // state.stemHeightはそのまま維持

      // 葉の更新（3段階の成長アニメーション + 震え）
      // 下の葉から順番に開くように、葉のインデックスに応じて展開開始を遅らせる
      const veinThreshold = 55;
      for (let i = 0; i < state.leaves.length; i++) {
        const leaf = state.leaves[i];

        if (volume > veinThreshold) {
          leaf.veinBrightness = 1;
        } else {
          leaf.veinBrightness *= 0.95;
          if (leaf.veinBrightness < 0.01) {
            leaf.veinBrightness = 0;
          }
        }

        const leafAge = (time - leaf.birthTime) / 1000; // 秒単位

        // 下の葉から順番に開くように、インデックスに応じた遅延を追加
        const sequentialDelay = i * 0.5; // 各葉は0.5秒ずつ遅れて開始

        // Step 1: Length（長さを伸ばす）- 0-0.7秒（遅延後）
        const lengthDuration = 0.7;
        const adjustedLeafAge = Math.max(0, leafAge - sequentialDelay);

        if (adjustedLeafAge < lengthDuration) {
          leaf.lengthProgress = Math.min(1, adjustedLeafAge / lengthDuration);
          leaf.widthProgress = 0;
          leaf.rotationProgress = 0;
        }
        // Step 2 & 3: Unfold + Rotation（幅を広げて角度を倒す）- 0.7秒 + unfoldDelay から開始
        else {
          leaf.lengthProgress = 1;
          const unfoldStartTime = lengthDuration + leaf.unfoldDelay;

          if (adjustedLeafAge >= unfoldStartTime) {
            const unfoldAge = adjustedLeafAge - unfoldStartTime;
            const unfoldDuration = 0.8;
            const unfoldProgress = Math.min(1, unfoldAge / unfoldDuration);

            const eased = unfoldProgress * unfoldProgress * (3 - 2 * unfoldProgress);

            // 開く瞬間の震え
            let tremble = 0;
            if (unfoldProgress < 0.3) {
              const trembleProgress = unfoldProgress / 0.3;
              const volumeFactor = volume / 100;
              const trembleAmount = volumeFactor * 0.15;
              tremble = Math.sin(trembleProgress * Math.PI * 8) * trembleAmount * (1 - trembleProgress);
            }

            leaf.widthProgress = Math.min(1, eased + tremble);
            leaf.rotationProgress = eased;
          }
        }

        const totalDuration = 1.5 + leaf.unfoldDelay + sequentialDelay;
        leaf.unfurlProgress = Math.min(1, leafAge / totalDuration);
      }

      // パーティクルを生成（開花時は派手に、普段は控えめに）
      const seedPos = renderer.getSeedPosition();
      const volumeFactorForUndulation = volume / 100;
      const undulationAmount = volumeFactorForUndulation * 30;
      const stemTipT = 1.0; // 茎の先端位置
      const wave1 = Math.sin(stemTipT * Math.PI * 2) * undulationAmount * 0.6;
      const wave2 = Math.sin(stemTipT * Math.PI * 4 + Math.PI / 3) * undulationAmount * 0.3;
      const wave3 = Math.sin(stemTipT * Math.PI * 6 + Math.PI / 2) * undulationAmount * 0.1;
      const undulationX = (wave1 + wave2 + wave3) * stemTipT;
      const swayAmount = pitchChange * 0.5;
      const flowerCenterX = seedPos.x + swayAmount + undulationX;
      const flowerCenterY = seedPos.y - state.stemHeight;

      // 波紋を生成
      // 1. 音量が高い時に地面から広がる（強い波紋）
      if (volume > 35 && Math.random() < 0.1) { // 音量35以上で10%の確率
        const newRipple = renderer.generateRipple(seedPos.x, seedPos.y, volume, time);
        state.ripples.push(newRipple);
      }
      // 2. 音がない時も時々アンビエント波紋（弱い波紋、地面感を出す）
      else if (Math.random() < 0.02) { // 2%の確率で静かな波紋
        const ambientVolume = 20 + Math.random() * 20; // 20-40の弱い音量
        const newRipple = renderer.generateRipple(seedPos.x, seedPos.y, ambientVolume, time);
        state.ripples.push(newRipple);
      }

      // 波紋を更新
      renderer.updateRipples(state.ripples, time);

      // パーティクルの数を制限（最大150個）- 削減
      const maxParticles = 150; // 250→150

      // 開花中は派手にパーティクルを放出（ただし初期は控えめにしてガクを見せる）
      if (state.bloomProgress < 1.0 && state.particles.length < maxParticles) {
        let bloomParticleCount: number;
        let probability: number;

        if (state.bloomProgress < 0.4) {
          // 開花初期（0-40%）: ガクを見せるため控えめに
          bloomParticleCount = Math.floor(1 + state.bloomProgress * 4); // 1-2.6個（5→4に削減）
          probability = 0.12; // 12%の確率（15%→12%に削減）
        } else {
          // 開花中期以降（40-100%）: 派手に
          bloomParticleCount = Math.floor(4 + (state.bloomProgress - 0.4) * 10); // 4-10個（6-15→4-10に削減）
          probability = 0.28; // 28%の確率（35%→28%に削減）
        }

        if (Math.random() < probability) {
          const newParticles = renderer.generateParticles(
            flowerCenterX,
            flowerCenterY,
            bloomParticleCount,
            pitch,
            volume,
            time
          );
          state.particles.push(...newParticles);
        }
      }
      // 開花後も音量と揺れに応じて少量放出
      else if ((volume > 45 || Math.abs(pitchChange) > 30) && state.particles.length < maxParticles) {
        const particleCount = Math.floor(volumeFactorForUndulation * 2); // 0-2個（3→2に削減）
        if (Math.random() < 0.2) { // 20%の確率（25%→20%に削減）
          const newParticles = renderer.generateParticles(
            flowerCenterX,
            flowerCenterY,
            particleCount,
            pitch,
            volume,
            time
          );
          state.particles.push(...newParticles);
        }
      }

      // パーティクルを更新
      renderer.updateParticles(state.particles, time, 1/60);

      // BLOOM状態が完全に開花してから、音量に応じてSCATTER状態に遷移
      if (!state.scatterStartTime && state.bloomProgress >= 1.0) {
        // 累積音量をカウント（SCATTER開始の判定用）
        if (!state.convergeStartTime) {
          state.convergeStartTime = time; // 開花完了時刻を記録
          state.accumulatedVolume = 0;
          state.volumeSampleCount = 0;
        }

        // 音量を累積（平均音量を計算）
        state.accumulatedVolume += volume;
        state.volumeSampleCount++;
        const averageVolume = state.accumulatedVolume / state.volumeSampleCount;

        const timeSinceFullBloom = (time - state.convergeStartTime) / 1000;

        // 一定時間経過（10秒）または平均音量が低い（15以下）場合にSCATTER状態に遷移
        // 余韻を長くするため、時間を3秒→10秒に延長、音量閾値を20→15に下げる
        if (timeSinceFullBloom > 10 || averageVolume < 15) {
          state.growthState = GrowthState.SCATTER;
          state.scatterStartTime = time;
          state.particlePhase = 'scatter';
          state.accumulatedVolume = 0; // リセット（SCATTER中の音量追跡用）
          state.volumeSampleCount = 0;
          state.convergeStartTime = undefined; // リセット（SCATTER中の収束判定用）
          console.log('[SCATTER] Transition to SCATTER state');
        }
      }

      // BLOOM状態の描画
      const params: RenderParameters = {
        volume: volume,
        pitch: pitch,
        progress: 1.0,
        pitchChange: pitchChange,
        growthProgress: state.bloomProgress, // 開花進行度を渡す
        growthParams: {
          growthSpeed: 1,
          swayAmount: 0,
          colorHue: 120,
          colorSaturation: 60,
          colorLightness: 50
        },
        stemHeight: state.stemHeight,
        leaves: state.leaves,
        particles: state.particles,
        ripples: state.ripples
      };

      // 通常描画
      renderer.render(state.growthState, params, time);
      } // BLOOM状態の処理終了
    } // else ブロック終了（BLOOM状態またはその他の状態）

    // SCATTER状態の処理
    if (state.growthState === GrowthState.SCATTER) {
      const scatterAge = state.scatterStartTime ? (time - state.scatterStartTime) / 1000 : 0;

      // SCATTER状態に入った直後、SCATTER以外のパーティクルを削除
      if (scatterAge < 0.1) {
        const scatterParticles = state.particles.filter(p => p.isScatter);
        state.particles.length = 0;
        state.particles.push(...scatterParticles);
        console.log(`[SCATTER] Removed non-scatter particles, remaining: ${state.particles.length}`);
      }

      // SCATTER状態の音量・ピッチシミュレーション
      let targetVolume: number;
      let targetPitch: number;

      if (!isDemoMode) {
        // デモモードOFF：マイク入力を使用
        targetVolume = audioAnalyzer.getVolume();
        targetPitch = audioAnalyzer.getPitch() || 440;
      } else if (!isAutoMode) {
        // 手動設定モード：スライダーの値を使用
        targetVolume = manualVolume;
        targetPitch = manualPitch;
      } else {
        // 自動変化モード
        // 【テスト用】散り始めは高い声、その後ピッチを変化させて違いを確認
        // 周期: 0-5秒（高い声+大音量）→ 5-10秒（低い声+大音量）→ 10-15秒（高い声+小音量）→ 15-20秒（低い声+小音量）
        const scatterCycle = scatterAge % 20;

        if (scatterCycle < 5) {
          // 0-5秒: 高い声（700Hz）+ 大音量（70-80）- 散り始め
          targetVolume = 75 + Math.sin(scatterAge * 2) * 5;
          targetPitch = 700 + Math.sin(scatterAge * 3) * 50; // 650-750Hz
        } else if (scatterCycle < 10) {
          // 5-10秒: 低い声（250Hz）+ 大音量（70-80）
          targetVolume = 75 + Math.sin(scatterAge * 2) * 5;
          targetPitch = 250 + Math.sin(scatterAge * 3) * 30; // 220-280Hz
        } else if (scatterCycle < 15) {
          // 10-15秒: 高い声（700Hz）+ 小音量（20-30）
          targetVolume = 25 + Math.sin(scatterAge * 2) * 5;
          targetPitch = 700 + Math.sin(scatterAge * 3) * 50; // 650-750Hz
        } else {
          // 15-20秒: 低い声（250Hz）+ 小音量（20-30）
          targetVolume = 25 + Math.sin(scatterAge * 2) * 5;
          targetPitch = 250 + Math.sin(scatterAge * 3) * 30; // 220-280Hz
        }
      }

      const bloomPitchChange = Math.sin(time / 800) * 40;

      // スムージングを適用
      const smoothingFactor = 0.05;

      const volume = previousVolume + (targetVolume - previousVolume) * smoothingFactor;
      const pitch = previousPitch + (targetPitch - previousPitch) * smoothingFactor;
      const pitchChange = previousPitchChange + (bloomPitchChange - previousPitchChange) * 0.05;

      previousVolume = volume;
      previousPitch = pitch;
      previousPitchChange = pitchChange;

      // 音量を累積してワイプ速度を計算
      state.accumulatedVolume += volume;
      state.volumeSampleCount++;
      const averageVolume = state.accumulatedVolume / state.volumeSampleCount;

      // ワイプの進行度を音量で制御（音量が高いほど速く崩壊）
      // 平均音量20-80の範囲で、5-15秒かけて崩壊
      const minDuration = 5; // 最速5秒（音量80以上）
      const maxDuration = 15; // 最遅15秒（音量20以下）
      const volumeFactor = Math.max(0, Math.min(1, (averageVolume - 20) / 60)); // 20-80を0-1に正規化
      const scatterDuration = maxDuration - volumeFactor * (maxDuration - minDuration);

      // ワイプ完了判定
      const wipeProgress = Math.min(1, scatterAge / scatterDuration);
      const wipeCompleted = wipeProgress >= 1.0;

      // ワイプ完了後、収束開始時刻を記録
      if (wipeCompleted && !state.convergeStartTime) {
        state.convergeStartTime = time;
        console.log('[SCATTER] Wipe completed, particles converging to seed');
      }

      // SCATTER状態のパーティクル数をカウント
      const scatterParticleCount = state.particles.filter(p => p.isScatter).length;

      // 収束完了判定（SCATTER状態のパーティクルが全て消滅したら、またはタイムアウト）
      const convergeAge = state.convergeStartTime ? (time - state.convergeStartTime) / 1000 : 0;
      const convergeTimeout = 12; // 最大12秒で収束完了（種子が完全に現れてから余裕を持たせる）

      // 種子が完全に現れてから（5秒後）、さらに1秒待ってから遷移
      const seedFullyVisible = convergeAge >= 6;

      if (state.convergeStartTime && seedFullyVisible && (scatterParticleCount === 0 || convergeAge > convergeTimeout)) {
        // 収束完了：SEED状態に移行（種子はそのまま、鳴動開始）
        state.growthState = GrowthState.SEED;
        state.scatterStartTime = undefined;
        state.convergeStartTime = undefined;
        state.particlePhase = 'scatter';
        state.leaves = [];
        state.stemHeight = 0;
        state.bloomProgress = 0;
        state.bloomProgressRaw = 0;
        state.seedResetTime = time; // SEED状態に戻った時刻を記録（鳴動開始）

        // 累積音量をリセット
        state.accumulatedVolume = 0;
        state.volumeSampleCount = 0;

        // パーティクルをクリア（種子はRenderer側で描画）
        state.particles.length = 0;
        state.particles = [];

        // 波紋をクリア
        state.ripples.length = 0;
        state.ripples = [];

        // キャッシュをクリア
        renderer.clearCache();

        console.log('[SCATTER] Converged to SEED state, seed pulsing for 5 seconds before growth');
      } else {
        // 葉の更新（BLOOM状態と同じ）
        const veinThreshold = 55;
        for (let i = 0; i < state.leaves.length; i++) {
          const leaf = state.leaves[i];

          if (volume > veinThreshold) {
            leaf.veinBrightness = 1;
          } else {
            leaf.veinBrightness *= 0.95;
            if (leaf.veinBrightness < 0.01) {
              leaf.veinBrightness = 0;
            }
          }

          const leafAge = (time - leaf.birthTime) / 1000;
          const sequentialDelay = i * 0.5;
          const lengthDuration = 0.7;
          const adjustedLeafAge = Math.max(0, leafAge - sequentialDelay);

          if (adjustedLeafAge < lengthDuration) {
            leaf.lengthProgress = Math.min(1, adjustedLeafAge / lengthDuration);
            leaf.widthProgress = 0;
            leaf.rotationProgress = 0;
          } else {
            leaf.lengthProgress = 1;
            const unfoldStartTime = lengthDuration + leaf.unfoldDelay;

            if (adjustedLeafAge >= unfoldStartTime) {
              const unfoldAge = adjustedLeafAge - unfoldStartTime;
              const unfoldDuration = 0.8;
              const unfoldProgress = Math.min(1, unfoldAge / unfoldDuration);

              const eased = unfoldProgress * unfoldProgress * (3 - 2 * unfoldProgress);

              let tremble = 0;
              if (unfoldProgress < 0.3) {
                const trembleProgress = unfoldProgress / 0.3;
                const volumeFactor = volume / 100;
                const trembleAmount = volumeFactor * 0.15;
                tremble = Math.sin(trembleProgress * Math.PI * 8) * trembleAmount * (1 - trembleProgress);
              }

              leaf.widthProgress = Math.min(1, eased + tremble);
              leaf.rotationProgress = eased;
            }
          }

          const totalDuration = 1.5 + leaf.unfoldDelay + sequentialDelay;
          leaf.unfurlProgress = Math.min(1, leafAge / totalDuration);
        }

        // 波紋を生成（ワイプ完了前のみ）
        const seedPos = renderer.getSeedPosition();

        if (!wipeCompleted) {
          // 1. 音量が高い時に地面から広がる（強い波紋）
          if (volume > 35 && Math.random() < 0.1) {
            const newRipple = renderer.generateRipple(seedPos.x, seedPos.y, volume, time);
            state.ripples.push(newRipple);
          }
          // 2. 音がない時も時々アンビエント波紋（弱い波紋、地面感を出す）
          else if (Math.random() < 0.02) {
            const ambientVolume = 20 + Math.random() * 20;
            const newRipple = renderer.generateRipple(seedPos.x, seedPos.y, ambientVolume, time);
            state.ripples.push(newRipple);
          }
        }

        // 波紋を更新
        renderer.updateRipples(state.ripples, time);

        // 種子の透明度を計算（収束の進行度に応じて増加）
        let seedAlpha = 0;
        let rippleAlphaMultiplier = 1.0; // 波紋の透明度係数（デフォルトは1.0）

        // ワイプ完了後から波紋を徐々に消す
        if (wipeCompleted) {
          // ワイプ完了時点から3秒かけて波紋を消す
          const fadeOutDuration = 3;
          const fadeOutProgress = Math.min(1, convergeAge / fadeOutDuration);
          rippleAlphaMultiplier = Math.max(0, 1.0 - fadeOutProgress);
        }

        if (state.convergeStartTime) {
          const convergeProgress = Math.min(1, convergeAge / 5); // 5秒かけて種子が現れる（3秒→5秒）
          // イージング関数を適用（ease-in-out）
          const eased = convergeProgress < 0.5
            ? 2 * convergeProgress * convergeProgress
            : 1 - Math.pow(-2 * convergeProgress + 2, 2) / 2;
          seedAlpha = eased;
        }

        // SCATTER状態の描画（アニメーション付き）
        const params: RenderParameters = {
          volume: volume,
          pitch: pitch,
          progress: 1.0,
          pitchChange: pitchChange,
          growthProgress: 1.0,
          growthParams: {
            growthSpeed: 1,
            swayAmount: 0,
            colorHue: 120,
            colorSaturation: 60,
            colorLightness: 50
          },
          stemHeight: state.stemHeight,
          leaves: state.leaves,
          particles: state.particles,
          ripples: state.ripples,
          scatterAge: scatterAge,
          wipeProgress: wipeProgress, // 音量で制御されたワイプ進行度
          particlePhase: state.particlePhase,
          seedAlpha: seedAlpha, // 種子の透明度
          rippleAlphaMultiplier: rippleAlphaMultiplier // 波紋の透明度係数
        };

        renderer.render(state.growthState, params, time);
      }
    }

    // 状態表示（デバッグ用）
    p.fill(255);
    p.noStroke();
    p.textSize(16);

    // サイクル時間を表示（SEED状態からの経過時間）
    let cycleTime = 0;
    if (state.seedResetTime && state.seedResetTime !== -1) {
      cycleTime = (time - state.seedResetTime) / 1000;
    }

    // モード表示を追加
    const modeText = isDemoMode ? 'デモモード' : 'マイク入力モード';
    const modeColor = isDemoMode ? [255, 200, 0] : [0, 255, 100]; // デモ=黄色、マイク=緑
    p.fill(modeColor[0], modeColor[1], modeColor[2]);
    p.text(`[${modeText}]`, 10, 10);
    p.fill(255); // 白に戻す

    p.text(`State: ${state.growthState} (${cycleTime.toFixed(1)}s)`, 10, 30);

    // SEED状態の場合も音量を表示
    if (state.growthState === GrowthState.SEED) {
      // 現在の音量を取得（マイク初期化完了後のみ）
      let currentVolume = 0;
      if (!isDemoMode && isAudioReady) {
        currentVolume = audioAnalyzer.getVolume();
      } else if (!isDemoMode && !isAudioReady) {
        // マイク初期化中
        p.fill(255, 200, 0); // 黄色
        p.text('マイク初期化中...', 10, 50);
        p.fill(255); // 白に戻す
        return; // 初期化完了まで待つ
      } else if (!isAutoMode) {
        currentVolume = manualVolume;
      } else {
        currentVolume = 50 + Math.sin(time / 1000) * 30;
      }

      p.text(`Volume: ${currentVolume.toFixed(0)} (閾値: 15)`, 10, 50);

      // 閾値に達しているかどうかを表示
      if (currentVolume > 15) {
        p.fill(0, 255, 0); // 緑色
        p.text('✓ 成長開始！', 10, 70);
        p.fill(255); // 白に戻す
      } else {
        p.fill(255, 200, 0); // 黄色
        p.text('音を出してください...', 10, 70);
        p.fill(255); // 白に戻す
      }
    }
    // SPROUT/BLOOM/SCATTER状態の場合は音高と音量も表示
    else if (state.growthState === GrowthState.SPROUT || state.growthState === GrowthState.BLOOM || state.growthState === GrowthState.SCATTER) {
      // 実際に使用されている値を表示
      const displayVolume = previousVolume;
      const displayPitch = previousPitch;

      // マイク入力モードの場合は生の音量も表示
      if (!isDemoMode) {
        const rawVol = audioAnalyzer.getVolume();
        p.fill(0, 255, 100); // 緑色
        p.text(`マイク音量(生): ${rawVol.toFixed(1)}`, 10, 50);
        p.fill(255); // 白に戻す
        p.text(`Pitch: ${displayPitch.toFixed(0)}Hz`, 10, 70);
        p.text(`Volume(スムージング後): ${displayVolume.toFixed(0)}`, 10, 90);
      } else {
        p.text(`Pitch: ${displayPitch.toFixed(0)}Hz`, 10, 50);
        p.text(`Volume: ${displayVolume.toFixed(0)}`, 10, 70);
      }

      // SPROUT状態の場合は成長速度も表示
      if (state.growthState === GrowthState.SPROUT) {
        const volumeFactor = displayVolume / 100;
        const isPortrait = p.height > p.width;
        const heightScale = isPortrait ? 0.25 : 0.35;
        const maxLength = p.height * heightScale;

        let baseGrowthRate: number;
        if (state.stemHeight < maxLength) {
          baseGrowthRate = 0.5; // 芽の段階：速い
        } else {
          baseGrowthRate = 0.3; // 茎の段階：遅い
        }

        const growthRate = baseGrowthRate * (0.3 + volumeFactor * 1.4);
        const growthSpeedPercent = (growthRate / baseGrowthRate) * 100;

        const yOffset = isDemoMode ? 90 : 110; // マイク入力モードの場合は下にずらす

        // 成長速度を色分けして表示
        if (growthSpeedPercent > 100) {
          p.fill(0, 255, 0); // 緑色（速い）
        } else if (growthSpeedPercent > 60) {
          p.fill(255, 255, 0); // 黄色（普通）
        } else {
          p.fill(255, 100, 0); // オレンジ色（遅い）
        }
        p.text(`成長速度: ${growthSpeedPercent.toFixed(0)}% (音量${displayVolume.toFixed(0)}で決定)`, 10, yOffset);
        p.fill(255); // 白に戻す

        // 茎の高さと進行度を表示
        const totalMaxLength = maxLength + p.height * (isPortrait ? 0.1 : 0.15);
        const heightPercent = (state.stemHeight / totalMaxLength) * 100;
        p.text(`茎の高さ: ${heightPercent.toFixed(0)}%`, 10, yOffset + 20);
      }

      // SCATTER状態の場合は追加情報を表示
      else if (state.growthState === GrowthState.SCATTER) {
        const scatterAge = state.scatterStartTime ? (time - state.scatterStartTime) / 1000 : 0;

        // デモモードの場合のみ、詳細なフェーズ情報を表示
        if (isDemoMode) {
          const scatterCycle = scatterAge % 20;
          let phaseText = '';

          if (scatterCycle < 5) {
            phaseText = '高い声 + 大音量（舞い上がりながら速く崩れる）';
          } else if (scatterCycle < 10) {
            phaseText = '低い声 + 大音量（重く速く崩れる）';
          } else if (scatterCycle < 15) {
            phaseText = '高い声 + 小音量（ふわふわゆっくり崩れる）';
          } else {
            phaseText = '低い声 + 小音量（重くゆっくり崩れる）';
          }

          p.text(phaseText, 10, 90);
        }

        p.text(`Particles: ${state.particles.filter(p => p.isScatter).length}`, 10, isDemoMode ? 110 : 90);
      } else if (state.growthState === GrowthState.BLOOM) {
        // BLOOM状態の場合は開花進行度を表示
        const bloomPercent = state.bloomProgress * 100;
        p.text(`開花進行度: ${bloomPercent.toFixed(0)}%`, 10, 90);
        p.text(`Leaves: ${state.leaves.length}`, 10, 110);
      }
    }

    // FPS表示（右上）
    p.push();
    p.fill(0, 255, 0); // 緑色
    p.textSize(16);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(`FPS: ${p.frameRate().toFixed(1)}`, p.width - 10, 10);
    p.pop();
  };

  /**
   * ウィンドウリサイズ時
   */
  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);

    // 種子位置を更新
    state.seedPosition = renderer.getSeedPosition();

    // 成長中の場合は状態をリセット（画面サイズ変更で崩れるのを防ぐ）
    if (state.growthState !== GrowthState.SEED) {
      state.growthState = GrowthState.SEED;
      state.leaves = [];
      state.stemHeight = 0;
      state.sproutMaxLength = undefined;
    }
  };

  /**
   * 初期状態を作成
   */
  function createInitialState(): AppState {
    const seedPosition: Point = {
      x: p.windowWidth / 2,
      y: p.windowHeight * 0.85
    };

    return {
      growthState: GrowthState.SEED, // 種子状態から開始
      seedPosition,
      stemHeight: 0,
      leaves: [],
      bloomProgress: 0,
      bloomProgressRaw: 0,
      particles: [],
      ripples: [],
      particlePhase: 'scatter',
      lastUpdateTime: Date.now(),
      accumulatedVolume: 0,
      volumeSampleCount: 0,
      seedResetTime: -1 // 初回は種子を表示（-1に設定）
    };
  }
};

// p5インスタンスを作成
new p5(sketch);
