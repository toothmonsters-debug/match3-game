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

/** ===== 매직넘버(동작값) ===== */
const BOARD_FILL_ROW_INTERVAL_MS = 200;
const BOARD_FILL_MIN_FALL_STEP_MS = 10;
const GRAVITY_STEP_MS = 180;
const GRAVITY_STEP_MIN_MS = 70;

const FLOAT_MAX_COUNT = 80;
const FLOAT_POP_MS = 100;
const FLOAT_FADE_START_MS = 300;
const FLOAT_REMOVE_MS = 800;

const PERF_ENABLED = () => typeof window !== "undefined" && window.__M3_PERF === true;
const PERF_NS = "__m3PerfStats";

function perfNow() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

function perfInitStore() {
    if (!PERF_ENABLED() || typeof window === "undefined") return null;
    if (!window[PERF_NS]) {
        window[PERF_NS] = {
            createdAt: Date.now(),
            render: { count: 0, totalMs: 0, maxMs: 0 },
            showFloat: { count: 0, skippedByCap: 0, totalMs: 0, maxMs: 0, liveMax: 0, removeCount: 0 },
            resolveBoard: { calls: 0, totalMs: 0, maxMs: 0, loopsTotal: 0, loopsMax: 0 },
            gravityRefill: { calls: 0, totalMs: 0, maxMs: 0 },
            removeCells: { calls: 0, totalMs: 0, maxMs: 0, removedTotal: 0 },
            memory: { samples: [] },
            logs: 0
        };
    }
    return window[PERF_NS];
}

function perfUpdateAgg(bucket, dt) {
    bucket.count = (bucket.count || 0) + 1;
    bucket.totalMs = (bucket.totalMs || 0) + dt;
    bucket.maxMs = Math.max(bucket.maxMs || 0, dt);
}

function perfSampleMemory(store, tag) {
    if (!store || typeof performance === "undefined" || !performance.memory) return;
    const m = performance.memory;
    store.memory.samples.push({
        tag,
        t: Date.now(),
        usedJSHeapSize: m.usedJSHeapSize,
        totalJSHeapSize: m.totalJSHeapSize,
        jsHeapSizeLimit: m.jsHeapSizeLimit
    });
    if (store.memory.samples.length > 120) store.memory.samples.shift();
}

function perfMaybeLog(store) {
    if (!store) return;
    const n = store.logs || 0;
    if (n > 0 && n % 20 !== 0) return;

    const r = store.render;
    const f = store.showFloat;
    const rb = store.resolveBoard;
    const g = store.gravityRefill;
    const rc = store.removeCells;
    const avg = (total, count) => (count ? (total / count).toFixed(2) : "0.00");

    console.log("[M3_PERF]",
        {
            renderAvgMs: avg(r.totalMs, r.count), renderMaxMs: r.maxMs?.toFixed?.(2) ?? r.maxMs,
            floatAvgMs: avg(f.totalMs, f.count), floatMaxMs: f.maxMs?.toFixed?.(2) ?? f.maxMs,
            floatLiveMax: f.liveMax, floatSkippedByCap: f.skippedByCap,
            resolveAvgMs: avg(rb.totalMs, rb.calls), resolveMaxMs: rb.maxMs?.toFixed?.(2) ?? rb.maxMs,
            resolveLoopsAvg: avg(rb.loopsTotal, rb.calls), resolveLoopsMax: rb.loopsMax,
            gravityAvgMs: avg(g.totalMs, g.calls), gravityMaxMs: g.maxMs?.toFixed?.(2) ?? g.maxMs,
            removeAvgMs: avg(rc.totalMs, rc.calls), removeMaxMs: rc.maxMs?.toFixed?.(2) ?? rc.maxMs,
            removedTotal: rc.removedTotal
        });

    const lastMem = store.memory.samples[store.memory.samples.length - 1];
    if (lastMem) {
        console.log("[M3_PERF][MEMORY]", lastMem);
    }
}


export class BoardController {
    constructor({ boardEl, renderer, upgrades, onScoreChange, onComboPopup, onStageCheck }) {
        this.boardEl = boardEl;
        this.renderer = renderer;
        // NOTE: 현재 effectLayer는 사용처 없음(향후 파티클/특수이펙트 확장용)
        this.effectLayer = document.getElementById("effectLayer");
        this.onScoreChange = onScoreChange;
        this.onComboPopup = onComboPopup;
        this.onStageCheck = onStageCheck;

        this.matcher = new Matcher();
        this.scoreSystem = new ScoreSystem(upgrades);
        this.specialResolver = new SpecialResolver();
        this.boardModel = new Board();

        // 콤보 상태
        this.combo = 0;
        this.comboAccum = 0;
        this.comboTimer = null;
        this.maxCombo = 0;

        // ✅ 입력 프리뷰 상태 (렌더 분리용)
        this.previewState = null;

        this._perfStore = perfInitStore();
    }

