// JavaScript source code
//
export class GameConfig {
    constructor(upgrades) {
        this.upgrades = upgrades || { levels: {} };
    }

    // 기본 3매치 점수 (업그레이드 반영)
    getBase3() {
        const base3 = 100;
        const baseBonusPerLevel = 50;
        const lvl = this.upgrades.levels?.baseScore || 0;
        return base3 + lvl * baseBonusPerLevel;
    }

    // 매치 승수
    getMatchMultiplier(removedTotal) {
        if (removedTotal >= 6) return 3.0;
        if (removedTotal === 5) return 2.0;
        if (removedTotal === 4) return 1.5;
        return 1.0;
    }

    // 콤보 관련
    getComboBase() { return 50; }
    getComboPerLevel() { return 15; }
    getComboPerCount() {
        const lvl = this.upgrades.levels?.comboScore || 0;
        return this.getComboBase() + lvl * this.getComboPerLevel();
    }

    // 특수 기본값 및 업그레이드 단위
    getBombBase() { return 200; }
    getCrossBase() { return 200; }
    getBombPerLevel() { return 300; }
    getCrossPerLevel() { return 300; }

    // 시간 관련
    getTimeBase() { return 6; }
    getTimePerLevel() { return 2; }
}
