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
    setBgmVolume,
    toggleMute
} from "../audio/Sfx.js";

export class Game {
    constructor() {
        // UI
        this.upgrades = new UpgradeSystem();
        this.scoreSystem = new ScoreSystem(this.upgrades);   // ✅ 먼저 생성

        
        this.ui = new UIController(this.scoreSystem);        // ✅ 이제 정상적으로 주입

        // 상태 플래그: 아직 시작하지 않음
        this.started = false;

        // DOM
        this.boardEl = document.getElementById("board");

        // 버튼 초기 라벨을 "시작"으로 설정
        this.ui.setRestartLabel("시작");

        // bind restart 클릭:
        this.ui.bindRestart(() => {
            if (this.isGameOver) {
                this.restart();
            } else if (!this.started) {
                this.start();
            } else {
                this.restart();
            }
        });

        // State
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

        // Timer 초기 duration을 GameConfig에서 계산하여 전달
        const cfg = this.scoreSystem.cfg;
        const initialDuration = cfg.getTimeBase() + (this.upgrades.levels?.timeBonus || 0) * cfg.getTimePerLevel();

        // Timer
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

        // Board Controller
        this.boardCtrl = new BoardController({
            boardEl: this.boardEl,
            renderer: this.renderer,
            upgrades: this.upgrades,
            onScoreChange: (delta, total) => {
                if (!this.started) return; // 초기 보드 정리 시점의 점수 반영 방지
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


        // Input Controller
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

        // 업그레이드 바인딩: 구매 시만 샵/통계 동기화
        this.ui.bindUpgradeSystem(this.upgrades, (key) => {
            const ok = this.upgrades.buy(key);
            if (ok) {
                // 포인트/샵 갱신
                this.ui.updatePoints(this.upgrades.points);
                this.ui.refreshShop(this.upgrades);
                // 업그레이드가 바뀌었을 때만 전체 통계 동기화
                playSfx("coin");
            } else {
                playSfx("swap");
            }
        });

        // Init
        this.initBoard();

        // 최초 한 번만 stats 동기화 (샵/시간/포인트)
        this.syncStats();

        // 기본 HUD(점수/스테이지 등)
        this.updateHUD();

        // ======================
        // 🔊 Sound Controls
        // ======================

        const masterSlider = document.getElementById("masterVol");
        const bgmSlider = document.getElementById("bgmVol");
        const muteBtn = document.getElementById("muteBtn");

        if (masterSlider) {
            masterSlider.addEventListener("input", e => {
                setMasterVolume(parseFloat(e.target.value));
            });
        }

        if (bgmSlider) {
            bgmSlider.addEventListener("input", e => {
                setBgmVolume(parseFloat(e.target.value));
            });
        }

        if (muteBtn) {
            muteBtn.addEventListener("click", () => {
                const muted = toggleMute();
                muteBtn.textContent = muted ? "🔇" : "🔊";
            });
        }
    }

    /* ================= UI ================= */

    updateHUD() {
        // score / stage / target 만 간단히 갱신 (빈번 호출 안전)
        this.ui.updateHUD({
            score: this.score,
            stage: this.stage,
            targetScore: this.targetScore
        });
    }

    // 별도: 샵, 시간, 포인트 같은 통계는 필요할 때(초기/업그레이드/재시작)만 동기화
    syncStats() {
        console.log("[Game] syncStats() 호출 - GameConfig:", this.scoreSystem.cfg);
        const cfg = this.scoreSystem.cfg;

        // 시간: GameConfig 기준 최종 시간
        const finalTime = cfg.getTimeBase() + (this.upgrades.levels?.timeBonus || 0) * cfg.getTimePerLevel();
        this.ui.updateTime(finalTime);

        // 샵 미리보기(블럭/특수/콤보)
        this.ui.refreshShop(this.upgrades);

        // 업그레이드 포인트 표시
        this.ui.updatePoints(this.upgrades.points);
       // playSfx("bgm");
        
    }

    /* ================= Game Flow ================= */

    start() {
        if (this.started) return;

        playBgm(); 

        this.started = true;
        this.isGameOver = false;
        this.ui.hideGameOver();
        document.getElementById("gameWrap").classList.remove("gameover");

        document.getElementById("gameWrap").classList.add("playing");

        this.score = 0;
        this.stage = 1;
        this.stageRequirement = this.baseStageScore;
        this.targetScore = this.stageRequirement;

        this.updateHUD();

        this.startTimer();

        this.ui.setRestartLabel("");
    }

    restart() {
        playBgm(); 

        document.getElementById("gameWrap").classList.remove("gameover");

        this.isGameOver = false;
        this.ui.hideGameOver();

        this.boardEl.querySelectorAll(".cell").forEach(d => {
            d.classList.remove("gameover-explode");
        });

        this.score = 0;
        this.stage = 1;

        this.stageRequirement = this.baseStageScore;
        this.targetScore = this.stageRequirement;

        // 샵/시간도 최신화
        this.syncStats();

        this.updateHUD();
        this.initBoard();
        this.startTimer();

        const restartBtn = document.getElementById("restart");
        if (restartBtn) restartBtn.disabled = false;

        this.started = true;
        this.ui.setRestartLabel("");
        document.getElementById("gameWrap").classList.add("playing");
    }

    /* ================= Board ================= */

    initBoard() {
        this.boardCtrl.initBoard((e, r, c) => this.inputCtrl.onMouseDown(e, r, c));
    }

    /* ================= Core Logic ================= */

    async playGameOverSequence() {
        // 입력 차단 플래그만 먼저 세팅 (점수 집계를 위해 started는 아직 유지)
        this.isGameOver = true;
        this.ui.hideCountdown();

        stopBgm(true);  // 🔥 페이드아웃

        // 타이머 정지
        try { this.timerCtrl.stop(); } catch (e) { /* 안전처리 */ }

        // 1) 먼저 남아있는 특수블럭 자동 발동(점수 반영 허용을 위해 this.started는 유지)
        const boardModel = this.boardCtrl.getBoardModel();
        const scoreRef = { value: this.score };

        // 반복: 보드에 특수 블럭이 남아있으면 하나씩 발동 처리
        while (true) {
            const board = boardModel.get();
            let found = false;
            for (let r = 0; r < SIZE && !found; r++) {
                for (let c = 0; c < SIZE && !found; c++) {
                    const cell = board[r][c];
                    if (cell && (cell.special === "bomb" || cell.special === "cross")) {
                        found = true;
                        // 발동: BoardController.triggerAt는 점수 반영/연쇄 처리 호출하므로 await
                        await this.boardCtrl.triggerAt(r, c, scoreRef);
                    }
                }
            }
            if (!found) break;
            // 약간 대기(안정성)
            await sleep(120);
        }

        // 보드 상의 모든 특수 처리가 끝나면 내부 점수를 갱신
        this.score = scoreRef.value;
        this.updateHUD();

        // 이제부터는 진짜 종료 상태: started false로 바꿔 입력/점수 반영 차단
        this.started = false;

        // 게임오버 연출: 기존 애니메이션 유지
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
        this.upgrades.addPoints(gainedPoints);

        // UI에 표시 갱신 — 최대 콤보도 전달
        const maxCombo = this.boardCtrl.getMaxCombo ? this.boardCtrl.getMaxCombo() : 0;

        // 중요: playing 클래스 제거해서 재시작 버튼 보이도록 함
        document.getElementById("gameWrap").classList.remove("playing");

        // 게임오버 표시 클래스 추가
        document.getElementById("gameWrap").classList.add("gameover");

        // 재시작 버튼 활성화 보장
        const restartBtn = document.getElementById("restart");
        if (restartBtn) {
            try {
                // disabled 속성 제거(브라우저 기본 회색 처리 방지)
                restartBtn.removeAttribute("disabled");
                restartBtn.disabled = false;
                // 어떤 경우에 대비해 클래스 네이밍 원상복구
                restartBtn.classList.remove("disabled");
            } catch (e) {
                // 안전 처리: DOM 문제시 무시
                console.warn("restart button enable failed", e);
            }
        }

        this.ui.updatePoints(this.upgrades.points);
        this.ui.refreshShop(this.upgrades);
        this.ui.showGameOver(this.score, gainedPoints, maxCombo);

        // 버튼 라벨
        this.ui.setRestartLabel("다시 시작");
    }

    /* ================= Stage ================= */

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

    /* ================= Timer ================= */

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
