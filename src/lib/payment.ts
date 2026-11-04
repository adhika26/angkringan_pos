import type { OverpaymentAction } from "@/lib/types";

export interface CheckoutCalculationInput {
  total: number;
  oldDebt: number;
  depositBalance: number;
  useDeposit: boolean;
  cashReceived: number | null;
  overpaymentAction: OverpaymentAction;
  hasCustomer: boolean;
}

export interface CheckoutCalculation {
  depositUsed: number;
  remaining: number;
  totalObligation: number;
  cashReceived: number;
  shortfall: number;
  surplus: number;
  debtPaid: number;
  change: number;
  depositAdded: number;
  newDebt: number;
  newDeposit: number;
  requiresCustomer: boolean;
  error: string | null;
}

export function calculateCheckout(
  input: CheckoutCalculationInput,
): CheckoutCalculation {
  const total = Math.max(Number(input.total) || 0, 0);
  const oldDebt = input.hasCustomer
    ? Math.max(Number(input.oldDebt) || 0, 0)
    : 0;
  const depositBalance = input.hasCustomer
    ? Math.max(Number(input.depositBalance) || 0, 0)
    : 0;

  const depositUsed =
    input.useDeposit && input.hasCustomer
      ? Math.min(depositBalance, total)
      : 0;
  const remaining = Math.max(total - depositUsed, 0);
  const totalObligation = remaining + oldDebt;

  const cashReceived =
    input.cashReceived === null || Number.isNaN(input.cashReceived)
      ? remaining
      : Math.max(Number(input.cashReceived), 0);

  let shortfall = 0;
  let surplus = 0;
  let debtPaid = 0;
  let change = 0;
  let depositAdded = 0;
  let newDebt = oldDebt;
  let newDeposit = Math.max(depositBalance - depositUsed, 0);
  let requiresCustomer = false;
  let error: string | null = null;

  if (cashReceived < remaining) {
    shortfall = remaining - cashReceived;
    if (!input.hasCustomer) {
      requiresCustomer = true;
      error = "Isi nama pelanggan untuk mencatat kekurangan sebagai hutang.";
    } else {
      newDebt = oldDebt + shortfall;
    }
  } else {
    surplus = cashReceived - remaining;
    debtPaid = Math.min(surplus, oldDebt);
    newDebt = oldDebt - debtPaid;
    const leftover = surplus - debtPaid;

    if (leftover > 0) {
      if (input.overpaymentAction === "deposit") {
        if (!input.hasCustomer) {
          requiresCustomer = true;
          error =
            "Isi nama pelanggan untuk menyimpan kelebihan sebagai deposit.";
        } else {
          depositAdded = leftover;
          newDeposit += leftover;
        }
      } else {
        change = leftover;
      }
    }
  }

  return {
    depositUsed,
    remaining,
    totalObligation,
    cashReceived,
    shortfall,
    surplus,
    debtPaid,
    change,
    depositAdded,
    newDebt,
    newDeposit,
    requiresCustomer,
    error,
  };
}
