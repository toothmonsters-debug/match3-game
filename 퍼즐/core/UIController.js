import { playSfx } from "../audio/Sfx.js";
export class UIController {
    constructor(scoreSystem) {
        this.scoreSystem = scoreSystem;
        // DOM 캐시
        this.scoreEl = document.getElementById("score");
        this.stageEl = document.getElementById("stage");
        this.targetEl = document.getElementById("target");
        this.timeEl = document.getElementById("time");
        this.stageBannerEl = document.getElementById("stageBanner");
        this.countdownEl = document.getElementById("countdown");
        this.gameOverOverlayEl = document.getElementById("gameOverOverlay");
        this.gameOverScoreEl = this.gameOverOverlayEl
            ? this.gameOverOverlayEl.querySelector(".go-score")
            : null;

        this._stageBannerTimer = null;
    }

    bindRestart(handler) {
        const restartBtn = document.getElementById("restart");
        if (!restartBtn) return;

        // 더블클릭 방지: 클릭 시 잠깐 disabled 처리
        restartBtn.onclick = () => {
            if (restartBtn.disabled) return;
            restartBtn.disabled = true;
            playSfx("swap");
            // 안전하게 handler 호출 (sync/async 모두 지원)
            Promise.resolve().then(() => handler()).finally(() => {
                // 버튼은 이벤트 처리 완료 후 소폭 지연을 두고 재활성화
                setTimeout(() => {
                    restartBtn.disabled = false;
                }, 400);
            });
        };
    }

    // 버튼 텍스트를 런타임에 바꿀 수 있도록 단순한 API 추가
    setRestartLabel(text) {
        const restartBtn = document.getElementById("restart");
        if (!restartBtn) return;
        restartBtn.textContent = text;
    }

    updateHUD({ score, stage, targetScore }) {
        if (this.scoreEl) this.scoreEl.textContent = score;
        if (this.stageEl) this.stageEl.textContent = stage;
        if (this.targetEl) this.targetEl.textContent = targetScore;
    }

    updateTime(timeLeft) {
        if (this.timeEl) this.timeEl.textContent = timeLeft;
    }

    showStageBanner(stage) {
        if (!this.stageBannerEl) return;
        const el = this.stageBannerEl;
        el.textContent = `STAGE ${stage}`;
        el.classList.add("show");
        clearTimeout(this._stageBannerTimer);
        this._stageBannerTimer = setTimeout(() => el.classList.remove("show"), 900);
    }

    showCountdown(sec) {
        if (!this.countdownEl) return;
        this.countdownEl.textContent = sec;
        this.countdownEl.classList.add("show");
    }

    hideCountdown() {
        if (!this.countdownEl) return;
        this.countdownEl.classList.remove("show");
    }

    showBigPopup(text) {
        const log = document.getElementById("comboLog");
        if (!log) return;

        // 텍스트 갱신
        log.textContent = text;

        // 즉시 선명하게
        log.style.opacity = "1";
        log.style.transform = "translateY(0)";

        // 이전 페이드 타이머 있으면 취소
        if (this._comboFadeTimer) {
            clearTimeout(this._comboFadeTimer);
        }

        // 일정 시간 후 서서히 사라지게
        this._comboFadeTimer = setTimeout(() => {
            log.style.opacity = "0";
            log.style.transform = "translateY(-6px)";
        }, 1500); // ← 유지 시간 (원하면 1200~2000 사이로 조절)
    }


    showGameOver(score, gainedPoints = 0, maxCombo = 0) {
        if (!this.gameOverOverlayEl) return;

        // 기존 점수 텍스트
        if (this.gameOverScoreEl) {
            this.gameOverScoreEl.textContent = `SCORE : ${score}`;
        }

        // 최대 콤보 표시용 엘리먼트가 없으면 생성 (스타일은 CSS로 처리)
        let maxComboEl = this.gameOverOverlayEl.querySelector(".go-maxcombo");
        if (!maxComboEl) {
            maxComboEl = document.createElement("div");
            maxComboEl.className = "go-maxcombo";
            this.gameOverOverlayEl.appendChild(maxComboEl);
        }

        if (maxCombo > 0) {
            maxComboEl.textContent = `MAX COMBO: ${maxCombo}`;
            maxComboEl.classList.add("show");
        } else {
            maxComboEl.classList.remove("show");
        }

        // 기존 overlay 노출
        this.gameOverOverlayEl.classList.add("show");
    }

    hideGameOver() {
        if (!this.gameOverOverlayEl) return;
        this.gameOverOverlayEl.classList.remove("show");
    }

    bindUpgradeSystem(upgrades, onBuy) {
        this.pointEl = document.getElementById("pointValue");
        this.updatePoints(upgrades.points);

        document.querySelectorAll("#shopPanel .shop-item").forEach(item => {
            const key = item.dataset.upg;
            item.onclick = () => {
                const ok = onBuy(key);
                if (ok !== false) {
                    this.refreshShop(upgrades);

                }
            };
        });

        this.refreshShop(upgrades);
    }


    updatePoints(p) {
        if (this.pointEl) this.pointEl.textContent = p;
        
    }

    refreshShop(upgrades) {
        document.querySelectorAll("#shopPanel .shop-item").forEach(item => {
            const key = item.dataset.upg;

            const lv = upgrades.getLevel(key);
            const price = upgrades.getPrice(key);
            const canBuy = upgrades.canBuy(key);

            const lvEl = item.querySelector(".lv");
            const priceEl = item.querySelector(".price");
            const previewEl = item.querySelector(".preview");

            if (lvEl) lvEl.textContent = lv;
            if (priceEl) priceEl.textContent = price;

            // ---- 미리보기 계산: ScoreSystem 사용 ----
            let previewValue = 0;

            if (key === "baseScore") {
                // 3매치 기준 per-block 점수을 명확히 보여줌 (GameConfig 반영)
                previewValue = this.scoreSystem.calcPerBlockScore({ removedTotal: 3, combo: 0 });
            }
            else if (key === "bombScore") {
                // 폭탄 1개 발동 시 블럭 1개당 특수 보너스
                previewValue = this.scoreSystem.calcSpecialBonus({ bombCount: 1, crossCount: 0 });
            }
            else if (key === "crossScore") {
                previewValue = this.scoreSystem.calcSpecialBonus({ bombCount: 0, crossCount: 1 });
            }
            else if (key === "comboScore") {
                // 콤보 1 기준 보너스 예시 (cfg 기반 단가)
                previewValue = this.scoreSystem.calcComboBonus(1);
            }
            else if (key === "timeBonus") {
                // 시간은 GameConfig 기반으로 표시하도록 변경
                const lv = upgrades.getLevel("timeBonus");
                const cfg = this.scoreSystem.cfg;
                previewValue = cfg.getTimeBase() + lv * cfg.getTimePerLevel();
            }

            if (previewEl) previewEl.textContent = previewValue;

            // ---- 살 수 있나 UI 처리 ----
            if (canBuy) {
                item.classList.remove("disabled");              
            } else {
                item.classList.add("disabled");
             
            }
        });

        this.updatePoints(upgrades.points);
    }


}
