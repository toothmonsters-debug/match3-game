export class UpgradeSystem {
  constructor() {
    this.points = 0;

    this.levels = {
      baseScore: 0,
      comboScore: 0,
      timeBonus: 0,
      bombScore: 0,
      crossScore: 0,
      comboKeep: 0,
    };

    this.maxLevel = 20;

    this.priceTable = [
      1, 3, 6, 10, 15, 22, 30, 40, 55, 75,
        95, 120, 150, 185, 225, 270, 320, 375, 435, 500
    ];
  }

  getLevel(key) {
    return this.levels[key];
  }

  getPrice(key) {
    const lv = this.levels[key];
    if (lv >= this.maxLevel) return Infinity;
    return this.priceTable[lv];
  }

  canBuy(key) {
    const price = this.getPrice(key);
    return this.points >= price && this.levels[key] < this.maxLevel;
  }

  buy(key) {
    if (!this.canBuy(key)) return false;

    const price = this.getPrice(key);
    this.points -= price;
    this.levels[key]++;
    return true;
  }

  addPoints(p) {
    this.points += p;
  }
}