    /** 현재 업그레이드 기준 콤보 유지시간(ms) */
    getComboTimeoutMs() {
        const cfg = this.scoreSystem.cfg;
        const lv = this.scoreSystem.upgrades?.levels?.comboKeep || 0;
        return cfg.getComboKeepBaseMs() + lv * cfg.getComboKeepPerLevelMs();
    }

    randColor() { return Math.floor(Math.random() * COLORS.length); }
    makeCell() { return { color: this.randColor(), special: null }; }

    /** 보드 깊은 복사(null 유지) */
    cloneBoard(src) {
        return src.map(row => row.map(cell => (cell ? { ...cell } : null)));
    }

    /** 새 게임용 보드 초기화 + 시작 직후 자동매치 정리 */
    initBoard(onMouseDown) {
        this.boardModel.init(() => this.makeCell());
        this.renderer.init(onMouseDown);
        this.render();
        this.resolveBoard({ value: 0 });

        // 콤보 상태 초기화
        this.combo = 0;
        this.comboAccum = 0;
        this.maxCombo = 0;
        if (this.comboTimer) {
            clearTimeout(this.comboTimer);
            this.comboTimer = null;
        }
    }

    /** 빈 보드 표시(타이틀/가이드 상태 등에서 사용) */
    initBoardEmpty(onMouseDown) {
        this.renderer.init(onMouseDown);

        const empty = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
        this.boardModel.set(empty);
        this.render();

        this.combo = 0;
        this.comboAccum = 0;
        this.maxCombo = 0;
        if (this.comboTimer) {
            clearTimeout(this.comboTimer);
            this.comboTimer = null;
        }
    }

    /** 시작 연출: 한 줄씩 낙하하여 바닥부터 적층 */
    async initBoardAnimated(onMouseDown, totalMs = 1600) {
        this.renderer.init(onMouseDown);

        const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
        this.boardModel.set(board);
        this.render();

        const rowIntervalMs = BOARD_FILL_ROW_INTERVAL_MS;
        const maxFallSteps = SIZE;
        const fallStepMs = Math.max(
            BOARD_FILL_MIN_FALL_STEP_MS,
            Math.floor((totalMs / SIZE) / maxFallSteps)
        );

        for (let targetRow = SIZE - 1; targetRow >= 0; targetRow--) {
            const rowCells = Array.from({ length: SIZE }, () => this.makeCell());

            let r = 0;
            for (let c = 0; c < SIZE; c++) board[r][c] = rowCells[c];
            this.render();

            while (r < targetRow) {
                for (let c = 0; c < SIZE; c++) board[r][c] = null;
                r++;
                for (let c = 0; c < SIZE; c++) board[r][c] = rowCells[c];
                this.render();
                await sleep(fallStepMs);
            }

            await sleep(rowIntervalMs);
        }

        await this.resolveBoard({ value: 0 });

        this.combo = 0;
        this.comboAccum = 0;
        this.maxCombo = 0;
        if (this.comboTimer) {
            clearTimeout(this.comboTimer);
            this.comboTimer = null;
        }
    }

    render(board = this.boardModel.get()) {
        const perfStore = PERF_ENABLED() ? (this._perfStore || perfInitStore()) : null;
        const t0 = perfStore ? perfNow() : 0;

        if (this.previewState && this.previewState.steps !== 0) {
            const { r, c, axis, steps } = this.previewState;
            const composed = this._applyInsertPreviewOn(board, r, c, axis, steps);
            this.renderer.render(composed);
            if (perfStore) {
                const dt = perfNow() - t0;
                perfUpdateAgg(perfStore.render, dt);
            }
            return;
        }

        this.renderer.render(board);

        if (perfStore) {
            const dt = perfNow() - t0;
            perfUpdateAgg(perfStore.render, dt);
            perfStore.logs = (perfStore.logs || 0) + 1;
            perfMaybeLog(perfStore);
        }
    }

