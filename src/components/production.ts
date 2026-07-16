export const MAX_AE_LEVEL = 7;
export const AE_PP_PER_DAY: Record<number, number> = Object.fromEntries(
  Array.from({ length: MAX_AE_LEVEL + 1 }, (_, level) => [level, level * 24])
);

// Konstanta resmi dari gameConfig (bukan asumsi)
export const ENERGY_COST_PER_ACTION = 10; // energi terpakai per 1x sesi kerja
export const REGEN_DIVIDED_BY = 10;       // regen/jam = maxEnergy / REGEN_DIVIDED_BY
export const FIDELITY_BONUS_PERCENT_PER_POINT = 1; // tiap poin fidelity = +1%

interface CalculateWorkerParams {
  energyMax?: number;
  productionValue?: number;
  wagePerPP?: number;
  fidelity?: number;
  companyBonusPercent?: number;
}

export function calculateWorkerDailyOutput({
  energyMax = 0,
  productionValue = 0,
  wagePerPP = 0,
  fidelity = 0,
  companyBonusPercent = 0,
}: CalculateWorkerParams) {
  const hourlyRegen = energyMax / REGEN_DIVIDED_BY;
  const sessionsPerDay = (hourlyRegen * 24) / ENERGY_COST_PER_ACTION;

  // PP mentah (SEBELUM bonus apa pun) — ini yang dipakai buat hitung wage,
  // karena worker dibayar dari PP mentah, bonus company/fidelity sepenuhnya
  // jadi milik employer, bukan menaikkan wage.
  const rawPPPerDay = sessionsPerDay * productionValue;
  const wagePerDay = rawPPPerDay * wagePerPP;

  // PP yang benar-benar masuk ke storage company (SETELAH bonus fidelity + company)
  const fidelityBonusPercent = fidelity * FIDELITY_BONUS_PERCENT_PER_POINT;
  const totalBonusMultiplier = 1 + (fidelityBonusPercent / 100) + (companyBonusPercent / 100);
  const boostedPPPerDay = rawPPPerDay * totalBonusMultiplier;

  return {
    sessionsPerDay,
    rawPPPerDay,
    wagePerDay,
    fidelityBonusPercent,
    boostedPPPerDay,
  };
}

export function calculateCompanyProduction(comp: any, regionData: any, countryData: any) {
  const baseEfficiency = 100;
  const regionalBonus = regionData?.deposit?.bonusPercent ?? 0;
  const countryBonus = countryData?.taxes?.market ?? 0;
  const totalEfficiency = Math.max(0, baseEfficiency + regionalBonus - countryBonus);

  const breakdownNotes = [
    `${baseEfficiency}% Baseline produksi`,
    `${regionalBonus >= 0 ? '+' : ''}${regionalBonus}% Bonus wilayah`,
    `${countryBonus >= 0 ? '+' : ''}${countryBonus}% Pajak negara`,
    `= ${totalEfficiency}% Estimasi efisiensi`,
  ];

  return { totalEfficiency, breakdownNotes };
}
