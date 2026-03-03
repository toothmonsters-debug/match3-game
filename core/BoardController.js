import { SIZE, COLORS } from "../data/Config.js";
import { sleep, clamp } from "../util/Utils.js";
import { playSfx } from "../audio/Sfx.js";
import { ScoreSystem } from "../systems/ScoreSystem.js";
import { Matcher } from "../systems/Matcher.js";
import { SpecialResolver } from "../systems/SpecialResolver.js";
import { Board } from "../systems/Board.js";

const DEBUG = false;
const dbg = (...args) => {
    if (DEBUG) console.log(...args);
};

export class BoardController {
    constructor({ boardEl, renderer, upgrades, onScoreChange, onComboPopup, onStageCheck }) {
        this.boardEl = boardEl;
        this.renderer = renderer;
        this.effectLayer = document.getElementById("effectLayer");
        this.onScoreChange = onScoreChange;
        this.onComboPopup = onComboPopup;
        this.onStageCheck = onStageCheck;

        this.matcher = new Matcher();
        this.scoreSystem = new ScoreSystem(upgrades);
        this.specialResolver = new SpecialResolver();
        this.boardModel = new Board();

        this.combo = 0;
        this.comboAccum = 0;
        this.comboTimer = null;
        this.comboTimeoutMs = 1800;

        // 추가: 게임 전체에서 기록할 최대 콤보
        this.maxCombo = 0;
    }

    /* ================= Board Init ================= */

    randColor() { return Math.floor(Math.random() * COLORS.length); }
    makeCell() { return { color: this.randColor(), special: null }; }

    cloneBoard(src) {
        return src.map(row => row.map(cell => cell ? { ...cell } : null));
    }

    initBoard(onMouseDown) {
        this.boardModel.init(() => this.makeCell());
        this.renderer.init(onMouseDown);
        this.render();
        this.resolveBoard({ value: 0 });
        // reset combo tracking on new board
        this.combo = 0;
        this.comboAccum = 0;
        this.maxCombo = 0;
        if (this.comboTimer) { clearTimeout(this.comboTimer); this.comboTimer = null; }
    }

    /* ================= Rendering ================= */

    render(board = this.boardModel.get()) {
        this.renderer.render(board);
    }

    // showFloat 함수 교체
    showFloat(r, c, text, opts = {}) {
        if (this.boardEl.querySelectorAll(".floatText").length > 80) return;

        const {
            color = null,
            className = "",
            zIndex = 60,
            yOffset = 0
        } = opts;

        const d = document.createElement("div");
        d.className = `floatText ${className}`.trim();
        d.textContent = text;
        d.style.left = (c * 50 + 10) + "px";
        d.style.top = (r * 50 + 10 + yOffset) + "px";
        d.style.transform = "translateY(0px) scale(1.25)";
        d.style.opacity = "1";
        d.style.zIndex = String(zIndex);
        d.style.transition = "transform 0.15s ease, opacity 0.7s ease";
        if (color) d.style.color = color;

        this.boardEl.appendChild(d);
        d.getBoundingClientRect();

        // 0.15초 후 원래 크기
        setTimeout(() => {
            d.style.transform = "translateY(0px) scale(1)";
        }, 100);

        // 이후 기존처럼 위로 뜨며 사라짐
        setTimeout(() => {
            d.style.transition = "transform 0.7s ease, opacity 0.7s ease";
            d.style.transform = "translateY(-34px) scale(1)";
            d.style.opacity = "0";
        }, 300);

        setTimeout(() => d.remove(), 900);
    }

    /* ================= Core Logic ================= */

    // 특수 클릭/이동으로 "이 칸에서 제거 시작" 요청
    async triggerAt(r, c, scoreRef) {
        const board = this.boardModel.get();
        const cell = board[r][c];
        if (!cell) return 0;

        // 🔒 턴 시작 스냅샷
        const specialSnapshot = this.cloneBoard(board);

        const isSpecialActivation =
            specialSnapshot[r][c] &&
            (specialSnapshot[r][c].special === "bomb" || specialSnapshot[r][c].special === "cross");

        const activationTriggers = isSpecialActivation ? [[r, c]] : [];

        dbg("[triggerAt] isSpecialActivation:", isSpecialActivation, "triggers:", activationTriggers);

        const gain = await this.removeCells([[r, c]], 3, scoreRef, {
            isSpecialActivation,
            activationTriggers
        });

        if (gain > 0) {
            await this.applyGravityAndRefill();
            await this.resolveBoard(scoreRef); // 연쇄 처리
        }

        return gain;
    }

    _bumpCombo() {
        this.combo++;

        // 새: 최대 콤보 갱신
        this.maxCombo = Math.max(this.maxCombo, this.combo);

        if (this.comboTimer) clearTimeout(this.comboTimer);

        this.comboTimer = setTimeout(() => {
            this.combo = 0;
            this.comboAccum = 0;
            this.comboTimer = null;
        }, this.comboTimeoutMs);
    }