    /** 셀 점수 플로팅 텍스트 생성 */
    showFloat(r, c, text, opts = {}) {
        const perfStore = PERF_ENABLED() ? (this._perfStore || perfInitStore()) : null;
        const t0 = perfStore ? perfNow() : 0;

        const liveCount = this.boardEl.querySelectorAll(".floatText").length;
        if (perfStore) {
            perfStore.showFloat.liveMax = Math.max(perfStore.showFloat.liveMax || 0, liveCount);
        }

        if (liveCount > FLOAT_MAX_COUNT) {
            if (perfStore) perfStore.showFloat.skippedByCap = (perfStore.showFloat.skippedByCap || 0) + 1;
            return;
        }

        const { color = null, className = "", zIndex = 60, yOffset = 0 } = opts;

        const d = document.createElement("div");
        d.className = `floatText ${className}`.trim();
        d.textContent = text;
        d.style.left = `${c * 50 + 10}px`;
        d.style.top = `${r * 50 + 10 + yOffset}px`;
        d.style.transform = "translateY(0px) scale(1.25)";
        d.style.opacity = "1";
        d.style.zIndex = String(zIndex);
        d.style.transition = "transform 0.15s ease, opacity 0.7s ease";
        if (color) d.style.color = color;

        this.boardEl.appendChild(d);
        d.getBoundingClientRect();

        setTimeout(() => {
            d.style.transform = "translateY(0px) scale(1)";
        }, FLOAT_POP_MS);

        setTimeout(() => {
            d.style.transition = "transform 0.7s ease, opacity 0.7s ease";
            d.style.transform = "translateY(-34px) scale(1)";
            d.style.opacity = "0";
        }, FLOAT_FADE_START_MS);

        setTimeout(() => {
            d.remove();
            if (perfStore) perfStore.showFloat.removeCount = (perfStore.showFloat.removeCount || 0) + 1;
        }, FLOAT_REMOVE_MS);

        if (perfStore) {
            const dt = perfNow() - t0;
            perfUpdateAgg(perfStore.showFloat, dt);
        }
    }

    /** 콤보 카운터 증가 + 유지시간 타이머 재시작 */
    _bumpCombo() {
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);

        if (this.comboTimer) clearTimeout(this.comboTimer);

