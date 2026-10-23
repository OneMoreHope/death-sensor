/**
 * DEATH SENSOR - 1-Bit AirPods Zombie Shooter
 * Core Game Loop, State Machine, Wave Spawner, 10 Weapon Perks, Collision & Rendering
 */

// Available Perks (10 Unique Weapon Perks)
const ALL_PERKS = [
  {
    id: 'twin_barrel',
    name: 'TWIN BARREL',
    desc: 'Fires 2 parallel bullets simultaneously per shot.',
    apply: (game) => { game.gun.bulletCount = 2; }
  },
  {
    id: 'heavy_caliber',
    name: 'HEAVY CALIBER',
    desc: 'Bullet damage increased significantly (+45%).',
    apply: (game) => { game.gun.damage = Math.round(game.gun.damage * 1.45); }
  },
  {
    id: 'rapid_trigger',
    name: 'RAPID TRIGGER',
    desc: 'Fire rate boosted by +40% (Machine gun speed).',
    apply: (game) => { game.gun.fireInterval = Math.max(0.08, game.gun.fireInterval * 0.70); }
  },
  {
    id: 'armor_piercing',
    name: 'PIERCING SHOT',
    desc: 'Bullets punch through enemies, hitting targets behind them.',
    apply: (game) => { game.gun.piercing = true; }
  },
  {
    id: 'buckshot_spread',
    name: 'BUCKSHOT SPREAD',
    desc: 'Discharges 3-round angled pellet spread per trigger pull.',
    apply: (game) => { game.gun.spreadCount = 3; }
  },
  {
    id: 'high_velocity',
    name: 'HIGH VELOCITY',
    desc: 'Bullets travel 100% faster to snipe long-distance zombies instantly.',
    apply: (game) => { game.gun.bulletSpeed *= 2.0; }
  },
  {
    id: 'hollow_point',
    name: 'HOLLOW POINT CRIT',
    desc: 'Adds +30% chance to inflict devastating 2.5x Critical Damage.',
    apply: (game) => { game.gun.critChance = 0.30; }
  },
  {
    id: 'shockwave',
    name: 'KNOCKBACK SHOCK',
    desc: 'Gunshots knock approaching zombies back into the distance.',
    apply: (game) => { game.gun.knockback = true; }
  },
  {
    id: 'cryo_slow',
    name: 'CRYO STUN ROUND',
    desc: 'Hits chill zombies, slowing movement speed by 45%.',
    apply: (game) => { game.gun.slowEffect = true; }
  },
  {
    id: 'adrenaline_repair',
    name: 'ADRENALINE REPAIR',
    desc: 'Immediately restores 30 HP and increases fire rate when injured.',
    apply: (game) => { 
      game.player.health = Math.min(100, game.player.health + 30);
      game.gun.adrenalineMode = true;
    }
  }
];

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    // Game States: 'MENU', 'PLAYING', 'PAUSED', 'PERK_SELECT', 'GAMEOVER'
    this.state = 'MENU';

    // Player State
    this.player = {
      health: 100,
      maxHealth: 100,
      kills: 0,
      score: 0,
      viewAngle: 0, // In radians / horizontal pan
    };

    // Weapon Configuration
    this.gun = {
      baseDamage: 22,
      damage: 22,
      fireInterval: 0.36, // Seconds per shot (~2.8 shots/sec)
      fireTimer: 0,
      bulletSpeed: 70, // Z units / sec
      bulletCount: 1,
      spreadCount: 1,
      piercing: false,
      critChance: 0.05,
      knockback: false,
      slowEffect: false,
      adrenalineMode: false,
      recoilOffset: 0,
      isMuzzleFlash: false,
      activePerks: []
    };

    // Wave Management
    this.wave = 1;
    this.totalZombiesInWave = 6;
    this.zombiesSpawned = 0;
    this.zombiesRemaining = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.waveTransitionTimer = 0;

    // Entities
    this.zombies = [];
    this.bullets = [];
    this.particles = [];

    // Screen Shake
    this.screenShake = 0;

    // Timing
    this.lastTime = performance.now();

    this.initUI();
  }

  initUI() {
    // Buttons
    document.getElementById('btn-request-sensor').addEventListener('click', async () => {
      window.soundSynth.init();
      window.soundSynth.playPerkSelect(); // Wake up AirPods audio & motion stream
      const res = await window.motionSensor.connectSensor();
      const statusEl = document.getElementById('sensor-status-text');
      if (statusEl && res.message) {
        statusEl.innerHTML = res.message;
      }
      if (res.success && statusEl) {
        statusEl.className = 'status-connected';
      }
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      window.soundSynth.init();
      this.startGame();
    });

    document.getElementById('btn-pause-toggle').addEventListener('click', () => {
      this.togglePause();
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      this.togglePause();
    });

    document.getElementById('btn-recenter').addEventListener('click', () => {
      window.motionSensor.calibrateCenter();
    });

    document.getElementById('btn-recenter-quick').addEventListener('click', () => {
      window.motionSensor.calibrateCenter();
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      this.startGame();
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
      this.showMenu('menu-start');
      this.state = 'MENU';
      document.getElementById('hud').classList.add('hidden');
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
      this.startGame();
    });

    document.getElementById('btn-mainmenu').addEventListener('click', () => {
      this.showMenu('menu-start');
      this.state = 'MENU';
      document.getElementById('hud').classList.add('hidden');
    });

    // Keyboard ESC for Pause
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'PLAYING' || this.state === 'PAUSED') {
          this.togglePause();
        }
      }
    });
  }

  showMenu(menuId) {
    ['menu-start', 'menu-pause', 'menu-perk', 'menu-gameover'].forEach(id => {
      const el = document.getElementById(id);
      if (id === menuId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  startGame() {
    this.state = 'PLAYING';
    this.player.health = 100;
    this.player.kills = 0;
    this.player.score = 0;

    // Reset Gun
    this.gun = {
      baseDamage: 22,
      damage: 22,
      fireInterval: 0.36,
      fireTimer: 0,
      bulletSpeed: 70,
      bulletCount: 1,
      spreadCount: 1,
      piercing: false,
      critChance: 0.05,
      knockback: false,
      slowEffect: false,
      adrenalineMode: false,
      recoilOffset: 0,
      isMuzzleFlash: false,
      activePerks: []
    };

    this.wave = 1;
    this.startWave(1);

    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hud-perks-list').innerHTML = '';
    this.showMenu(null);
    this.updateHUD();
  }

  startWave(waveNum) {
    this.wave = waveNum;
    this.zombies = [];
    this.bullets = [];
    this.particles = [];
    // Scaling formula: 5 + Wave * 1.8
    this.totalZombiesInWave = 5 + Math.floor(waveNum * 1.8);
    this.zombiesSpawned = 0;
    this.zombiesRemaining = this.totalZombiesInWave;
    this.spawnInterval = Math.max(0.4, 1.5 - waveNum * 0.04);
    this.spawnTimer = 0.5;
    this.waveTransitionTimer = 0;

    this.updateHUD();
  }

  spawnZombie() {
    if (this.zombiesSpawned >= this.totalZombiesInWave) return;

    // Determine zombie type based on wave
    let type = 'walker';
    const roll = Math.random();
    if (this.wave >= 12 && roll < 0.25) {
      type = 'brute';
    } else if (this.wave >= 5 && roll < 0.40) {
      type = 'runner';
    }

    // Health Formula: 40 * (1 + (Wave - 1) * 0.12)
    let hp = Math.round(40 * (1 + (this.wave - 1) * 0.12));
    let speed = 2.4 + Math.min(2.5, (this.wave - 1) * 0.08);

    if (type === 'runner') {
      hp = Math.round(hp * 0.65);
      speed *= 1.6;
    } else if (type === 'brute') {
      hp = Math.round(hp * 2.5);
      speed *= 0.65;
    }

    // Spawn randomly across horizontal arc (-1.6 to +1.6 radians)
    const angle = (Math.random() - 0.5) * 3.2;
    const distance = 40 + Math.random() * 10; // Z distance units

    const zombie = {
      type: type,
      angle: angle, // World angle
      z: distance,  // Distance towards screen
      hp: hp,
      maxHp: hp,
      speed: speed,
      frame: 0,
      animTimer: 0,
      isFrozen: 0,
      // Melee attack timer tracking
      hasHitFirstTime: false,
      meleeTimer: 0
    };

    this.zombies.push(zombie);
    this.zombiesSpawned++;
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.showMenu('menu-pause');
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.showMenu(null);
    }
  }

  showPerkModal() {
    this.state = 'PERK_SELECT';
    window.soundSynth.playWaveClear();

    const perkWaveSpan = document.getElementById('perk-wave-num');
    if (perkWaveSpan) perkWaveSpan.textContent = this.wave;

    // Pick 3 random distinct perks from ALL_PERKS
    const available = [...ALL_PERKS];
    const choices = [];
    while (choices.length < 3 && available.length > 0) {
      const idx = Math.floor(Math.random() * available.length);
      choices.push(available.splice(idx, 1)[0]);
    }

    const container = document.getElementById('perk-cards-container');
    container.innerHTML = '';

    choices.forEach((perk, index) => {
      const card = document.createElement('div');
      card.className = 'perk-card';
      card.innerHTML = `
        <div>
          <div class="perk-num">OPTION 0${index + 1}</div>
          <div class="perk-title">${perk.name}</div>
          <div class="perk-desc">${perk.desc}</div>
        </div>
        <button class="retro-btn sm" style="margin-top: 12px; pointer-events: none;">SELECT</button>
      `;

      card.addEventListener('click', () => {
        this.selectPerk(perk);
      });

      container.appendChild(card);
    });

    this.showMenu('menu-perk');
  }

  selectPerk(perk) {
    window.soundSynth.playPerkSelect();
    perk.apply(this);
    this.gun.activePerks.push(perk.name);

    // Add pill to HUD
    const badge = document.createElement('span');
    badge.className = 'perk-pill';
    badge.textContent = perk.name;
    document.getElementById('hud-perks-list').appendChild(badge);

    // Resume next wave
    this.showMenu(null);
    this.state = 'PLAYING';
    this.startWave(this.wave + 1);
  }

  shoot() {
    this.gun.recoilOffset = 14;
    this.gun.isMuzzleFlash = true;
    setTimeout(() => { this.gun.isMuzzleFlash = false; }, 60);

    const pitch = 0.9 + Math.random() * 0.2;
    window.soundSynth.playShoot(pitch);

    // Calculate bullet shots
    const count = this.gun.spreadCount > 1 ? this.gun.spreadCount : this.gun.bulletCount;
    const isSpread = this.gun.spreadCount > 1;

    for (let i = 0; i < count; i++) {
      let angleOffset = 0;
      if (isSpread) {
        angleOffset = (i - 1) * 0.08;
      } else if (this.gun.bulletCount === 2) {
        angleOffset = (i === 0 ? -0.04 : 0.04);
      }

      this.bullets.push({
        angle: this.player.viewAngle + angleOffset,
        z: 2, // Starts right in front of camera
        speed: this.gun.bulletSpeed,
        damage: this.gun.damage,
        piercing: this.gun.piercing,
        pierceCount: this.gun.piercing ? 2 : 1
      });
    }

    this.screenShake = 3;
  }

  applyDamageToPlayer(amount) {
    this.player.health = Math.max(0, this.player.health - amount);
    window.soundSynth.playPlayerHurt();
    this.flashScreen(0.4);
    this.screenShake = 8;
    this.updateHUD();

    if (this.player.health <= 0) {
      this.gameOver();
    }
  }

  flashScreen(intensity = 0.3) {
    const flash = document.getElementById('flash-overlay');
    flash.style.opacity = intensity;
    setTimeout(() => {
      flash.style.opacity = 0;
    }, 80);
  }

  gameOver() {
    this.state = 'GAMEOVER';
    window.soundSynth.playGameOver();

    document.getElementById('go-wave').textContent = this.wave;
    document.getElementById('go-kills').textContent = this.player.kills;
    document.getElementById('go-score').textContent = this.player.score;

    this.showMenu('menu-gameover');
  }

  updateHUD() {
    document.getElementById('hud-wave').textContent = (this.wave < 10 ? '0' : '') + this.wave;
    document.getElementById('hud-zombies').textContent = `${this.zombiesRemaining}/${this.totalZombiesInWave}`;
    document.getElementById('hud-score').textContent = this.player.score.toString().padStart(5, '0');

    // Health
    const hpPct = Math.max(0, (this.player.health / this.player.maxHealth) * 100);
    document.getElementById('hud-health-fill').style.width = `${hpPct}%`;
    document.getElementById('hud-health-val').textContent = `${this.player.health}/${this.player.maxHealth}`;
  }

  update(dt) {
    if (this.state !== 'PLAYING') return;

    // 1. Update Head Motion Sensor
    const tiltOffset = window.motionSensor.update(dt);
    // Map -1.0..+1.0 to horizontal angle range (-1.5 to +1.5 radians)
    this.player.viewAngle = tiltOffset * 1.5;

    // 2. Auto-Fire Gun Loop
    let currentFireInterval = this.gun.fireInterval;
    if (this.gun.adrenalineMode && this.player.health < 40) {
      currentFireInterval *= 0.65; // High speed when wounded
    }

    this.gun.fireTimer += dt;
    if (this.gun.fireTimer >= currentFireInterval) {
      this.shoot();
      this.gun.fireTimer = 0;
    }

    // Recoil recovery
    if (this.gun.recoilOffset > 0) {
      this.gun.recoilOffset = Math.max(0, this.gun.recoilOffset - 60 * dt);
    }

    // Screen Shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - 20 * dt);
    }

    // 3. Spawning
    if (this.zombiesSpawned < this.totalZombiesInWave) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnZombie();
        this.spawnTimer = 0;
      }
    }

    // 4. Update Bullets
    for (let b = this.bullets.length - 1; b >= 0; b--) {
      const bullet = this.bullets[b];
      bullet.z += bullet.speed * dt;

      // Check collision with zombies
      for (let z = this.zombies.length - 1; z >= 0; z--) {
        const zombie = this.zombies[z];
        const distZ = Math.abs(zombie.z - bullet.z);
        const distAngle = Math.abs(zombie.angle - bullet.angle);

        // Hit threshold decreases as target is farther away
        const hitAngleThreshold = 0.35 / Math.max(1, zombie.z * 0.15);

        if (distZ < 4.0 && distAngle < hitAngleThreshold) {
          // HIT!
          let dmg = bullet.damage;
          let isCrit = Math.random() < this.gun.critChance;
          if (isCrit) {
            dmg = Math.round(dmg * 2.5);
            window.soundSynth.playCrit();
            this.flashScreen(0.2);
          } else {
            window.soundSynth.playHit();
          }

          zombie.hp -= dmg;

          // Knockback effect
          if (this.gun.knockback) {
            zombie.z = Math.min(50, zombie.z + 5.0);
          }

          // Slow effect
          if (this.gun.slowEffect) {
            zombie.isFrozen = 2.0; // 2 seconds
          }

          // Hit particle
          this.createHitParticles(zombie.angle, zombie.z);

          // Check Zombie Death
          if (zombie.hp <= 0) {
            this.zombies.splice(z, 1);
            this.player.kills++;
            this.player.score += (zombie.type === 'brute' ? 250 : zombie.type === 'runner' ? 150 : 100);
            this.zombiesRemaining--;
            window.soundSynth.playZombieDeath();
            this.updateHUD();
          }

          // Bullet pierce logic
          bullet.pierceCount--;
          if (bullet.pierceCount <= 0) {
            this.bullets.splice(b, 1);
            break;
          }
        }
      }

      // Despawn bullet if past range
      if (bullet.z > 60) {
        this.bullets.splice(b, 1);
      }
    }

    // 5. Update Zombies
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];

      // Slow check
      let currentSpeed = z.speed;
      if (z.isFrozen > 0) {
        z.isFrozen -= dt;
        currentSpeed *= 0.55;
      }

      // Move toward screen (Z-axis)
      z.z -= currentSpeed * dt;

      // Animate walking frames
      z.animTimer += dt;
      if (z.animTimer > 0.2) {
        z.frame = (z.frame === 0 ? 1 : 0);
        z.animTimer = 0;
      }

      // Check Reach Player (Melee Proximity)
      // เมื่อซอมบี้ถึงตัว: ทำดาเมจ 10 หน่วยทันที และทำซ้ำ 10 หน่วยทุก 3 วินาที
      if (z.z <= 2.2) {
        z.z = 2.2; // Stay at screen face

        if (!z.hasHitFirstTime) {
          z.hasHitFirstTime = true;
          z.meleeTimer = 0;
          this.applyDamageToPlayer(10);
        } else {
          z.meleeTimer += dt;
          if (z.meleeTimer >= 3.0) {
            this.applyDamageToPlayer(10);
            z.meleeTimer = 0;
          }
        }
      }
    }

    // 6. Update Particles
    for (let p = this.particles.length - 1; p >= 0; p--) {
      const part = this.particles[p];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
      if (part.life <= 0) {
        this.particles.splice(p, 1);
      }
    }

    // 7. Wave Completion Check
    if (this.zombiesRemaining <= 0 && this.zombiesSpawned >= this.totalZombiesInWave) {
      this.waveTransitionTimer += dt;
      if (this.waveTransitionTimer >= 1.2) {
        if (this.wave % 10 === 0) {
          this.showPerkModal();
        } else {
          window.soundSynth.playWaveClear();
          this.startWave(this.wave + 1);
        }
      }
    }
  }

  createHitParticles(angle, z) {
    const screenX = this.worldToScreenX(angle);
    const screenY = this.height * 0.48;
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: screenX,
        y: screenY,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        size: Math.random() > 0.5 ? 3 : 2,
        life: 0.25
      });
    }
  }

  worldToScreenX(angle) {
    // Relative angle to player's center view
    const relAngle = angle - this.player.viewAngle;
    // FOV is approx ~1.5 radians across canvas width
    const screenX = (this.width / 2) + (relAngle / 1.5) * (this.width / 2);
    return screenX;
  }

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // Apply Screen Shake
    ctx.save();
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Clear Screen (Pitch Black)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Render 1-Bit Dithered Horizon & Ground Lines
    this.renderHorizonAndFloor(ctx);

    // 3. Render Zombies (Sorted by Distance Z back-to-front)
    const sortedZombies = [...this.zombies].sort((a, b) => b.z - a.z);
    sortedZombies.forEach(z => this.renderZombie(ctx, z));

    // 4. Render Bullets & Impact Particles
    this.renderProjectilesAndParticles(ctx);

    // 5. Render Reticle / Crosshair (Always locked to center aim)
    this.renderCrosshair(ctx);

    // 6. Render Gun in First-Person
    this.renderWeapon(ctx);

    ctx.restore();
  }

  renderHorizonAndFloor(ctx) {
    const horizonY = this.height * 0.52;

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(this.width, horizonY);
    ctx.stroke();

    // Perspective floor lines that shift with player view angle
    const lineCount = 14;
    const viewOffset = this.player.viewAngle * 250;
    for (let i = -lineCount; i <= lineCount; i++) {
      const xStart = (this.width / 2) + i * 80 - (viewOffset % 80);
      ctx.beginPath();
      ctx.moveTo(this.width / 2, horizonY);
      ctx.lineTo(xStart * 2.2 - (this.width / 2), this.height);
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([2, 4]); // 1-bit dashed perspective lines
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  renderZombie(ctx, z) {
    const screenX = this.worldToScreenX(z.angle);
    const horizonY = this.height * 0.52;

    // Perspective Scaling: Closer = much bigger
    // Scale ranges from 0.2 (far) to 5.0 (touching screen)
    const scale = Math.max(0.15, Math.min(6.0, 36 / Math.max(1.8, z.z)));

    // Choose sprite
    let spriteCanvas = CACHED_SPRITES.zombieWalker1;
    if (z.type === 'runner') {
      spriteCanvas = CACHED_SPRITES.zombieRunner;
    } else if (z.type === 'brute') {
      spriteCanvas = CACHED_SPRITES.zombieBrute;
    } else {
      spriteCanvas = (z.frame === 0 ? CACHED_SPRITES.zombieWalker1 : CACHED_SPRITES.zombieWalker2);
    }

    const drawW = spriteCanvas.width * scale;
    const drawH = spriteCanvas.height * scale;
    const drawX = screenX - drawW / 2;
    const drawY = horizonY + 20 * scale - drawH;

    // Don't draw if completely offscreen
    if (drawX + drawW < -50 || drawX > this.width + 50) return;

    // Draw 1-bit sprite
    ctx.drawImage(spriteCanvas, drawX, drawY, drawW, drawH);

    // Draw Health Bar if damaged and closer
    if (z.hp < z.maxHp && z.z < 35) {
      const barW = Math.max(20, drawW * 0.8);
      const barH = 4;
      const barX = drawX + (drawW - barW) / 2;
      const barY = drawY - 8;

      ctx.fillStyle = '#000000';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const fillW = Math.max(0, (z.hp / z.maxHp) * barW);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX, barY, fillW, barH);
    }
  }

  renderProjectilesAndParticles(ctx) {
    // Bullets (Drawn as fast moving white lines into the screen)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    this.bullets.forEach(b => {
      const screenX = this.worldToScreenX(b.angle);
      const startY = this.height - 40;
      const progress = Math.min(1.0, b.z / 45);
      const targetY = (this.height * 0.52) * (1 - progress) + (this.height * 0.50) * progress;

      ctx.beginPath();
      ctx.moveTo(screenX, startY);
      ctx.lineTo(screenX, targetY);
      ctx.stroke();
    });

    // Particles (White pixel squares)
    ctx.fillStyle = '#ffffff';
    this.particles.forEach(p => {
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
  }

  renderCrosshair(ctx) {
    const cx = this.width / 2;
    const cy = this.height * 0.50;
    const size = 8;
    const gap = 4;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    // Top
    ctx.beginPath();
    ctx.moveTo(cx, cy - gap);
    ctx.lineTo(cx, cy - gap - size);
    ctx.stroke();

    // Bottom
    ctx.beginPath();
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + gap + size);
    ctx.stroke();

    // Left
    ctx.beginPath();
    ctx.moveTo(cx - gap, cy);
    ctx.lineTo(cx - gap - size, cy);
    ctx.stroke();

    // Right
    ctx.beginPath();
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + gap + size, cy);
    ctx.stroke();

    // Center point
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }

  renderWeapon(ctx) {
    const gunSprite = this.gun.isMuzzleFlash ? CACHED_SPRITES.gunFire : CACHED_SPRITES.gunIdle;
    // Gun size scaled down by 2x for cleaner first-person field of view
    const baseW = gunSprite.width * 2.0;
    const baseH = gunSprite.height * 2.0;

    // Position at bottom center, with recoil displacement
    const gunX = (this.width - baseW) / 2;
    const gunY = this.height - baseH + 6 + this.gun.recoilOffset;

    ctx.drawImage(gunSprite, gunX, gunY, baseW, baseH);
  }

  loop(currentTime) {
    const dt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Start Game Engine on Window Load
window.addEventListener('DOMContentLoaded', () => {
  window.gameEngine = new Game();
  requestAnimationFrame((t) => window.gameEngine.loop(t));
});
