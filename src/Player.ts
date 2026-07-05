import type { Vector2D, PlayerConfig, Obstacle, Rocket } from './Types';
import type { Engine } from './Engine';

export class Player {
    public position: Vector2D;
    public velocity: Vector2D;
    public config: PlayerConfig;
    
    // Gravity direction: 1 for normal (down), -1 for flipped (up)
    public gravityDirection: number = 1;
    public forwardSpeed: number;
    public invulnerableTimer: number = 0;

    // Ghost trail ring buffer for motion blur effect (render-only)
    private trailPositions: { x: number; y: number }[] = [];

    constructor(config: PlayerConfig) {
        this.config = config;
        this.position = { x: 100, y: 200 };
        this.velocity = { x: 0, y: 0 };
        this.forwardSpeed = config.initialForwardSpeed;
    }

    public update(dt: number, engine: Engine) {
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer -= dt;
        }

        // Increase forward speed over time
        this.forwardSpeed += this.config.speedIncreaseRate * dt;

        // Apply gravity
        this.velocity.y += this.config.gravityForce * this.gravityDirection * dt;
        this.position.y += this.velocity.y * dt;

        // Keep player within logical vertical bounds (0 to 1080)
        // If hitting floor/ceiling, stop vertical velocity
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
        } else if (this.position.y + this.config.height >= 1080) {
            this.position.y = 1080 - this.config.height;
            this.velocity.y = 0;
        }

        // We simulate forward movement by advancing a virtual X coordinate
        // or by keeping the player X fixed and moving the environment.
        // For physics, we'll keep player X fixed on screen (e.g., at x=100)
        // and the environment will use the `forwardSpeed` to scroll left.
        
        // AABB Collision Detection against active hazards
        const hazards = engine.environment.getActiveObstacles();
        for (const hazard of hazards) {
            if (this.checkCollision(hazard)) {
                if (hazard.type === 'crystal') {
                    // Handle crystal collection
                    hazard.active = false;
                    engine.collectCrystal();
                } else if (hazard.type === 'portal') {
                    hazard.active = false;
                    engine.extract();
                } else {
                    // Hit floor/ceiling obstacle
                    if (this.invulnerableTimer <= 0) {
                        if (engine.upgrades.hasShield) {
                            // Consume shield and become invulnerable
                            engine.upgrades.hasShield = false;
                            engine.saveUpgrades();
                            this.invulnerableTimer = 1.5; // 1.5 seconds of invulnerability
                        } else {
                            // GAME OVER
                            engine.setGameState('GAME_OVER');
                            break;
                        }
                    }
                }
            }
        }

        // Rocket Collision Detection
        const rockets = engine.environment.getActiveRockets();
        for (const roc of rockets) {
            if (roc.isLaunching && this.checkRocketCollision(roc)) {
                if (this.invulnerableTimer <= 0) {
                    if (engine.upgrades.hasShield) {
                        engine.upgrades.hasShield = false;
                        engine.saveUpgrades();
                        this.invulnerableTimer = 1.5;
                    } else {
                        engine.setGameState('GAME_OVER');
                        break;
                    }
                }
            }
        }
    }

    public render(ctx: CanvasRenderingContext2D) {
        // Update ghost trail ring buffer (keep last 3 positions)
        this.trailPositions.push({ x: this.position.x, y: this.position.y });
        if (this.trailPositions.length > 4) {
            this.trailPositions.shift();
        }

        // Draw motion blur ghost trail (oldest to newest, fading in)
        const trailAlphas = [0.05, 0.10, 0.18];
        const trailOffsets = [12, 7, 3]; // pixel offset behind player
        for (let i = 0; i < Math.min(3, this.trailPositions.length - 1); i++) {
            const tp = this.trailPositions[i];
            const alpha = trailAlphas[i];
            const xOff = trailOffsets[i];
            ctx.fillStyle = `rgba(255, 0, 119, ${alpha})`;
            ctx.fillRect(tp.x - xOff, tp.y, this.config.width, this.config.height);
        }

        // Draw main player body with neon glow
        if (this.invulnerableTimer > 0) {
            // Flash between bright white glow and dim translucent magenta
            if (Math.floor(this.invulnerableTimer * 10) % 2 === 0) {
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 20;
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.shadowColor = '#ff0077';
                ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(255, 0, 119, 0.25)';
            }
        } else {
            ctx.shadowColor = '#ff0077';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#ff0077';
        }

        ctx.fillRect(this.position.x, this.position.y, this.config.width, this.config.height);

        // Reset shadow immediately for performance
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    public flipGravity(engine?: Engine) {
        this.gravityDirection *= -1;
        if (engine && engine.upgrades.dampenerLevel > 0) {
            engine.triggerTimeSlow();
        }
    }

    private checkCollision(obstacle: Obstacle): boolean {
        if (obstacle.type === 'portal') {
            const cx = obstacle.x + obstacle.width / 2;
            const cy = obstacle.y + obstacle.height / 2;
            const rx = obstacle.width / 2;
            const ry = obstacle.height / 2;

            const px = Math.max(this.position.x, Math.min(cx, this.position.x + this.config.width));
            const py = Math.max(this.position.y, Math.min(cy, this.position.y + this.config.height));

            const dx = (px - cx) / rx;
            const dy = (py - cy) / ry;

            return (dx * dx + dy * dy) <= 1;
        }

        return (
            this.position.x < obstacle.x + obstacle.width &&
            this.position.x + this.config.width > obstacle.x &&
            this.position.y < obstacle.y + obstacle.height &&
            this.position.y + this.config.height > obstacle.y
        );
    }

    private checkRocketCollision(rocket: Rocket): boolean {
        return (
            this.position.x < rocket.x + rocket.width &&
            this.position.x + this.config.width > rocket.x &&
            this.position.y < rocket.y + rocket.height &&
            this.position.y + this.config.height > rocket.y
        );
    }
}
