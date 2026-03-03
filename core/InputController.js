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

        // 드래그 중 페이지 스크롤/휠 방지 핸들러
        this._scrollLockHandler = (ev) => {
            if (ev.cancelable) ev.preventDefault();
        };

        this._activePointerId = null;
    }

    // 드래그 시작 시 페이지 스크롤 잠금
    _lockPageScroll() {
        document.documentElement.classList.add("board-drag-lock");
        document.body.classList.add("board-drag-lock");

        document.addEventListener("touchmove", this._scrollLockHandler, { passive: false });
        document.addEventListener("wheel", this._scrollLockHandler, { passive: false });
    }

    // 드래그 종료 시 페이지 스크롤 잠금 해제
    _unlockPageScroll() {
        document.documentElement.classList.remove("board-drag-lock");
        document.body.classList.remove("board-drag-lock");

        document.removeEventListener("touchmove", this._scrollLockHandler);
        document.removeEventListener("wheel", this._scrollLockHandler);
    }

    // mouse / touch / pointer 이벤트를 공통 좌표로 변환
    _getClientPoint(ev) {
        if (ev.touches && ev.touches.length > 0) {
            return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        }
        if (ev.changedTouches && ev.changedTouches.length > 0) {
            return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
        }
        return { x: ev.clientX, y: ev.clientY };
    }

    // 셀 pointerdown / mousedown 진입점
    onMouseDown(e, r, c) {
        // 게임 중이 아니면 입력 무시
        const { isGameOver, started, isPaused } = this.getState();
        if (isGameOver || !started || isPaused) return;

        if (e.cancelable) e.preventDefault();

        // pointer 이벤트 지원 시 pointer 계열, 아니면 mouse 계열 이벤트 사용
        const pointerId = typeof e.pointerId === "number" ? e.pointerId : null;

        // ✅ 멀티터치 안정화: 이미 다른 포인터가 드래그 중이면 무시
        if (pointerId !== null) {
            if (this._activePointerId !== null && this._activePointerId !== pointerId) return;
            this._activePointerId = pointerId;
        } else {
            // 마우스/비-pointer fallback: pointer 세션 진행 중이면 무시
            if (this._activePointerId !== null) return;
        }

        const moveEventName = pointerId !== null ? "pointermove" : "mousemove";
        const upEventName = pointerId !== null ? "pointerup" : "mouseup";
        const cancelEventName = pointerId !== null ? "pointercancel" : null;

        const startDiv = e.currentTarget;

        this._lockPageScroll();

        // 포인터 캡처: 드래그 중 포인터가 셀 영역을 벗어나도 이벤트 유지
        if (pointerId !== null && startDiv.setPointerCapture) {
            startDiv.setPointerCapture(pointerId);
        }

        const board = this.boardCtrl.getBoardModel().get();
        const startCell = board[r][c];

        // 드래그 시작점
        const startPt = this._getClientPoint(e);
        const startX = startPt.x;
        const startY = startPt.y;

        // axis: null(미결정) -> "h" 또는 "v"
        let axis = null;
        // 마지막으로 렌더한 step 상태 (중복 렌더 방지)
        let lastSteps = 0;

        // 드래그 이동 중: 프리뷰 렌더
        const onMove = (ev) => {
            if (pointerId !== null && ev.pointerId !== pointerId) return;
            if (ev.cancelable) ev.preventDefault();

            const pt = this._getClientPoint(ev);
            const dx = pt.x - startX;
            const dy = pt.y - startY;

            // 축 고정 전에는 임계값(8px) 넘을 때까지 대기
            if (!axis) {
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
                } else {
                    return;
                }
            }

            // 축 기준 이동량 -> step 단위 반올림
            const delta = axis === "h" ? dx : dy;
            const steps = Math.round(delta / STEP);

            // step 변화가 있을 때만 프리뷰 갱신
            if (steps !== lastSteps) {
                lastSteps = steps;

                // ❌ 기존: this.boardCtrl.render(this.boardCtrl.applyInsertPreview(...))
                // ✅ 변경: 프리뷰 상태만 업데이트
                this.boardCtrl.setInsertPreview(r, c, axis, steps);
            }
        };

        // 드래그 종료: 실제 커밋 + resolve
        const onUp = async (ev) => {
            if (pointerId !== null && ev.pointerId !== pointerId) return;

            // 리스너 정리
            document.removeEventListener(moveEventName, onMove);
            document.removeEventListener(upEventName, onUp);
            if (cancelEventName) document.removeEventListener(cancelEventName, onUp);

            // 포인터 캡처 해제
            if (pointerId !== null && startDiv.releasePointerCapture) {
                try { startDiv.releasePointerCapture(pointerId); } catch (err) { }
            }

            this._unlockPageScroll();

            // ✅ 여기 추가
            this.boardCtrl.clearInsertPreview();

            // 입력 잠금은 분기 리턴 전에 즉시 해제 (탭 경로 return 대응)
            if (pointerId !== null && this._activePointerId === pointerId) {
                this._activePointerId = null;
            }
            if (pointerId === null) {
                this._activePointerId = null;
            }

            // 종료 시점 기준 최종 step 계산
            const pt = this._getClientPoint(ev);
            const delta = axis === "h" ? (pt.x - startX) : (pt.y - startY);
            const steps = axis ? Math.round(delta / STEP) : 0;

            let finalR = r;
            let finalC = c;

            // 이동 후 최종 좌표計算 (보드 범위 clamp)
            if (axis && steps !== 0) {
                if (axis === "h") finalC = clamp(c + steps, 0, SIZE - 1);
                else finalR = clamp(r + steps, 0, SIZE - 1);
            }

            // ---- 탭(축 미결정) 처리 ----
            if (!axis) {
                if (startCell && startCell.special) {
                    // 특수 블록 탭 발동
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
                    // 일반 셀 탭은 변경 없음 -> 렌더 원복
                    this.boardCtrl.render();
                }
                return;
            }

            // ---- 드래그 이동 처리 ----
            if (steps !== 0) {
                this.setBusy(true);
                try {
                    // 실제 보드 이동 커밋
                    this.boardCtrl.commitInsertShift(r, c, axis, steps);

                    // 이동 완료 셀 탄성 연출
                    const finalIdx = finalR * SIZE + finalC;
                    const finalDiv = this.boardCtrl.boardEl.children[finalIdx];
                    if (finalDiv) {
                        finalDiv.classList.add("release");
                        setTimeout(() => finalDiv.classList.remove("release"), 220);
                    }

                    // 시작 셀이 특수면 해당 위치에서 발동, 아니면 매치 resolve
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
                // 축은 잡혔지만 step이 0으로 끝난 경우 원복
                this.boardCtrl.render();
            }

        };

        // 전역 리스너 등록
        document.addEventListener(moveEventName, onMove, { passive: false });
        document.addEventListener(upEventName, onUp, { passive: false });
        if (cancelEventName) {
            document.addEventListener(cancelEventName, onUp, { passive: false });
        }
    }
}
