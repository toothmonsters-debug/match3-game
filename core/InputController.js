import { SIZE, STEP } from "../data/Config.js";
import { clamp } from "../util/Utils.js";

export class InputController {
    constructor({
        boardCtrl,
        getState,
        setBusy,
        getScore,
        setScore,
        onAfterResolve
    }) {
        this.boardCtrl = boardCtrl;
        this.getState = getState;
        this.setBusy = setBusy;
        this.getScore = getScore;
        this.setScore = setScore;
        this.onAfterResolve = onAfterResolve;

        this._scrollLockHandler = (ev) => {
            if (ev.cancelable) ev.preventDefault();
        };
    }

    _lockPageScroll() {
        document.documentElement.classList.add("board-drag-lock");
        document.body.classList.add("board-drag-lock");

        document.addEventListener("touchmove", this._scrollLockHandler, { passive: false });
        document.addEventListener("wheel", this._scrollLockHandler, { passive: false });
    }

    _unlockPageScroll() {
        document.documentElement.classList.remove("board-drag-lock");
        document.body.classList.remove("board-drag-lock");

        document.removeEventListener("touchmove", this._scrollLockHandler);
        document.removeEventListener("wheel", this._scrollLockHandler);
    }

    _getClientPoint(ev) {
        if (ev.touches && ev.touches.length > 0) {
            return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        }
        if (ev.changedTouches && ev.changedTouches.length > 0) {
            return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
        }
        return { x: ev.clientX, y: ev.clientY };
    }

    onMouseDown(e, r, c) {
        const { isGameOver, started } = this.getState();
        if (isGameOver || !started) return;

        if (e.cancelable) e.preventDefault();

        const pointerId = typeof e.pointerId === "number" ? e.pointerId : null;
        const moveEventName = pointerId !== null ? "pointermove" : "mousemove";
        const upEventName = pointerId !== null ? "pointerup" : "mouseup";
        const cancelEventName = pointerId !== null ? "pointercancel" : null;

        const startDiv = e.currentTarget;

        this._lockPageScroll();

        if (pointerId !== null && startDiv.setPointerCapture) {
            startDiv.setPointerCapture(pointerId);
        }

        const board = this.boardCtrl.getBoardModel().get();
        const startCell = board[r][c];

        const startPt = this._getClientPoint(e);
        const startX = startPt.x;
        const startY = startPt.y;

        let axis = null;
        let lastSteps = 0;

        const onMove = (ev) => {
            if (pointerId !== null && ev.pointerId !== pointerId) return;
            if (ev.cancelable) ev.preventDefault();

            const pt = this._getClientPoint(ev);
            const dx = pt.x - startX;
            const dy = pt.y - startY;

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
                    this.boardCtrl.render(this.boardCtrl.applyInsertPreview(r, c, axis, steps));
                } else {
                    this.boardCtrl.render();
                }
            }
        };

        const onUp = async (ev) => {
            if (pointerId !== null && ev.pointerId !== pointerId) return;

            document.removeEventListener(moveEventName, onMove);
            document.removeEventListener(upEventName, onUp);
            if (cancelEventName) document.removeEventListener(cancelEventName, onUp);

            if (pointerId !== null && startDiv.releasePointerCapture) {
                try { startDiv.releasePointerCapture(pointerId); } catch (err) { }
            }

            this._unlockPageScroll();

            const pt = this._getClientPoint(ev);
            const delta = axis === "h" ? (pt.x - startX) : (pt.y - startY);
            const steps = axis ? Math.round(delta / STEP) : 0;

            let finalR = r;
            let finalC = c;

            if (axis && steps !== 0) {
                if (axis === "h") finalC = clamp(c + steps, 0, SIZE - 1);
                else finalR = clamp(r + steps, 0, SIZE - 1);
            }

            if (!axis) {
                if (startCell && startCell.special) {
                    this.setBusy(true);
                    try {
                        const scoreRef = { value: this.getScore() };
                        await this.boardCtrl.triggerAt(r, c, scoreRef);
                        this.setScore(scoreRef.value);
                    } finally {
                        this.setBusy(false);
                    }

                    if (this.onAfterResolve) this.onAfterResolve();
                } else {
                    this.boardCtrl.render();
                }
                return;
            }

            if (steps !== 0) {
                this.setBusy(true);
                try {
                    this.boardCtrl.commitInsertShift(r, c, axis, steps);

                    const finalIdx = finalR * SIZE + finalC;
                    const finalDiv = this.boardCtrl.boardEl.children[finalIdx];
                    if (finalDiv) {
                        finalDiv.classList.add("release");
                        setTimeout(() => finalDiv.classList.remove("release"), 220);
                    }

                    if (startCell && startCell.special) {
                        const scoreRef = { value: this.getScore() };
                        await this.boardCtrl.triggerAt(finalR, finalC, scoreRef);
                        this.setScore(scoreRef.value);
                    } else {
                        const scoreRef = { value: this.getScore() };
                        await this.boardCtrl.resolveBoard(scoreRef, { r: finalR, c: finalC });
                        this.setScore(scoreRef.value);
                    }
                } finally {
                    this.setBusy(false);
                }

                if (this.onAfterResolve) this.onAfterResolve();
            } else {
                this.boardCtrl.render();
            }
        };

        document.addEventListener(moveEventName, onMove, { passive: false });
        document.addEventListener(upEventName, onUp, { passive: false });
        if (cancelEventName) {
            document.addEventListener(cancelEventName, onUp, { passive: false });
        }
    }
}