        this.comboTimer = setTimeout(() => {
            this.combo = 0;
            this.comboAccum = 0;
            this.comboTimer = null;
        }, this.getComboTimeoutMs());
    }

    /** 외부(GameOver)에서 최대 콤보 조회 */
    getMaxCombo() {
        return this.maxCombo;
    }

    /** 변경: removeCells 옵션에 triggerBomb, triggerCross를 받을 수 있도록 함 (폴백 존재) */
    async removeCells(initial, matchSize = 3, scoreRef, { isSpecialActivation = false, activationTriggers = [], triggerBomb = 0, triggerCross = 0, chainLevel = 0 } = {}) {
        const perfStore = PERF_ENABLED() ? (this._perfStore || perfInitStore()) : null;
        const t0 = perfStore ? perfNow() : 0;

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
        if (cells.length === 0) {
            if (perfStore) {
                const dt = perfNow() - t0;
                perfUpdateAgg(perfStore.removeCells, dt);
            }
            return 0;
        }

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
            const isSpecialCell = board[r][c].special === "bomb" || board[r][c].special === "cross";
            const boost = isSpecialCell ? 1.5 : 1.15;
            this.renderer.playExplode(r, c, chainLevel, { boost });
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

        // removeCells() 하단 팝업 호출부 교체
        if (this.combo > 0) {
            playSfx("combo");
            if (this.onComboPopup) {
                this.onComboPopup(
                    `🔥 ${this.combo.toLocaleString("ko-KR")} COMBO! +${this.comboAccum.toLocaleString("ko-KR")}`,
                    this.getComboTimeoutMs()
                );
            }
        } else {
            if (this.onComboPopup) {
                this.onComboPopup(`+${gain.toLocaleString("ko-KR")}`, this.scoreSystem.cfg.getComboPopupBaseMs());
            }
        }

        if (perfStore) {
            const dt = perfNow() - t0;
            perfUpdateAgg(perfStore.removeCells, dt);
            perfStore.removeCells.removedTotal = (perfStore.removeCells.removedTotal || 0) + removedTotal;
            perfSampleMemory(perfStore, "removeCells");
        }

        return gain;
    }

    async resolveBoard(scoreRef, specialOrigin = null) {
        const perfStore = PERF_ENABLED() ? (this._perfStore || perfInitStore()) : null;
        const t0 = perfStore ? perfNow() : 0;
        let loops = 0;
        let firstClear = true;

        while (true) {
            loops++;
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

            // 🔒 실제로 터질 영역 기준으로 발동 판별
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

            dbg("[resolveBoard] removes:", removes,
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
                triggerCross,
                chainLevel: Math.max(0, loops - 1)
            });

            await this.applyGravityAndRefill();
        }

        if (perfStore) {
            const dt = perfNow() - t0;
            perfStore.resolveBoard.calls = (perfStore.resolveBoard.calls || 0) + 1;
            perfStore.resolveBoard.totalMs = (perfStore.resolveBoard.totalMs || 0) + dt;
            perfStore.resolveBoard.maxMs = Math.max(perfStore.resolveBoard.maxMs || 0, dt);
            perfStore.resolveBoard.loopsTotal = (perfStore.resolveBoard.loopsTotal || 0) + loops;
            perfStore.resolveBoard.loopsMax = Math.max(perfStore.resolveBoard.loopsMax || 0, loops);
            perfSampleMemory(perfStore, "resolveBoard");
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

    _getGravityStepMs(chainIndex = 0) {
        const idx = Math.max(0, Number(chainIndex) || 0);
        const reduced = GRAVITY_STEP_MS - idx * 20;
        return Math.max(GRAVITY_STEP_MIN_MS, reduced);
    }

    /** 중력 적용 → 렌더 → 리필 사이클 */
    async applyGravityAndRefill(chainIndex = 0) {
        const perfStore = PERF_ENABLED() ? (this._perfStore || perfInitStore()) : null;
        const t0 = perfStore ? perfNow() : 0;
        const stepMs = this._getGravityStepMs(chainIndex);

        this.render();
        await sleep(stepMs);

        this.boardModel.applyGravity();
        this.render();
        await sleep(stepMs);

        this.boardModel.refill(() => this.makeCell());
        this.render();
        await sleep(stepMs);

        if (perfStore) {
            const dt = perfNow() - t0;
            perfStore.gravityRefill.calls = (perfStore.gravityRefill.calls || 0) + 1;
            perfStore.gravityRefill.totalMs = (perfStore.gravityRefill.totalMs || 0) + dt;
            perfStore.gravityRefill.maxMs = Math.max(perfStore.gravityRefill.maxMs || 0, dt);
            perfSampleMemory(perfStore, "gravityRefill");
        }
    }

    /** 특수 클릭/이동으로 "이 칸에서 제거 시작" 요청 */
    async triggerAt(r, c, scoreRef) {
        const board = this.boardModel.get();
        const cell = board[r][c];
        if (!cell) return 0;

        // 턴 시작 스냅샷 (발동 트리거 판별용)
        const specialSnapshot = this.cloneBoard(board);

        const isSpecialActivation =
            specialSnapshot[r][c] &&
            (specialSnapshot[r][c].special === "bomb" || specialSnapshot[r][c].special === "cross");

        const activationTriggers = isSpecialActivation ? [[r, c]] : [];

      //  dbg("[triggerAt] isSpecialActivation:", isSpecialActivation, "triggers:", activationTriggers);

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

    _applyInsertPreviewOn(sourceBoard, r, c, axis, steps) {
        const base = this.cloneBoard(sourceBoard);

        if (axis === "h") {
            const row = r;
            const from = c;
            const to = clamp(c + steps, 0, SIZE - 1);
            if (from === to) return base;

            const picked = base[row][from];
            if (from < to) {
                for (let i = from; i < to; i++) base[row][i] = base[row][i + 1];
            } else {
                for (let i = from; i > to; i--) base[row][i] = base[row][i - 1];
            }
            base[row][to] = picked;
        } else {
            const col = c;
            const from = r;
            const to = clamp(r + steps, 0, SIZE - 1);
            if (from === to) return base;

            const picked = base[from][col];
            if (from < to) {
                for (let i = from; i < to; i++) base[i][col] = base[i + 1][col];
            } else {
                for (let i = from; i > to; i--) base[i][col] = base[i - 1][col];
            }
            base[to][col] = picked;
        }

        return base;
    }

    setInsertPreview(r, c, axis, steps) {
        if (!axis || steps === 0) {
            this.clearInsertPreview();
            return;
        }

        this.previewState = { r, c, axis, steps };
        this.render();
    }

    clearInsertPreview() {
        if (!this.previewState) return;
        this.previewState = null;
        this.render();
    }
}
