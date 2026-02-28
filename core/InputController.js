import { SIZE, STEP } from "../data/Config.js";
import { clamp } from "../util/Utils.js";

export class InputController {
    constructor({
        boardCtrl,
        getState,
        setBusy,
        getScore,    // ✅ 추가
        setScore,    // ✅ 추가
        onAfterResolve
    }) {
        this.boardCtrl = boardCtrl;
        this.getState = getState;
        this.setBusy = setBusy;
        this.getScore = getScore;
        this.setScore = setScore;
        this.onAfterResolve = onAfterResolve;
    }

    onMouseDown(e, r, c) {

        const { isGameOver, started } = this.getState();
        if (isGameOver || !started) return;

        const startDiv = e.currentTarget;   // 클릭한 실제 DOM
        startDiv.classList.add("selected");

        const board = this.boardCtrl.getBoardModel().get();
        const startCell = board[r][c];

        const startX = e.clientX;
        const startY = e.clientY;

        let axis = null;
        let lastSteps = 0;

        const onMove = (ev) => {

            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            if (!axis) {
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
                } else {
                    return;
                }
            }

            const delta = axis === "h" ? dx : dy;
            const steps = Math.round(delta / STEP);

            if (steps !== lastSteps) {
                lastSteps = steps;

                if (steps !== 0) {
                    this.boardCtrl.render(
                        this.boardCtrl.applyInsertPreview(r, c, axis, steps)
                    );
                } else {
                    this.boardCtrl.render();
                }
            }
        };

        const onUp = async (ev) => {
            

                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);

                // 눌림 해제
                startDiv.classList.remove("selected");

                const delta = axis === "h"
                    ? (ev.clientX - startX)
                    : (ev.clientY - startY);

                const steps = axis ? Math.round(delta / STEP) : 0;

                // 🔥 최종 좌표 계산
                let finalR = r;
                let finalC = c;

                if (axis && steps !== 0) {
                    if (axis === "h") {
                        finalC = clamp(c + steps, 0, SIZE - 1);
                    } else {
                        finalR = clamp(r + steps, 0, SIZE - 1);
                    }
                }

                if (!axis) {

                    if (startCell && startCell.special) {
                        (async () => {

                            this.setBusy(true);
                            const scoreRef = { value: this.getScore() };

                            await this.boardCtrl.triggerAt(r, c, scoreRef);

                            this.setScore(scoreRef.value);
                            this.setBusy(false);

                            if (this.onAfterResolve) this.onAfterResolve();

                        })();
                    } else {
                        this.boardCtrl.render();
                    }

                    return;
                }

                if (steps !== 0) {

                    this.setBusy(true);
                    this.boardCtrl.commitInsertShift(r, c, axis, steps);

                    // 🔥 commit 이후 DOM 기준 최종 div 찾기
                    const finalIdx = finalR * SIZE + finalC;
                    const finalDiv = this.boardCtrl.boardEl.children[finalIdx];

                    if (finalDiv) {
                        finalDiv.classList.add("release");
                        setTimeout(() => {
                            finalDiv.classList.remove("release");
                        }, 220);
                    }

                    if (startCell && startCell.special) {

                        setTimeout(() => {
                            (async () => {

                                const scoreRef = { value: this.getScore() };

                                await this.boardCtrl.triggerAt(finalR, finalC, scoreRef);

                                this.setScore(scoreRef.value);
                                this.setBusy(false);

                                if (this.onAfterResolve) this.onAfterResolve();

                            })();
                        }, 0);

                    } else {

                        const scoreRef = { value: this.getScore() };

                        await this.boardCtrl.resolveBoard(
                            scoreRef,
                            { r: finalR, c: finalC }
                        );
                        this.setScore(scoreRef.value);

                        this.setBusy(false);

                        if (this.onAfterResolve) this.onAfterResolve();
                    }

                } else {
                    this.boardCtrl.render();
                }
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        }
    }

