import type { Particle, Point, Leaf } from './types';

/**
 * ParticleSystemクラス
 * 花が散る際のパーティクルシステムを管理する
 *
 * 2つの段階:
 * 1. 飛散段階（scatter）: パーティクルが音量・音高に応じて飛散し、透明度が減少
 * 2. 収束段階（converge）: パーティクルが種子位置に向かって収束
 */
export class ParticleSystem {
  private particles: Particle[] = [];
  private phase: 'scatter' | 'converge' = 'scatter';
  private seedPosition: Point;
  private gravity: number = 0.5; // 重力加速度
  private alphaDecayRate: number = 0.3; // 透明度減少率（1秒あたり）
  private alphaThreshold: number = 0.3; // 収束段階への遷移閾値
  private convergenceSpeed: number = 4.0; // 収束速度の基本倍率（2.0→4.0に増加）
  private arrivalThreshold: number = 5; // 到達判定の距離閾値（ピクセル）

  constructor(seedPosition: Point) {
    this.seedPosition = seedPosition;
  }

  /**
   * 全描画要素からパーティクルを生成
   * @param stemHeight 茎の高さ
   * @param leaves 葉の配列
   * @param flowerPoints 花の点の配列
   * @param volume 音量（0-100）
   * @param pitch 音高（Hz）
   * @param currentTime 現在時刻（ミリ秒）
   */
  public generateParticles(
    stemHeight: number,
    leaves: Leaf[],
    flowerPoints: Array<{x: number, y: number, color: string}>,
    volume: number,
    pitch: number,
    currentTime: number
  ): void {
    this.particles = [];
    this.phase = 'scatter';

    // 音量に応じた初速度（0-100 → 1-5 px/frame）画面内に収まるように制限
    const baseSpeed = 1 + (volume / 100) * 4;

    // 音高に応じた移動方向の偏り（-1 to 1）
    // 低音: 下方向、高音: 上方向
    const normalizedPitch = Math.max(0, Math.min(1, (pitch - 200) / 600));
    const verticalBias = (normalizedPitch - 0.5) * 2; // -1 to 1

    // 花のパーティクルを生成
    for (const point of flowerPoints) {
      const angle = Math.random() * Math.PI * 2;
      const speed = baseSpeed * (0.8 + Math.random() * 0.4); // ±20%のばらつき

      // 音高に応じた方向の偏り
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed + verticalBias * speed * 0.5;

      this.particles.push({
        x: point.x,
        y: point.y,
        vx,
        vy,
        color: point.color,
        alpha: 1.0,
        size: 2 + Math.random() * 2,
        targetX: this.seedPosition.x,
        targetY: this.seedPosition.y,
        life: 1.0,
        maxLife: 3 + Math.random() * 2, // 3-5秒
        birthTime: currentTime,
        partType: 'flower'
      });
    }

    // 茎のパーティクルを生成（簡略化: 10点）
    const stemSegments = 10;
    for (let i = 0; i <= stemSegments; i++) {
      const t = i / stemSegments;
      const y = this.seedPosition.y - stemHeight * t;

      const angle = Math.random() * Math.PI * 2;
      const speed = baseSpeed * (0.8 + Math.random() * 0.4);

      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed + verticalBias * speed * 0.5;

      this.particles.push({
        x: this.seedPosition.x,
        y,
        vx,
        vy,
        color: 'rgb(70, 200, 160)',
        alpha: 1.0,
        size: 2 + Math.random() * 2,
        targetX: this.seedPosition.x,
        targetY: this.seedPosition.y,
        life: 1.0,
        maxLife: 3 + Math.random() * 2,
        birthTime: currentTime,
        partType: 'stem'
      });
    }

    // 葉のパーティクルを生成（各葉から5点）
    for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
      const leaf = leaves[leafIndex];
      const leafPoints = 5;

      for (let i = 0; i < leafPoints; i++) {
        const t = i / (leafPoints - 1);
        const x = leaf.x + Math.cos(leaf.angle) * leaf.size * t;
        const y = leaf.y + Math.sin(leaf.angle) * leaf.size * t;

        const angle = Math.random() * Math.PI * 2;
        const speed = baseSpeed * (0.8 + Math.random() * 0.4);

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed + verticalBias * speed * 0.5;

        this.particles.push({
          x,
          y,
          vx,
          vy,
          color: leaf.baseColor,
          alpha: 1.0,
          size: 2 + Math.random() * 2,
          targetX: this.seedPosition.x,
          targetY: this.seedPosition.y,
          life: 1.0,
          maxLife: 3 + Math.random() * 2,
          birthTime: currentTime,
          partType: 'leaf',
          partIndex: leafIndex
        });
      }
    }
  }

  /**
   * パーティクルシステムを更新
   * @param deltaTime 前フレームからの経過時間（秒）
   * @param currentTime 現在時刻（ミリ秒）
   */
  public update(deltaTime: number, currentTime: number): void {
    if (this.phase === 'scatter') {
      this.updateScatterPhase(deltaTime);
    } else {
      this.updateConvergePhase(deltaTime);
    }
  }

  /**
   * 飛散段階の更新
   * @param deltaTime 前フレームからの経過時間（秒）
   */
  private updateScatterPhase(deltaTime: number): void {
    for (const particle of this.particles) {
      // 重力を適用
      particle.vy += this.gravity * deltaTime * 60; // 60fps基準

      // 位置を更新
      particle.x += particle.vx * deltaTime * 60;
      particle.y += particle.vy * deltaTime * 60;

      // 透明度を減少
      particle.alpha -= this.alphaDecayRate * deltaTime;
      particle.alpha = Math.max(0, particle.alpha);

      // 寿命を減少
      particle.life -= deltaTime / particle.maxLife;
      particle.life = Math.max(0, particle.life);
    }

    // 全パーティクルの平均透明度を計算
    const avgAlpha = this.particles.reduce((sum, p) => sum + p.alpha, 0) / this.particles.length;

    // 透明度閾値を下回ったら収束段階に遷移
    if (avgAlpha < this.alphaThreshold) {
      this.phase = 'converge';
    }
  }

  /**
   * 収束段階の更新
   * @param deltaTime 前フレームからの経過時間（秒）
   */
  private updateConvergePhase(deltaTime: number): void {
    for (const particle of this.particles) {
      // 種子位置への移動ベクトルを計算
      const dx = particle.targetX - particle.x;
      const dy = particle.targetY - particle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.arrivalThreshold) {
        // 距離に応じた速度増加（遠いほど速く）+ イージング
        const distanceRatio = Math.min(distance / 300, 1); // 正規化（300px以上は1.0）
        const easing = 1 - Math.pow(1 - distanceRatio, 3); // ease-out cubic
        const speedMultiplier = 1 + (easing * 3); // 最大4倍速
        const speed = this.convergenceSpeed * speedMultiplier;

        // 正規化された方向ベクトル
        const dirX = dx / distance;
        const dirY = dy / distance;

        // 位置を直接更新（速度ベースではなく、移動量ベース）
        const moveDistance = Math.min(speed * deltaTime * 60, distance);
        particle.x += dirX * moveDistance;
        particle.y += dirY * moveDistance;

        // 速度を記録（表示用）
        particle.vx = dirX * speed * 60;
        particle.vy = dirY * speed * 60;
      } else {
        // 到達済み: 速度を0に
        particle.vx = 0;
        particle.vy = 0;
      }

      // 透明度を徐々に回復（遅めに）
      // 種子に近づくほど透明度が上がる
      const distanceToSeed = Math.sqrt(dx * dx + dy * dy);
      const proximityRatio = Math.max(0, 1 - distanceToSeed / 200); // 200px以内で徐々に見える
      particle.alpha += 0.3 * deltaTime * proximityRatio; // 近づくほど速く回復
      particle.alpha = Math.min(1, particle.alpha);
    }
  }

  /**
   * 全パーティクルが種子位置に到達したかを判定
   * @returns 全パーティクルが到達した場合true
   */
  public allParticlesArrived(): boolean {
    if (this.phase !== 'converge') {
      return false;
    }

    for (const particle of this.particles) {
      const dx = particle.targetX - particle.x;
      const dy = particle.targetY - particle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.arrivalThreshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * パーティクルの配列を取得
   * @returns パーティクルの配列
   */
  public getParticles(): Particle[] {
    return this.particles;
  }

  /**
   * 現在の段階を取得
   * @returns 'scatter' または 'converge'
   */
  public getPhase(): 'scatter' | 'converge' {
    return this.phase;
  }

  /**
   * パーティクルシステムをリセット
   */
  public reset(): void {
    this.particles = [];
    this.phase = 'scatter';
  }
}
