import type { GameState, UIButton, Upgrades } from './Types';
import { Player } from './Player';
import { Environment } from './Environment';

export class Engine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private gameState: GameState = 'MAIN_MENU';

    public player: Player;
    public environment: Environment;

    private lastTime: number = 0;
    private accumulator: number = 0;
    private readonly TIME_STEP = 1 / 60;

    private score: number = 0;
    private animationFrameId: number = 0;

    // Advanced Economy State
    private unsecuredCrystals: number = 0;
    public upgrades: Upgrades = {
        magnetLevel: 0,
        hasShield: false,
        dampenerLevel: 0
    };
    private securedCrystals: number = 0;
    public riskTier: number = 1;
    private lastPortalThreshold: number = 0;
    private bestScore: number = 0;

    // UI State
    private activeButtons: UIButton[] = [];

    // Mechanics State
    private flashAlpha: number = 0;
    private slowTimer: number = 0;
    public magnetUsedThisRun: boolean = false;

    // Render-only state
    private gridOffset: number = 0;
    private scanlineOffset: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error("Could not get 2D context");
        this.ctx = context;

        this.loadUpgrades();

        this.setupCanvas();

        this.player = new Player({
            width: 64,
            height: 64,
            initialForwardSpeed: 400,
            speedIncreaseRate: 20,
            gravityForce: 3000
        });

        this.environment = new Environment();

        this.setupInput();
        this.setGameState('MAIN_MENU'); // Initialize UI buttons
    }

    private loadUpgrades() {
        const savedSecured = localStorage.getItem('securedCrystals');
        if (savedSecured) this.securedCrystals = parseInt(savedSecured, 10) || 0;

        const savedMagnet = localStorage.getItem('magnetLevel');
        if (savedMagnet) this.upgrades.magnetLevel = parseInt(savedMagnet, 10) || 0;

        const savedShield = localStorage.getItem('hasShield');
        if (savedShield) this.upgrades.hasShield = savedShield === 'true';

        const savedDampener = localStorage.getItem('dampenerLevel');
        if (savedDampener) this.upgrades.dampenerLevel = parseInt(savedDampener, 10) || 0;

        const savedBestScore = localStorage.getItem('bestScore');
        if (savedBestScore) this.bestScore = parseInt(savedBestScore, 10) || 0;
    }

    public saveUpgrades() {
        localStorage.setItem('securedCrystals', this.securedCrystals.toString());
        localStorage.setItem('magnetLevel', this.upgrades.magnetLevel.toString());
        localStorage.setItem('hasShield', this.upgrades.hasShield.toString());
        localStorage.setItem('dampenerLevel', this.upgrades.dampenerLevel.toString());
        localStorage.setItem('bestScore', this.bestScore.toString());
    }

    private setupCanvas() {
        const logicalWidth = 1920;
        const logicalHeight = 1080;
        const dpr = window.devicePixelRatio || 1;

        this.canvas.style.width = `${logicalWidth}px`;
        this.canvas.style.height = `${logicalHeight}px`;
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '100%';
        this.canvas.style.objectFit = 'contain';

        this.canvas.width = logicalWidth * dpr;
        this.canvas.height = logicalHeight * dpr;

        this.ctx.scale(dpr, dpr);
        this.ctx.imageSmoothingEnabled = false;
    }

    private setupInput() {
        // Keyboard mapping
        window.addEventListener('keydown', (e) => {
            if (this.gameState === 'PLAYING') {
                if (e.code === 'Space') {
                    this.player.flipGravity(this);
                    e.preventDefault();
                }
            } else {
                // Menu hotkeys
                const code = e.code;
                if (this.gameState === 'MAIN_MENU') {
                    if (code === 'Space') this.startGame();
                    else if (code === 'KeyS') this.setGameState('SHOP');
                    else if (code === 'KeyX') this.setGameState('EXIT_SPLASH');
                    else if (code === 'KeyC') this.setGameState('CREDITS');
                } else if (this.gameState === 'SHOP') {
                    if (code === 'Escape') this.setGameState('MAIN_MENU');
                    else if (code === 'Digit1' || code === 'Numpad1') this.buyMagnet();
                    else if (code === 'Digit2' || code === 'Numpad2') this.buyShield();
                    else if (code === 'Digit3' || code === 'Numpad3') this.buyDampener();
                } else if (this.gameState === 'CREDITS') {
                    if (code === 'Escape') this.setGameState('MAIN_MENU');
                } else if (this.gameState === 'GAME_OVER' || this.gameState === 'EXTRACTED') {
                    if (code === 'Space' || code === 'Escape') this.setGameState('MAIN_MENU');
                }
            }
        });

        // Mouse/Touch mapping
        const handlePointer = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();

            if (this.gameState === 'PLAYING') {
                this.player.flipGravity(this);
                return;
            }

            let clientX = 0;
            let clientY = 0;
            if (window.TouchEvent && e instanceof TouchEvent) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // Map coordinate to 1920x1080
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = 1920 / rect.width;
            const scaleY = 1080 / rect.height;
            const mouseX = (clientX - rect.left) * scaleX;
            const mouseY = (clientY - rect.top) * scaleY;

            for (const btn of this.activeButtons) {
                if (mouseX >= btn.x && mouseX <= btn.x + btn.width &&
                    mouseY >= btn.y && mouseY <= btn.y + btn.height) {
                    btn.callback();
                    break;
                }
            }
        };

        this.canvas.addEventListener('mousedown', handlePointer);
        this.canvas.addEventListener('touchstart', handlePointer, { passive: false });
    }

    public setGameState(state: GameState) {
        this.gameState = state;
        this.activeButtons = [];

        if (state === 'MAIN_MENU') {
            this.activeButtons.push({
                id: 'btn_start', x: 800, y: 400, width: 320, height: 60,
                text: 'START RUN [SPACE]', callback: () => this.startGame()
            });
            this.activeButtons.push({
                id: 'btn_shop', x: 800, y: 500, width: 320, height: 60,
                text: 'UPGRADES SHOP [S]', callback: () => this.setGameState('SHOP')
            });
            this.activeButtons.push({
                id: 'btn_exit', x: 800, y: 600, width: 320, height: 60,
                text: 'EXIT SYSTEM [X]', callback: () => this.setGameState('EXIT_SPLASH')
            });
            this.activeButtons.push({
                id: 'btn_credits', x: 1560, y: 980, width: 320, height: 60,
                text: 'SYSTEM CREDITS [C]', callback: () => this.setGameState('CREDITS')
            });
        } else if (state === 'SHOP') {
            const magCost = this.upgrades.magnetLevel * 150 + 100;
            this.activeButtons.push({
                id: 'btn_magnet', x: 480, y: 350, width: 960, height: 70,
                text: `Buy Magnetic Pull | Cost: ${magCost} [Key: 1]`,
                callback: () => this.buyMagnet()
            });
            this.activeButtons.push({
                id: 'btn_shield', x: 480, y: 450, width: 960, height: 70,
                text: `Buy Kinetic Shield (${this.upgrades.hasShield ? 'OWNED' : 'READY'}) | Cost: 150 [Key: 2]`,
                callback: () => this.buyShield()
            });
            this.activeButtons.push({
                id: 'btn_dampener', x: 480, y: 550, width: 960, height: 70,
                text: `Buy Gravity Dampener (Lvl ${this.upgrades.dampenerLevel}/1) | Cost: 400 [Key: 3]`,
                callback: () => this.buyDampener()
            });
            this.activeButtons.push({
                id: 'btn_back', x: 800, y: 750, width: 320, height: 60,
                text: 'RETURN [ESC]', callback: () => this.setGameState('MAIN_MENU')
            });
        } else if (state === 'CREDITS') {
            this.activeButtons.push({
                id: 'btn_back', x: 800, y: 700, width: 320, height: 60,
                text: 'RETURN [ESC]', callback: () => this.setGameState('MAIN_MENU')
            });
        } else if (state === 'GAME_OVER' || state === 'EXTRACTED') {
            if (this.magnetUsedThisRun) {
                this.upgrades.magnetLevel = 0;
                this.saveUpgrades();
            }
            this.activeButtons.push({
                id: 'btn_back', x: 800, y: 750, width: 320, height: 60,
                text: 'RETURN [ESC]', callback: () => this.setGameState('MAIN_MENU')
            });
        }
    }

    private startGame() {
        this.player = new Player({
            width: 64,
            height: 64,
            initialForwardSpeed: 400,
            speedIncreaseRate: 20,
            gravityForce: 3000
        });
        this.environment.reset();
        this.score = 0;
        this.unsecuredCrystals = 0;
        this.riskTier = 1;
        this.lastPortalThreshold = 0;
        this.flashAlpha = 0;
        this.slowTimer = 0;
        this.magnetUsedThisRun = false;
        this.setGameState('PLAYING');
    }

    public buyMagnet() {
        const cost = this.upgrades.magnetLevel * 150 + 100;
        if (this.upgrades.magnetLevel < 3 && this.securedCrystals >= cost) {
            this.securedCrystals -= cost;
            this.upgrades.magnetLevel++;
            this.saveUpgrades();
            this.setGameState('SHOP'); // refresh buttons
        }
    }

    public buyShield() {
        if (!this.upgrades.hasShield && this.securedCrystals >= 150) {
            this.securedCrystals -= 150;
            this.upgrades.hasShield = true;
            this.saveUpgrades();
            this.setGameState('SHOP');
        }
    }

    public buyDampener() {
        if (this.upgrades.dampenerLevel < 1 && this.securedCrystals >= 400) {
            this.securedCrystals -= 400;
            this.upgrades.dampenerLevel++;
            this.saveUpgrades();
            this.setGameState('SHOP');
        }
    }

    public collectCrystal() {
        this.unsecuredCrystals += 1 * this.riskTier;
        this.flashAlpha = 1.0;
    }

    public extract() {
        this.setGameState('EXTRACTED');
        this.securedCrystals += this.unsecuredCrystals;
        this.saveUpgrades();
    }

    public evadePortal() {
        this.riskTier++;
        this.player.forwardSpeed *= 1.2;
        this.environment.portalMode = false;
    }

    public triggerTimeSlow() {
        this.slowTimer = 0.15; // 150ms
    }

    public start() {
        this.lastTime = performance.now();
        this.animationFrameId = requestAnimationFrame((time) => this.loop(time));
    }

    public stop() {
        cancelAnimationFrame(this.animationFrameId);
    }

    private loop(time: number) {
        let rawDt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        if (rawDt > 0.25) rawDt = 0.25;

        // Apply Dampener time-scale matrix
        let dt = rawDt;
        if (this.slowTimer > 0) {
            this.slowTimer -= rawDt;
            dt *= 0.5; // slow down by 50%
        }

        this.accumulator += dt;
        while (this.accumulator >= this.TIME_STEP) {
            this.update(this.TIME_STEP);
            this.accumulator -= this.TIME_STEP;
        }

        this.render();
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    }

    private update(dt: number) {
        if (this.gameState === 'PLAYING') {
            this.player.update(dt, this);
            this.environment.update(dt, this);

            this.score += (this.player.forwardSpeed * dt) / 10;
            if (Math.floor(this.score) > this.bestScore) {
                this.bestScore = Math.floor(this.score);
                this.saveUpgrades();
            }

            if (Math.floor(this.score / 1000) > this.lastPortalThreshold) {
                this.lastPortalThreshold++;
                this.environment.triggerPortal();
            }

            if (this.flashAlpha > 0) {
                this.flashAlpha -= dt * 3;
                if (this.flashAlpha < 0) this.flashAlpha = 0;
            }
        }
    }

    private render() {
        const ctx = this.ctx;

        // === DEEP MIDNIGHT CHARCOAL BACKGROUND ===
        ctx.fillStyle = '#0a0b10';
        ctx.fillRect(0, 0, 1920, 1080);

        // === SCROLLING BACKGROUND GRID (gameplay + menus) ===
        if (this.gameState === 'PLAYING') {
            this.gridOffset += this.player.forwardSpeed * (1 / 60) * 0.5;
        } else {
            this.gridOffset += 0.3; // slow ambient drift on menus
        }
        this.drawGrid(ctx);

        if (this.gameState === 'PLAYING') {
            this.environment.render(ctx);
            this.player.render(ctx);

            // Crystal collection flash
            if (this.flashAlpha > 0) {
                ctx.fillStyle = `rgba(0, 255, 255, ${this.flashAlpha * 0.2})`;
                ctx.fillRect(0, 0, 1920, 1080);
            }

            // === NEON ARCADE HUD ===
            this.drawHUD(ctx);

        } else if (this.gameState === 'MAIN_MENU') {
            this.drawScanlines(ctx);

            // Title with neon green glow
            ctx.save();
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 25;
            ctx.fillStyle = '#00ff66';
            ctx.font = "bold 58px 'Orbitron', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText('GRAVITY-FLIP', 960, 180);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();

            // Subtitle
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = "24px 'Share Tech Mono', monospace";
            ctx.textAlign = 'center';
            ctx.fillText('E X T R A C T I O N   R U N N E R', 960, 240);

            // Banked crystals display
            ctx.fillStyle = '#00f3ff';
            ctx.font = "20px 'Share Tech Mono', monospace";
            ctx.fillText(`[ BANKED: ${this.securedCrystals} CRYSTALS ]`, 960, 310);

            // Best score
            ctx.fillStyle = '#ffaa00';
            ctx.fillText(`BEST SCORE: ${this.bestScore}`, 960, 345);

            this.renderCyberButtons(ctx);

        } else if (this.gameState === 'SHOP') {
            this.drawScanlines(ctx);

            ctx.save();
            ctx.shadowColor = '#00f3ff';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#00f3ff';
            ctx.font = "bold 52px 'Orbitron', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText('QUANTUM UPGRADES', 960, 150);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();

            ctx.fillStyle = '#00ff66';
            ctx.font = "28px 'Share Tech Mono', monospace";
            ctx.fillText(`[ BANKED CRYSTALS: ${this.securedCrystals} ]`, 960, 220);

            // Upgrade status indicators
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = "18px 'Share Tech Mono', monospace";
            ctx.fillText(`MAGNET Lvl ${this.upgrades.magnetLevel}/3  |  SHIELD: ${this.upgrades.hasShield ? 'ACTIVE' : 'NONE'}  |  DAMPENER Lvl ${this.upgrades.dampenerLevel}/1`, 960, 270);

            this.renderCyberButtons(ctx);

        } else if (this.gameState === 'CREDITS') {
            this.drawScanlines(ctx);

            ctx.save();
            ctx.shadowColor = '#9d00ff';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#9d00ff';
            ctx.font = "bold 52px 'Orbitron', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText('SYSTEM CREDITS', 960, 280);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();

            ctx.fillStyle = 'white';
            ctx.font = "32px 'Share Tech Mono', monospace";
            ctx.fillText('Designed & Developed by: Mihir', 960, 400);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = "22px 'Share Tech Mono', monospace";
            ctx.fillText('Built for Lila Games', 960, 470);

            // Decorative separator
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(660, 520);
            ctx.lineTo(1260, 520);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = "16px 'Share Tech Mono', monospace";
            ctx.fillText('HTML5 Canvas • TypeScript • Vite', 960, 560);

            this.renderCyberButtons(ctx);

        } else if (this.gameState === 'EXIT_SPLASH') {
            // Terminal-style green text on black
            ctx.fillStyle = '#00ff66';
            ctx.textAlign = 'center';
            ctx.font = "bold 32px 'Share Tech Mono', monospace";

            ctx.save();
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 10;
            ctx.fillText('> APPLICATION TERMINATED.', 960, 440);
            ctx.shadowBlur = 0;
            ctx.restore();

            ctx.fillStyle = 'rgba(0, 255, 102, 0.6)';
            ctx.font = "24px 'Share Tech Mono', monospace";
            ctx.fillText('> Please refresh the page to play again.', 960, 510);
            ctx.fillText('> Thank you for testing this prototype!', 960, 560);

            // Blinking cursor
            if (Math.floor(performance.now() / 500) % 2 === 0) {
                ctx.fillStyle = '#00ff66';
                ctx.fillRect(1155, 548, 14, 24);
            }

        } else if (this.gameState === 'GAME_OVER') {
            this.environment.render(ctx);
            this.player.render(ctx);

            // Dark red vignette overlay
            const vig = ctx.createRadialGradient(960, 540, 200, 960, 540, 1000);
            vig.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
            vig.addColorStop(1, 'rgba(40, 0, 0, 0.85)');
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, 1920, 1080);

            // Title
            ctx.save();
            ctx.shadowColor = '#ff003c';
            ctx.shadowBlur = 30;
            ctx.fillStyle = '#ff003c';
            ctx.font = "bold 80px 'Orbitron', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText('MIA: CRYSTALS LOST', 960, 380);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();

            ctx.fillStyle = 'white';
            ctx.font = "42px 'Share Tech Mono', monospace";
            ctx.fillText(`Final Score: ${Math.floor(this.score)}`, 960, 490);

            ctx.fillStyle = '#ffaa00';
            ctx.font = "30px 'Share Tech Mono', monospace";
            ctx.fillText(`Best Score: ${this.bestScore}`, 960, 550);

            // Risk tier achieved
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = "22px 'Share Tech Mono', monospace";
            ctx.fillText(`Risk Tier Reached: x${this.riskTier}`, 960, 600);

            this.renderCyberButtons(ctx);

        } else if (this.gameState === 'EXTRACTED') {
            // Green-tinted overlay
            const exVig = ctx.createRadialGradient(960, 540, 200, 960, 540, 1000);
            exVig.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
            exVig.addColorStop(1, 'rgba(0, 30, 15, 0.9)');
            ctx.fillStyle = exVig;
            ctx.fillRect(0, 0, 1920, 1080);

            // Title
            ctx.save();
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = 30;
            ctx.fillStyle = '#00ffaa';
            ctx.font = "bold 72px 'Orbitron', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText('EXTRACTION COMPLETE', 960, 370);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();

            ctx.fillStyle = '#00f3ff';
            ctx.font = "40px 'Share Tech Mono', monospace";
            ctx.fillText(`💎 ${this.unsecuredCrystals} Crystals Secured`, 960, 480);

            ctx.fillStyle = 'white';
            ctx.font = "34px 'Share Tech Mono', monospace";
            ctx.fillText(`Score: ${Math.floor(this.score)}`, 960, 545);

            ctx.fillStyle = '#ffaa00';
            ctx.font = "26px 'Share Tech Mono', monospace";
            ctx.fillText(`Best Score: ${this.bestScore}`, 960, 600);

            // Risk tier achieved
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = "22px 'Share Tech Mono', monospace";
            ctx.fillText(`Risk Tier Reached: x${this.riskTier}`, 960, 645);

            this.renderCyberButtons(ctx);
        }
    }

    // === SCROLLING BACKGROUND GRID ===
    private drawGrid(ctx: CanvasRenderingContext2D) {
        const spacing = 80;
        const offset = this.gridOffset % spacing;

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Vertical lines (scroll left)
        for (let x = -offset; x <= 1920; x += spacing) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 1080);
        }

        // Horizontal lines (static)
        for (let y = 0; y <= 1080; y += spacing) {
            ctx.moveTo(0, y);
            ctx.lineTo(1920, y);
        }

        ctx.stroke();
    }

    // === SUBTLE SCANLINE OVERLAY FOR MENUS ===
    private drawScanlines(ctx: CanvasRenderingContext2D) {
        this.scanlineOffset = (this.scanlineOffset + 0.3) % 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        for (let y = this.scanlineOffset; y < 1080; y += 4) {
            ctx.fillRect(0, y, 1920, 2);
        }
    }

    // === NEON ARCADE HUD ===
    private drawHUD(ctx: CanvasRenderingContext2D) {
        ctx.textAlign = 'left';

        // Score — neon green with CRT shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 255, 102, 0.4)';
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#00ff66';
        ctx.font = "bold 32px 'Share Tech Mono', monospace";
        ctx.fillText(`SCORE  ${Math.floor(this.score)}`, 40, 55);
        ctx.restore();

        // Risk tier badge
        ctx.fillStyle = this.riskTier >= 3 ? '#ff003c' : '#ffaa00';
        ctx.font = "bold 22px 'Share Tech Mono', monospace";
        ctx.fillText(`RISK x${this.riskTier}`, 40, 85);

        // Crystals — cyan
        ctx.save();
        ctx.shadowColor = 'rgba(0, 243, 255, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#00f3ff';
        ctx.font = "26px 'Share Tech Mono', monospace";
        ctx.fillText(`💎 RUN: ${this.unsecuredCrystals}`, 40, 125);
        ctx.fillStyle = 'rgba(0, 243, 255, 0.6)';
        ctx.fillText(`🏦 BANK: ${this.securedCrystals}`, 40, 160);
        ctx.restore();

        // Best score — gold, top right
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffaa00';
        ctx.font = "22px 'Share Tech Mono', monospace";
        ctx.fillText(`BEST: ${this.bestScore}`, 1880, 55);

        // Shield indicator
        if (this.upgrades.hasShield) {
            ctx.fillStyle = '#00ff66';
            ctx.fillText('🛡 SHIELD ACTIVE', 1880, 85);
        }

        // Speed indicator
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = "18px 'Share Tech Mono', monospace";
        ctx.fillText(`SPD: ${Math.floor(this.player.forwardSpeed)}`, 1880, 115);

        ctx.textAlign = 'left';
    }

    // === BEVELLED WIREFRAME CYBER BUTTONS ===
    private renderCyberButtons(ctx: CanvasRenderingContext2D) {
        const bevel = 8; // corner cut size

        for (const btn of this.activeButtons) {
            const { x, y, width, height } = btn;

            // Dark translucent fill with bevelled corners
            ctx.fillStyle = 'rgba(10, 15, 30, 0.8)';
            ctx.beginPath();
            ctx.moveTo(x + bevel, y);
            ctx.lineTo(x + width - bevel, y);
            ctx.lineTo(x + width, y + bevel);
            ctx.lineTo(x + width, y + height - bevel);
            ctx.lineTo(x + width - bevel, y + height);
            ctx.lineTo(x + bevel, y + height);
            ctx.lineTo(x, y + height - bevel);
            ctx.lineTo(x, y + bevel);
            ctx.closePath();
            ctx.fill();

            // Neon green wireframe border
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Small corner accent marks
            ctx.strokeStyle = 'rgba(0, 255, 102, 0.4)';
            ctx.lineWidth = 1;
            // Top-left accent
            ctx.beginPath();
            ctx.moveTo(x - 4, y + bevel);
            ctx.lineTo(x + bevel, y - 4);
            ctx.stroke();
            // Bottom-right accent
            ctx.beginPath();
            ctx.moveTo(x + width + 4, y + height - bevel);
            ctx.lineTo(x + width - bevel, y + height + 4);
            ctx.stroke();

            // Button text with subtle CRT glow
            ctx.save();
            ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
            ctx.shadowBlur = 4;
            ctx.fillStyle = 'white';
            ctx.font = "22px 'Share Tech Mono', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(btn.text, x + width / 2, y + height / 2);
            ctx.restore();
        }

        ctx.textBaseline = 'alphabetic';
    }
}
