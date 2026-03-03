import { SIZE } from "../data/Config.js";
import { sleep } from "../util/Utils.js";
import { UIController } from "./UIController.js";
import { TimerController } from "./TimerController.js";
import { BoardController } from "./BoardController.js";
import { InputController } from "./InputController.js";
import { Renderer } from "../systems/Renderer.js";
import { UpgradeSystem } from "../systems/UpgradeSystem.js";
import { ScoreSystem } from "../systems/ScoreSystem.js";
import {
    playSfx,
    playBgm,
    stopBgm,
    setMasterVolume,
    toggleMute
} from "../audio/Sfx.js";

export class Game {
    constructor() {
        // UI
        this.upgrades = new UpgradeSystem();
        this.scoreSystem = new ScoreSystem(this.upgrades);
        this.ui = new UIController(this.scoreSystem);

        // 상태 플래그
        this.started = false;
        this.isPreparingStart = false;
        this.isShopOpen = false;

        // DOM
        this.boardEl = document.getElementById("board");

        this.ui.setRestartLabel("시작");

        this.ui.bindRestart(() => {
            if (this.isPreparingStart) return;
            if (this.isGameOver) {
                return this.restart();
            }
            if (!this.started) {
                return this.start();
            }
            return this.restart();
        });

        this.score = 0;
        this.stage = 1;
        this.baseTimeSec = 60;

        this.baseStageScore = 10000;
        this.stageGrowth = 1.15;

        this.stageRequirement = this.baseStageScore;
        this.targetScore = this.stageRequirement;

        this.isBusy = false;
        this.isGameOver = false;
        this.renderer = new Renderer(this.boardEl);

        const cfg = this.scoreSystem.cfg;
        const initialDuration = cfg.getTimeBase() + (this.upgrades.levels?.timeBonus || 0) * cfg.getTimePerLevel();

        this.timerCtrl = new TimerController({
            durationSec: initialDuration,
            onTick: (t) => {
                this.ui.updateTime(t);
            },
            onWarning: (t) => {
                this.boardEl.classList.add("shake");
                this.ui.showCountdown(t);
                playSfx("tick");
            },
            onTimeout: async () => {
                playSfx("gameover");
                await this.playGameOverSequence();
            }
        });

        this.boardCtrl = new BoardController({
            boardEl: this.boardEl,
            renderer: this.renderer,
            upgrades: this.upgrades,
            onScoreChange: (delta, total) => {
                if (!this.started) return;
                this.score = total;
                this.updateHUD();
            },
            onComboPopup: (text) => {
                this.ui.showBigPopup(text);
            },
            onStageCheck: () => {
                this.checkStageProgress();
            }
        });

        this.inputCtrl = new InputController({
            boardCtrl: this.boardCtrl,
            getState: () => ({ isGameOver: this.isGameOver, isBusy: this.isBusy, started: this.started }),
            setBusy: (v) => (this.isBusy = v),
            getScore: () => this.score,
            setScore: (v) => { this.score = v; },
            onAfterResolve: () => {
                this.updateHUD();
                this.checkStageProgress();
            }
        });

        this.ui.bindUpgradeSystem(this.upgrades, (key) => {
            const ok = this.upgrades.buy(key);
            if (ok) {
                this.ui.updatePoints(this.upgrades.points);
                this.ui.refreshShop(this.upgrades);
                playSfx("coin");
            } else {
                playSfx("swap");
            }
        });

        this.ui.bindShopOpen(() => {
            if (!this.isGameOver) return;
            this.isShopOpen = true;
            this.ui.openShopOverlay();
        });

        this.ui.bindShopClose(() => {
            this.isShopOpen = false;
            this.ui.closeShopOverlay();
        });

        this.ui.closeShopOverlay();
        this.ui.hideShopOpenButton();

        // ======================
        // 🔊 Sound Controls
        // ======================

        const soundSlider = document.getElementById("soundVol");
        const muteBtn = document.getElementById("muteBtn");

        if (soundSlider) {
            setMasterVolume(parseFloat(soundSlider.value)); // 초기값 동기화
            soundSlider.addEventListener("input", e => {
                const v = parseFloat(e.target.value);
                setMasterVolume(v);
               
            });
        }

        if (muteBtn) {
            muteBtn.addEventListener("click", () => {
                const muted = toggleMute();
                muteBtn.textContent = muted ? "🔇" : "🔊";
            });
        }

        this.boardCtrl.initBoardEmpty((e, r, c) => this.inputCtrl.onMouseDown(e, r, c));
        this.syncStats();
        this.updateHUD();
        
        // constructor 안, 상태값 추가
        this.lastGainedPoints = 0;

        // constructor 마지막 근처 (초기 상태에서 표시)
        this.ui.showStartGuide();
    }

    async _playStartCountdown() {
        this.ui.hideCountdown();
        for (let sec = 3; sec >= 1; sec--) {
            this.ui.showCountdown(sec);
            playSfx("tick");
            await sleep(1000);
        }
        this.ui.hideCountdown();
    }

    updateHUD() {
        this.ui.updateHUD({
            score: this.score,
            stage: this.stage,
            targetScore: this.targetScore
        });
    }

    syncStats() {
        console.log("[Game] syncStats() 호출 - GameConfig:", this.scoreSystem.cfg);
        const cfg = this.scoreSystem.cfg;
        const finalTime = cfg.getTimeBase() + (this.upgrades.levels?.timeBonus || 0) * cfg.getTimePerLevel();
        this.ui.updateTime(finalTime);
        this.ui.refreshShop(this.upgrades);
        this.ui.updatePoints(this.upgrades.points);
    }

