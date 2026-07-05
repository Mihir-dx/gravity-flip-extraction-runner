import type { Obstacle, EntityPool, Rocket } from './Types';
import type { Engine } from './Engine';

class ObstaclePool implements EntityPool<Obstacle> {
    pool: Obstacle[] = [];
    
    constructor(size: number) {
        for (let i = 0; i < size; i++) {
            this.pool.push({
                x: 0, y: 0, width: 0, height: 0, active: false, type: 'floor'
            });
        }
    }

    acquire(): Obstacle | null {
        for (const obs of this.pool) {
            if (!obs.active) {
                obs.active = true;
                return obs;
            }
        }
        // If pool is empty, optionally expand it or just return null
        return null;
    }

    release(entity: Obstacle): void {
        entity.active = false;
    }
}

class RocketPool implements EntityPool<Rocket> {
    pool: Rocket[] = [];
    
    constructor(size: number) {
        for (let i = 0; i < size; i++) {
            this.pool.push({
                x: 0, y: 0, width: 90, height: 30, speed: 0, active: false, warningTimer: 0, isLaunching: false
            });
        }
    }

    acquire(): Rocket | null {
        for (const roc of this.pool) {
            if (!roc.active) {
                roc.active = true;
                return roc;
            }
        }
        return null;
    }

    release(entity: Rocket): void {
        entity.active = false;
    }
}

export class Environment {
    private obstaclePool: ObstaclePool;
    private activeObstacles: Obstacle[] = [];
    private spawnTimer: number = 0;
    private spawnInterval: number = 1.5; // seconds

    private rocketPool: RocketPool;
    private activeRockets: Rocket[] = [];
    private rocketSpawnTimer: number = 0;

    public portalMode: boolean = false;

    constructor() {
        // Initialize pool with 50 objects to prevent GC spikes
        this.obstaclePool = new ObstaclePool(50);
        this.rocketPool = new RocketPool(3);
        this.rocketSpawnTimer = this.getRocketSpawnInterval(1);
    }

    private getRocketSpawnInterval(riskTier: number): number {
        const baseInterval = 7 + Math.random() * 5; // 7 to 12 seconds
        let interval = baseInterval / riskTier;
        if (riskTier >= 3) {
            interval *= 2;
        }
        return interval;
    }

    public update(dt: number, engine: Engine) {
        const player = engine.player;
        // Scroll active obstacles left based on player's forward speed
        for (let i = this.activeObstacles.length - 1; i >= 0; i--) {
            const obs = this.activeObstacles[i];
            
            if (!obs.active) {
                this.obstaclePool.release(obs);
                this.activeObstacles.splice(i, 1);
                continue;
            }
            
            if (obs.type === 'crystal' && engine.upgrades.magnetLevel > 0) {
                // Vacuum math
                const pCenterX = player.position.x + player.config.width / 2;
                const pCenterY = player.position.y + player.config.height / 2;
                const cCenterX = obs.x + obs.width / 2;
                const cCenterY = obs.y + obs.height / 2;
                
                const dx = pCenterX - cCenterX;
                const dy = pCenterY - cCenterY;
                const distSq = dx * dx + dy * dy;
                const magnetRadius = 150 + engine.upgrades.magnetLevel * 100;
                
                if (distSq < magnetRadius * magnetRadius) {
                    // Pull towards player
                    obs.x += (dx * 5) * dt;
                    obs.y += (dy * 5) * dt;
                    engine.magnetUsedThisRun = true;
                } else {
                    obs.x -= player.forwardSpeed * dt;
                }
            } else {
                obs.x -= player.forwardSpeed * dt;
            }

            // Return to pool if past the left edge of the screen
            if (obs.x + obs.width < 0) {
                if (obs.type === 'portal') {
                    // Evaded portal!
                    engine.evadePortal();
                }
                this.obstaclePool.release(obs);
                this.activeObstacles.splice(i, 1);
            }
        }

        // Generate new obstacles if not in portal mode
        if (!this.portalMode) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnObstacle();
                // Faster spawning as player speeds up
                this.spawnInterval = Math.max(0.5, 1.5 - (player.forwardSpeed / 1000));
                this.spawnTimer = this.spawnInterval;
            }

