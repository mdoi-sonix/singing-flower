/**
 * AudioAnalyzer - マイク入力から音量と音高をリアルタイムで解析
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null; // ストリームを保持
  private dataArray: Uint8Array | null = null;
  private active: boolean = false;

  /**
   * AudioAnalyzerを初期化し、マイクアクセスを取得
   */
  async initialize(): Promise<void> {
    try {
      console.log('[AudioAnalyzer] 初期化開始...');

      // 既存のリソースをクリーンアップ（再初期化の場合）
      if (this.active) {
        console.log('[AudioAnalyzer] 既存のリソースをクリーンアップ中...');
        this.dispose();
        // disposeの完了を待つ
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Web Audio APIのサポートチェック
      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        throw new Error('Web Audio APIがサポートされていません');
      }

      // AudioContextの作成
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[AudioAnalyzer] AudioContext作成完了');

      // マイクアクセスの取得
      console.log('[AudioAnalyzer] マイクアクセス要求中...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      console.log('[AudioAnalyzer] マイクアクセス許可されました');

      // 使用中のマイクデバイス情報を表示
      const audioTracks = this.mediaStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const track = audioTracks[0];
        console.log('[AudioAnalyzer] 使用中のマイク:', track.label);
        console.log('[AudioAnalyzer] マイク設定:', track.getSettings());

        // トラックが停止された時のイベントリスナーを追加
        track.addEventListener('ended', () => {
          console.warn('[AudioAnalyzer] マイクトラックが停止されました（ブラウザ設定で許可解除された可能性）');
          this.active = false;
          // エラーメッセージを表示
          const errorMsg = document.getElementById('error-message');
          if (errorMsg) {
            errorMsg.textContent = 'マイクアクセスが停止されました。ページをリロードしてください。';
            errorMsg.classList.remove('hidden');
          }
        });
      }

      // AnalyserNodeの作成と設定
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;
      console.log('[AudioAnalyzer] AnalyserNode作成完了');

      // マイク入力をAnalyserNodeに接続
      this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.microphone.connect(this.analyserNode);
      console.log('[AudioAnalyzer] マイク接続完了');

      // AudioContextの状態を確認
      console.log('[AudioAnalyzer] AudioContext状態:', this.audioContext.state);

      // AudioContextがsuspendedの場合は再開
      if (this.audioContext.state === 'suspended') {
        console.log('[AudioAnalyzer] AudioContextを再開中...');
        await this.audioContext.resume();
        console.log('[AudioAnalyzer] AudioContext再開完了:', this.audioContext.state);
      }

      // データ配列の初期化
      const bufferLength = this.analyserNode.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      console.log('[AudioAnalyzer] データ配列初期化完了 (bufferLength:', bufferLength, ')');

      this.active = true;
      console.log('[AudioAnalyzer] 初期化完了 - active:', this.active);
    } catch (error) {
      console.error('[AudioAnalyzer] 初期化エラー:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('マイクアクセスが拒否されました');
        } else if (error.name === 'NotFoundError') {
          throw new Error('マイクが見つかりません');
        }
      }
      throw error;
    }
  }

  /**
   * 現在の音量を取得（デシベル値: 0-100）
   */
  getVolume(): number {
    if (!this.analyserNode || !this.dataArray || !this.active) {
      console.warn('[AudioAnalyzer] Not active or not initialized');
      return 0;
    }

    // AudioContextの状態を確認
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.warn('[AudioAnalyzer] AudioContext is suspended, attempting to resume...');
      this.audioContext.resume();
      return 0;
    }

    // 時間領域データを取得
    this.analyserNode.getByteTimeDomainData(this.dataArray as Uint8Array<ArrayBuffer>);

    // 生データの確認（最初の10サンプル）
    if (Math.random() < 0.01) {
      const samples = Array.from(this.dataArray.slice(0, 10));
      console.log('[AudioAnalyzer] 生データサンプル:', samples);
    }

    // RMS（二乗平均平方根）を計算
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);

    // デシベルに変換（0-100の範囲にスケール）
    // 小さい音も拾いやすくするため、感度を上げる
    const db = 25 * Math.log10(rms + 0.0001);
    // -60dB〜0dBを0〜100にマッピング（感度を上げるため範囲を調整）
    const volume = Math.max(0, Math.min(100, (db + 60) * (100 / 60)));

    // 感度を適度に上げるため、音量を増幅（1.5倍に調整）
    const amplifiedVolume = Math.min(100, volume * 1.2);

    // デバッグ用：常にログ出力（頻繁に）
    if (Math.random() < 0.05) { // 5%の確率でログ出力
      console.log(`[AudioAnalyzer] RMS: ${rms.toFixed(4)}, dB: ${db.toFixed(1)}, Volume: ${volume.toFixed(1)}, Amplified: ${amplifiedVolume.toFixed(1)}`);
    }

    return amplifiedVolume;
  }

  /**
   * 現在の音高を取得（Hz単位の周波数）
   */
  getPitch(): number {
    if (!this.analyserNode || !this.dataArray || !this.active || !this.audioContext) {
      return 0;
    }

    // 時間領域データを取得
    this.analyserNode.getByteTimeDomainData(this.dataArray as Uint8Array<ArrayBuffer>);

    // 自己相関法で基本周波数を推定
    const pitch = this.autoCorrelate(this.dataArray, this.audioContext.sampleRate);

    return pitch;
  }

  /**
   * 自己相関法による音高検出
   */
  private autoCorrelate(buffer: Uint8Array, sampleRate: number): number {
    // バッファを正規化（-1 to 1）
    const normalized = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      normalized[i] = (buffer[i] - 128) / 128;
    }

    // 無音チェック
    let sum = 0;
    for (let i = 0; i < normalized.length; i++) {
      sum += Math.abs(normalized[i]);
    }
    if (sum < 0.01) {
      return 0;
    }

    // 自己相関の計算
    const correlations = new Float32Array(normalized.length);
    for (let lag = 0; lag < normalized.length; lag++) {
      let correlation = 0;
      for (let i = 0; i < normalized.length - lag; i++) {
        correlation += normalized[i] * normalized[i + lag];
      }
      correlations[lag] = correlation;
    }

    // 最初のピークを見つける（lag > 0）
    let maxCorrelation = 0;
    let bestLag = 0;
    let foundPeak = false;

    // 最小周波数を80Hz、最大を1000Hzと仮定
    const minLag = Math.floor(sampleRate / 1000);
    const maxLag = Math.floor(sampleRate / 80);

    for (let lag = minLag; lag < Math.min(maxLag, correlations.length); lag++) {
      if (correlations[lag] > maxCorrelation) {
        maxCorrelation = correlations[lag];
        bestLag = lag;
        foundPeak = true;
      }
    }

    if (!foundPeak || bestLag === 0) {
      return 0;
    }

    // 周波数を計算
    const frequency = sampleRate / bestLag;

    return frequency;
  }

  /**
   * AudioAnalyzerがアクティブかどうかを返す
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    console.log('[AudioAnalyzer] リソース解放開始...');

    this.active = false; // 先にフラグを下ろす

    // マイクストリームを停止
    if (this.mediaStream) {
      const tracks = this.mediaStream.getTracks();
      tracks.forEach(track => {
        console.log('[AudioAnalyzer] マイクトラック停止中:', track.label, 'readyState:', track.readyState);
        track.stop();
        console.log('[AudioAnalyzer] マイクトラック停止完了:', track.label, 'readyState:', track.readyState);
      });
      this.mediaStream = null;
    }

    // マイクノードを切断
    if (this.microphone) {
      try {
        this.microphone.disconnect();
        console.log('[AudioAnalyzer] マイクノード切断完了');
      } catch (e) {
        console.warn('[AudioAnalyzer] マイクノード切断エラー:', e);
      }
      this.microphone = null;
    }

    // アナライザーノードを切断
    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
        console.log('[AudioAnalyzer] アナライザーノード切断完了');
      } catch (e) {
        console.warn('[AudioAnalyzer] アナライザーノード切断エラー:', e);
      }
      this.analyserNode = null;
    }

    // AudioContextを閉じる
    if (this.audioContext) {
      const state = this.audioContext.state;
      console.log('[AudioAnalyzer] AudioContext状態:', state);

      if (state !== 'closed') {
        this.audioContext.close().then(() => {
          console.log('[AudioAnalyzer] AudioContext閉じました');
        }).catch((e) => {
          console.warn('[AudioAnalyzer] AudioContextクローズエラー:', e);
        });
      }
      this.audioContext = null;
    }

    this.dataArray = null;

    console.log('[AudioAnalyzer] リソース解放完了');
  }
}