    // 외부에서 최대 콤보 조회 가능하도록 추가
    getMaxCombo() {
        return this.maxCombo;
    }

    // 변경: removeCells 옵션에 triggerBomb, triggerCross를 받을 수 있도록 함 (폴백 존재)
    async removeCells(initial, matchSize = 3, scoreRef, { isSpecialActivation = false, activationTriggers = [], triggerBomb = 0, triggerCross = 0 } = {}) {
        const board = this.boardModel.get();

        if (isSpecialActivation && (triggerBomb === 0 && triggerCross === 0)) {
            triggerBomb = 0;
            triggerCross = 0;
            for (const [r, c] of activationTriggers) {
                const cell = board[r][c];
                if (!cell) continue;
                if (cell.special === "bomb") triggerBomb++;
                if (cell.special === "cross") triggerCross++;
            }
        }

        const cells = this.specialResolver.expand(board, initial);
        if (cells.length === 0) return 0;

        const expandedSet = new Set(cells.map(([r, c]) => `${r},${c}`));
        const activationSet = new Set((activationTriggers || []).map(([r, c]) => `${r},${c}`));

        // ✅ "연계 특수" (직접 발동 트리거 제외)
        const chainedSpecialSet = new Set();
        for (const [r, c] of cells) {
            const k = `${r},${c}`;
            const cell = board[r][c];
            if (!cell) continue;
            if ((cell.special === "bomb" || cell.special === "cross") && !activationSet.has(k)) {
                chainedSpecialSet.add(k);
            }
        }

        // ✅ 연계 특수로 인해 터진 "일반블럭"만 x2 대상
        const doubledNormalSet = new Set();
        const q = [...chainedSpecialSet].map(s => s.split(",").map(Number));
        const visitedSpecial = new Set(chainedSpecialSet);

        while (q.length) {
            const [sr, sc] = q.shift();
            const srcCell = board[sr][sc];
            if (!srcCell) continue;

            const affected =
                srcCell.special === "bomb"
                    ? this.specialResolver.triggerBomb(board, sr, sc)
                    : this.specialResolver.triggerCross(board, sr, sc);

            for (const [ar, ac] of affected) {
                const ak = `${ar},${ac}`;
                if (!expandedSet.has(ak)) continue;

                const target = board[ar][ac];
                if (!target) continue;

                const isSpecial = target.special === "bomb" || target.special === "cross";
                if (isSpecial) {
                    if (!activationSet.has(ak) && !visitedSpecial.has(ak)) {
                        visitedSpecial.add(ak);
                        q.push([ar, ac]);
                    }
                } else {
                    doubledNormalSet.add(ak); // ✅ 일반블럭만 x2
                }
            }
        }

        if (isSpecialActivation) playSfx("bomb");
        else playSfx("match");

        for (const [r, c] of cells) {
            if (!board[r][c]) continue;
            this.renderer.playExplode(r, c);
            board[r][c] = null;
        }

        const removedTotal = cells.length;
        const perBlockMatch = this.scoreSystem.calcPerBlockScore({ removedTotal: matchSize, combo: 0 });

        let perBlockSpecial = 0;
        if (isSpecialActivation && (triggerBomb + triggerCross) > 0) {
            perBlockSpecial = this.scoreSystem.calcSpecialBonus({
                bombCount: triggerBomb,
                crossCount: triggerCross
            });
        }

        const perBlockFinal = perBlockMatch + perBlockSpecial;
        const baseGain = perBlockFinal * removedTotal;

        // ✅ 연계 일반블럭 x2 추가점수
        const chainDoubleBonus = perBlockFinal * doubledNormalSet.size;

        // removeCells 내부 플로팅 표시 부분 교체
        for (const [r, c] of cells) {
            const k = `${r},${c}`;
            if (doubledNormalSet.has(k)) {
                this.showFloat(r, c, `+${perBlockFinal} x2`, {
                    color: "#7bdff2",
                    className: "floatText--x2",
                    zIndex: 140,
                    yOffset: -10
                });
            } else {
                this.showFloat(r, c, `+${perBlockFinal}`, {
                    zIndex: 80
                });
            }
        }

        this._bumpCombo();
        const comboBonus = this.combo > 0 ? this.scoreSystem.calcComboBonus(this.combo) : 0;

        const gain = baseGain + chainDoubleBonus + comboBonus;

        scoreRef.value += gain;
        if (this.onScoreChange) this.onScoreChange(gain, scoreRef.value);

        this.comboAccum += comboBonus;

        if (this.combo > 0) {
            playSfx("combo");
            if (this.onComboPopup) {
                this.onComboPopup(`🔥 ${this.combo} COMBO! +${this.comboAccum}`);
            }
        } else {
            if (this.onComboPopup) {
                this.onComboPopup(`+${gain}`);
            }
        }

        return gain;
    }

    async applyGravityAndRefill() {
        this.render(); await sleep(180);
        this.boardModel.applyGravity();
        this.render(); await sleep(180);
        this.boardModel.refill(() => this.makeCell());
        this.render(); await sleep(180);
    }