    async start() {
        if (this.started || this.isPreparingStart) return;
        this.isPreparingStart = true;

        try {
            this.started = false;
            this.isGameOver = false;

            this.isShopOpen = false;
            this.ui.closeShopOverlay();
            this.ui.hideShopOpenButton();

            this.ui.hideGameOver();
            document.getElementById("gameWrap").classList.remove("gameover");

            // ✅ 시작 클릭 후 1초 뒤 가이드 숨김
            setTimeout(() => this.ui.hideStartGuide(), 1000);

            this.score = 0;
            this.stage = 1;
            this.stageRequirement = this.baseStageScore;
            this.targetScore = this.stageRequirement;
            this.updateHUD();

            const fillPromise = this.boardCtrl.initBoardAnimated(
                (e, r, c) => this.inputCtrl.onMouseDown(e, r, c),
                1600
            );
            await this._playStartCountdown();
            await fillPromise;

            playBgm();
            this.started = true;
            document.getElementById("gameWrap").classList.add("playing");
            this.startTimer();
            this.ui.setRestartLabel("");
        } finally {
            this.isPreparingStart = false;
        }
    }

    async restart() {
        if (this.isPreparingStart) return;
        this.isPreparingStart = true;

        try {
            this.started = false;
            this.isGameOver = false;

            this.isShopOpen = false;
            this.ui.closeShopOverlay();
            this.ui.hideShopOpenButton();

            this.ui.hideGameOver();

            document.getElementById("gameWrap").classList.remove("gameover");
            document.getElementById("gameWrap").classList.remove("playing");

            this.boardEl.querySelectorAll(".cell").forEach(d => {
                d.classList.remove("gameover-explode");
            });

            this.score = 0;
            this.stage = 1;
            this.stageRequirement = this.baseStageScore;
            this.targetScore = this.stageRequirement;

            this.syncStats();
            this.updateHUD();

            const fillPromise = this.boardCtrl.initBoardAnimated(
                (e, r, c) => this.inputCtrl.onMouseDown(e, r, c),
                1600
            );
            await this._playStartCountdown();
            await fillPromise;

            playBgm();
            this.started = true;
            this.startTimer();
            this.ui.setRestartLabel("");
            document.getElementById("gameWrap").classList.add("playing");
        } finally {
            this.isPreparingStart = false;
        }
    }

    initBoard() {
        this.boardCtrl.initBoard((e, r, c) => this.inputCtrl.onMouseDown(e, r, c));
    }

    async playGameOverSequence() {
        this.isGameOver = true;
        this.ui.hideCountdown();

        stopBgm(true);

        try { this.timerCtrl.stop(); } catch (e) { }

        const boardModel = this.boardCtrl.getBoardModel();
        const scoreRef = { value: this.score };

        while (true) {
            const board = boardModel.get();
            let found = false;
            for (let r = 0; r < SIZE && !found; r++) {
                for (let c = 0; c < SIZE && !found; c++) {
                    const cell = board[r][c];
                    if (cell && (cell.special === "bomb" || cell.special === "cross")) {
                        found = true;
                        await this.boardCtrl.triggerAt(r, c, scoreRef);
                    }
                }
            }
            if (!found) break;
            await sleep(120);
        }

        this.score = scoreRef.value;
        this.updateHUD();
        this.started = false;

        this.boardEl.classList.remove("shake");
        const SIZE_LOCAL = SIZE;
        for (let r = 0; r < SIZE_LOCAL; r++) {
            for (let c = 0; c < SIZE_LOCAL; c++) {
                const idx = r * SIZE_LOCAL + c;
                const div = this.boardEl.children[idx];
                if (div) div.classList.add("gameover-explode");
            }
            playSfx("bomb");
            await sleep(150);
        }

        await sleep(200);

        const gainedPoints = Math.floor(this.score / 10000);
        this.lastGainedPoints = gainedPoints;
        this.upgrades.addPoints(gainedPoints);
        const maxCombo = this.boardCtrl.getMaxCombo ? this.boardCtrl.getMaxCombo() : 0;

        document.getElementById("gameWrap").classList.remove("playing");
        document.getElementById("gameWrap").classList.add("gameover");

        const restartBtn = document.getElementById("restart");
        if (restartBtn) {
            try {
                restartBtn.removeAttribute("disabled");
                restartBtn.disabled = false;
                restartBtn.classList.remove("disabled");
            } catch (e) {
                console.warn("restart button enable failed", e);
            }
        }

        this.ui.updatePoints(this.upgrades.points);
        this.ui.refreshShop(this.upgrades);
        this.ui.showGameOver(this.score, gainedPoints, maxCombo);
        this.ui.showShopOpenButton(this.lastGainedPoints);
        this.ui.setRestartLabel("다시 시작");
    }

    checkStageProgress() {
        if (this.score < this.targetScore) return;

        this.stage++;
        this.stageRequirement = Math.floor(this.stageRequirement * this.stageGrowth);
        this.stageRequirement = Math.round(this.stageRequirement / 1000) * 1000;

        this.targetScore += this.stageRequirement;
        this.targetScore = Math.round(this.targetScore / 1000) * 1000;

        this.updateHUD();
        this.ui.showStageBanner(this.stage);
    }

    startTimer() {
        this.isGameOver = false;

        this.boardEl.classList.remove("shake");
        this.ui.hideCountdown();

        const cfg = this.scoreSystem.cfg;
        const finalTime = cfg.getTimeBase() + (this.upgrades.levels?.timeBonus || 0) * cfg.getTimePerLevel();

        this.timerCtrl.setDuration(finalTime);
        this.timerCtrl.start();
    }
}
