import { GameConfig } from "./GameConfig.js";

export class ScoreSystem {
    constructor(upgrades) {
        this.upgrades = upgrades;
        this.cfg = new GameConfig(upgrades);
    }

    // 기존 호환용(참고)
    scorePerBlock(n) {
        if (n === 3) return 100;
        if (n === 4) return 150;
        if (n === 5) return 200;
        return 300;
    }

    calcTierSize({ matchSize, removedTotal }) {
        const adjustedMatchSize = matchSize >= 4 ? removedTotal + 1 : removedTotal;
        if (adjustedMatchSize >= 6) return 6;
        if (adjustedMatchSize === 5) return 5;
        if (adjustedMatchSize === 4) return 4;
        return 3;
    }

    // 새 중앙 설정 사용: removedTotal 기준으로 per-block 계산 (콤보 승수 적용)
    calcPerBlockScore({ tierSize = 3, combo = 0, removedTotal } = {}) {
        const comboMul = 1 + Math.pow(combo, 1.2) * 0.6;

        if (typeof removedTotal === "number") {
            const base3 = this.cfg.getBase3();
            const matchMul = this.cfg.getMatchMultiplier(removedTotal);
            const preCombo = base3 * matchMul;
            return Math.floor(preCombo * comboMul);
        }

        // 폴백: 이전 방식 (tierSize 기반)
        const base = this.scorePerBlock(tierSize);
        const baseBonus = this.upgrades.levels.baseScore * 50;
        return Math.floor((base + baseBonus) * comboMul);
    }

    // 특수 보너스 (블럭 1개당)
    calcSpecialBonus({ bombCount, crossCount }) {
        const bombBase = this.cfg.getBombBase();
        const crossBase = this.cfg.getCrossBase();

        const bombUpg = (this.upgrades.levels?.bombScore || 0) * this.cfg.getBombPerLevel();
        const crossUpg = (this.upgrades.levels?.crossScore || 0) * this.cfg.getCrossPerLevel();

        const bombScore = (bombCount || 0) * (bombBase + bombUpg);
        const crossScore = (crossCount || 0) * (crossBase + crossUpg);

        return bombScore + crossScore;
    }

    // 콤보 보너스: 선형 적용 (cfg에서 단위 가져옴)
    calcComboBonus(comboCount) {
        const comboPerCount = this.cfg.getComboPerCount();
        return Math.floor(comboPerCount * (comboCount || 0));
    }

    calcGain({ perBlockScore, removedTotal }) {
        return perBlockScore * removedTotal;
    }
}
