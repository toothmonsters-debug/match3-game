export class TimerController {
    constructor({ durationSec, onTick, onWarning, onTimeout }) {
        this.durationSec = durationSec;
        this.onTick = onTick;
        this.onWarning = onWarning;
        this.onTimeout = onTimeout;

        this._timer = null;
        this._timeLeft = durationSec;
        this._running = false;
    }

    setDuration(sec) {
        this.durationSec = sec;
    }

    start() {
        this.stop();
        this._timeLeft = this.durationSec;
        this._running = true;

        if (this.onTick) this.onTick(this._timeLeft);

        this._startInterval();
    }

    _startInterval() {
        this._timer = setInterval(async () => {
            if (!this._running) return;

            this._timeLeft--;
            if (this.onTick) this.onTick(this._timeLeft);

            if (this._timeLeft <= 5 && this._timeLeft > 0) {
                if (this.onWarning) this.onWarning(this._timeLeft);
            }

            if (this._timeLeft <= 0) {
                this.stop();
                if (this.onTimeout) await this.onTimeout();
            }
        }, 1000);
    }

    pause() {
        if (!this._running) return;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this._running = false;
    }

    resume() {
        if (this._running || this._timeLeft <= 0) return;
        this._running = true;
        if (this.onTick) this.onTick(this._timeLeft);
        this._startInterval();
    }

    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this._running = false;
    }

    get timeLeft() {
        return this._timeLeft;
    }
}
