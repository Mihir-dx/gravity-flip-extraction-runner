export type GameState = 'MAIN_MENU' | 'PLAYING' | 'SHOP' | 'CREDITS' | 'GAME_OVER' | 'EXTRACTED' | 'EXIT_SPLASH';

export interface Vector2D {
    x: number;
    y: number;
}

export interface PlayerConfig {
    width: number;
    height: number;
    initialForwardSpeed: number;
    speedIncreaseRate: number;
    gravityForce: number;
}

export interface Obstacle {
    x: number;
    y: number;
    width: number;
    height: number;
    active: boolean;
    type: 'floor' | 'ceiling' | 'crystal' | 'portal';
}

export interface Rocket {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    active: boolean;
    warningTimer: number;
    isLaunching: boolean;
}

export interface EntityPool<T> {
    pool: T[];
    acquire(): T | null;
    release(entity: T): void;
}

export interface UIButton {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    callback: () => void;
}

export interface Upgrades {
    magnetLevel: number;
    hasShield: boolean;
    dampenerLevel: number;
}