            // Rocket spawning logic
            this.rocketSpawnTimer -= dt;
            if (this.rocketSpawnTimer <= 0) {
                this.spawnRocket();
                this.rocketSpawnTimer = this.getRocketSpawnInterval(engine.riskTier);
            }
        }

        // Rocket update logic
        for (let i = this.activeRockets.length - 1; i >= 0; i--) {
            const roc = this.activeRockets[i];
            
            if (!roc.active) {
                this.rocketPool.release(roc);
                this.activeRockets.splice(i, 1);
                continue;
            }

            if (roc.warningTimer > 0) {
                roc.warningTimer -= dt;
            } else if (!roc.isLaunching) {
                roc.isLaunching = true;
                roc.speed = player.forwardSpeed * 1.5;
            }

            if (roc.isLaunching) {
                roc.x -= roc.speed * dt;
                if (roc.x + roc.width < 0) {
                    this.rocketPool.release(roc);
                    this.activeRockets.splice(i, 1);
                }
            }
        }
    }

    public triggerPortal() {
        this.portalMode = true;
        const obs = this.obstaclePool.acquire();
        if (obs) {
            obs.type = 'portal';
            obs.width = 100;
            obs.height = 400;
            obs.x = 1920; 
            obs.y = 540 - 200; // Centered vertically
            this.activeObstacles.push(obs);
        }
    }

    private spawnObstacle() {
        const obs = this.obstaclePool.acquire();
        if (obs) {
            // Randomize type: 40% floor, 40% ceiling, 20% crystal
            const rand = Math.random();
            if (rand < 0.4) {
                obs.type = 'floor';
                obs.width = 40 + Math.random() * 60;
                obs.height = 40 + Math.random() * 100;
                obs.x = 1920; // Spawn just off-screen right
                obs.y = 1080 - obs.height; // Rest on floor
            } else if (rand < 0.8) {
                obs.type = 'ceiling';
                obs.width = 40 + Math.random() * 60;
                obs.height = 40 + Math.random() * 100;
                obs.x = 1920;
                obs.y = 0; // Hang from ceiling
            } else {
                obs.type = 'crystal';
                obs.width = 32;
                obs.height = 32;
                obs.x = 1920;
                // Middle Y-range around 540
                obs.y = 540 - 16 + (Math.random() * 100 - 50); 
            }
            this.activeObstacles.push(obs);
        }
    }

    private spawnRocket() {
        const roc = this.rocketPool.acquire();
        if (roc) {
            // Pick a random Y-position (either Y: 200 near the ceiling or Y: 880 near the floor)
            roc.y = Math.random() > 0.5 ? 200 : 880;
            roc.x = 1920;
            roc.warningTimer = 1.0;
            roc.isLaunching = false;
            this.activeRockets.push(roc);
        }
    }

    public render(ctx: CanvasRenderingContext2D) {
        const now = performance.now();

        for (const obs of this.activeObstacles) {
            if (obs.type === 'portal') {
                // === NEON OVAL PORTAL ===
                ctx.save();
                const cx = obs.x + obs.width / 2;
                const cy = obs.y + obs.height / 2;
                const rx = obs.width / 2;
                const ry = obs.height / 2;

                // Outer glow ellipse
                ctx.shadowColor = '#9d00ff';
                ctx.shadowBlur = 25;
                const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry);
                gradient.addColorStop(0, 'rgba(157, 0, 255, 0.35)');
                gradient.addColorStop(0.5, 'rgba(255, 0, 170, 0.15)');
                gradient.addColorStop(1, 'rgba(157, 0, 255, 0.05)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();

                // Neon border ring
                ctx.strokeStyle = '#9d00ff';
                ctx.lineWidth = 2.5;
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.restore();

            } else if (obs.type === 'crystal') {
                // === DIAMOND CRYSTAL (45° rotated) ===
                ctx.save();
                ctx.shadowColor = '#00f3ff';
                ctx.shadowBlur = 15;

                const halfW = obs.width / 2;
                const halfH = obs.height / 2;
                ctx.translate(obs.x + halfW, obs.y + halfH);
                ctx.rotate(Math.PI / 4);
                ctx.fillStyle = '#00a8ff';
                ctx.fillRect(-halfW / 1.4, -halfH / 1.4, obs.width / 1.4, obs.height / 1.4);

                ctx.restore();

            } else {
                // === FLOOR / CEILING OBSTACLES ===
                ctx.fillStyle = '#161925';
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

                ctx.shadowColor = '#00f3ff';
                ctx.shadowBlur = 8;
                ctx.strokeStyle = '#00f3ff';
                ctx.lineWidth = 1;
                ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
            }
        }

        // Reset shadow state after obstacles
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        // === ROCKETS ===
        for (const roc of this.activeRockets) {
            if (!roc.isLaunching) {
                // Warning phase — smooth alpha pulse using sin wave
                const pulse = 0.2 + 0.8 * ((Math.sin(now * 0.01 * Math.PI) + 1) / 2);
                ctx.fillStyle = `rgba(255, 0, 60, ${pulse})`;
                ctx.fillRect(1860, roc.y - 5, 40, 40);

                ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
                ctx.font = "bold 22px 'Share Tech Mono', monospace";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('⚠', 1860 + 20, roc.y - 5 + 20);
            } else {
                // Flight phase — sleek crimson dart with exhaust

                // Tiny orange exhaust particles behind the rocket
                const exhaust = [
                    { dx: roc.width + 2, dy: roc.height * 0.3, size: 6, color: '#ff8800', alpha: 0.7 },
                    { dx: roc.width + 12, dy: roc.height * 0.5, size: 5, color: '#ffcc00', alpha: 0.45 },
                    { dx: roc.width + 24, dy: roc.height * 0.7, size: 4, color: '#ff8800', alpha: 0.2 },
                ];
                for (const p of exhaust) {
                    const jitterX = (Math.random() - 0.5) * 4;
                    const jitterY = (Math.random() - 0.5) * 4;
                    ctx.fillStyle = `rgba(${p.color === '#ff8800' ? '255,136,0' : '255,204,0'}, ${p.alpha})`;
                    ctx.beginPath();
                    ctx.arc(roc.x + p.dx + jitterX, roc.y + p.dy + jitterY, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Dart-shaped rocket body
                ctx.shadowColor = '#ff003c';
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#ff003c';
                ctx.beginPath();
                ctx.moveTo(roc.x, roc.y + roc.height * 0.15);               // top-left (slight inset)
                ctx.lineTo(roc.x + roc.width * 0.85, roc.y);                // top-right (pointed)
                ctx.lineTo(roc.x + roc.width, roc.y + roc.height * 0.5);    // nose tip
                ctx.lineTo(roc.x + roc.width * 0.85, roc.y + roc.height);   // bottom-right
                ctx.lineTo(roc.x, roc.y + roc.height * 0.85);               // bottom-left (inset)
                ctx.closePath();
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
            }
        }

        // Final cleanup
        ctx.textBaseline = 'alphabetic';
    }

    public getActiveObstacles(): Obstacle[] {
        return this.activeObstacles;
    }

    public getActiveRockets(): Rocket[] {
        return this.activeRockets;
    }
    
    public reset() {
        for (const obs of this.activeObstacles) {
            this.obstaclePool.release(obs);
        }
        for (const roc of this.activeRockets) {
            this.rocketPool.release(roc);
        }
        this.activeObstacles = [];
        this.activeRockets = [];
        this.spawnTimer = 0;
        this.rocketSpawnTimer = this.getRocketSpawnInterval(1);
        this.portalMode = false;
    }
}
