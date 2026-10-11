export interface PayoutBreakdown {
  grossRupees: number;
  platformFeeRupees: number;
  gstRupees: number;
  tdsRupees: number;
  netRupees: number;
}

export function roundRupees(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePayout(grossRupees: number): PayoutBreakdown {
  const platformFeeRupees = roundRupees(grossRupees * 0.1);
  const gstRupees = roundRupees(platformFeeRupees * 0.18);
  const tdsRupees = roundRupees(grossRupees * 0.01);
  return {
    grossRupees: roundRupees(grossRupees),
    platformFeeRupees,
    gstRupees,
    tdsRupees,
    netRupees: roundRupees(
      grossRupees - platformFeeRupees - gstRupees - tdsRupees,
    ),
  };
}