    async resolveBoard(scoreRef, specialOrigin = null) {
        let firstClear = true;

        while (true) {
            const board = this.boardModel.get();
            const { removes, specials, groups } = this.matcher.findMatches(board);

            if (removes.length === 0) break;

            const specialSnapshot = this.cloneBoard(board);

            const isFirstClear = firstClear;
            if (firstClear) {
                playSfx("match");
                firstClear = false;
            }

            let maxGroupSize = 3;
            for (const g of groups) maxGroupSize = Math.max(maxGroupSize, g.cells.length);

            let filtered = [...removes];
            let originConsumed = false;

            for (const sp of specials) {
                const type = sp.type;

                let targetR = sp.r;
                let targetC = sp.c;

                const originInThisGroup =
                    !originConsumed &&
                    isFirstClear &&
                    specialOrigin &&
                    Array.isArray(sp.cells) &&
                    sp.cells.some(cell => cell.r === specialOrigin.r && cell.c === specialOrigin.c) &&
                    board[specialOrigin.r] &&
                    board[specialOrigin.r][specialOrigin.c];

                if (originInThisGroup) {
                    targetR = specialOrigin.r;
                    targetC = specialOrigin.c;
                    originConsumed = true;
                }

                if (board[targetR][targetC]) {
                    board[targetR][targetC].special = type;
                    filtered = filtered.filter(([rr, cc]) => !(rr === targetR && cc === targetC));
                }
            }

            // 🔒 실제로 터질 영역 기준으로 발동 판정
            const expanded = this.specialResolver.expand(board, filtered);

            // activationTriggers는 "턴 시작 시점의 스냅샷"을 기준으로 결정해야 안전
            const activationTriggers = expanded.filter(([r, c]) => {
                const cell = specialSnapshot[r][c];
                return cell && (cell.special === "bomb" || cell.special === "cross");
            });

            // 여기서 specialSnapshot 기반으로 발동 카운트를 미리 셈 (이 값만 removeCells에 전달)
            let triggerBomb = 0, triggerCross = 0;
            for (const [r, c] of activationTriggers) {
                const cell = specialSnapshot[r][c];
                if (!cell) continue;
                if (cell.special === "bomb") triggerBomb++;
                if (cell.special === "cross") triggerCross++;
            }

            const finalIsSpecialActivation = activationTriggers.length > 0;

            console.log("[resolveBoard] removes:", removes,
                "filtered:", filtered,
                "expanded:", expanded,
                "activationTriggers:", activationTriggers,
                "isSpecialActivation:", finalIsSpecialActivation,
                "triggerBomb:", triggerBomb,
                "triggerCross:", triggerCross);

            await this.removeCells(filtered, maxGroupSize, scoreRef, {
                isSpecialActivation: finalIsSpecialActivation,
                activationTriggers,
                triggerBomb,
                triggerCross
            });

            await this.applyGravityAndRefill();
        }

        if (this.onStageCheck) this.onStageCheck();
    }

    /* ================= Input Helpers ================= */

    applyInsertPreview(r, c, axis, steps) {
        const base = this.cloneBoard(this.boardModel.get());

        if (axis === "h") {
            const row = r;
            let from = c;
            let to = clamp(c + steps, 0, SIZE - 1);
            if (from === to) return base;
            const picked = base[row][from];
            if (from < to) for (let i = from; i < to; i++) base[row][i] = base[row][i + 1];
            else for (let i = from; i > to; i--) base[row][i] = base[row][i - 1];
            base[row][to] = picked;
        } else {
            const col = c;
            let from = r;
            let to = clamp(r + steps, 0, SIZE - 1);
            if (from === to) return base;
            const picked = base[from][col];
            if (from < to) for (let i = from; i < to; i++) base[i][col] = base[i + 1][col];
            else for (let i = from; i > to; i--) base[i][col] = base[i - 1][col];
            base[to][col] = picked;
        }
        return base;
    }

    commitInsertShift(r, c, axis, steps) {
        playSfx("swap");

        const board = this.boardModel.get();

        if (axis === "h") {
            const row = r;
            let from = c;
            let to = clamp(c + steps, 0, SIZE - 1);
            if (from !== to) {
                const picked = board[row][from];
                if (from < to) for (let i = from; i < to; i++) board[row][i] = board[row][i + 1];
                else for (let i = from; i > to; i--) board[row][i] = board[row][i - 1];
                board[row][to] = picked;
            }
        } else {
            const col = c;
            let from = r;
            let to = clamp(r + steps, 0, SIZE - 1);
            if (from !== to) {
                const picked = board[from][col];
                if (from < to) for (let i = from; i < to; i++) board[i][col] = board[i + 1][col];
                else for (let i = from; i > to; i--) board[i][col] = board[i - 1][col];
                board[to][col] = picked;
            }
        }

        this.render();
    }

    getBoardModel() {
        return this.boardModel;
    }
}
