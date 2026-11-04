export type Role = "owner" | "cashier";
export type PaymentMethod = "cash" | "qris" | "transfer" | "ewallet";
export type TransactionType = "sale" | "income" | "expense";
export type DebtDirection = "payable" | "receivable";
export type OverpaymentAction = "change" | "deposit";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  price: number;
  stock: number;
  is_active: boolean;
  created_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  created_at?: string;
}

export interface CustomerAccount {
  customer_id: number;
  debt_balance: number;
  deposit_balance: number;
  updated_at?: string;
  customers?: Customer | Customer[] | null;
}

export type CustomerLedgerKind =
  | "debt_add"
  | "debt_payment"
  | "deposit_add"
  | "deposit_use"
  | "deposit_refund"
  | "debt_adjustment_add"
  | "debt_adjustment_sub"
  | "deposit_adjustment_add"
  | "deposit_adjustment_sub"
  | "adjustment";

export type AdjustmentAccount = "debt" | "deposit";
export type AdjustmentDirection = "add" | "sub";

export interface CustomerLedgerEntry {
  id: number;
  customer_id: number;
  kind: CustomerLedgerKind;
  amount: number;
  transaction_id: number | null;
  note: string | null;
  created_at: string;
}

export interface CheckoutResult {
  transaction_id: number;
  total: number;
  deposit_used: number;
  cash_received: number;
  change_amount: number;
  debt_added: number;
  debt_paid: number;
  deposit_added: number;
  new_debt_balance: number;
  new_deposit_balance: number;
}

export interface TransactionItem {
  id: number;
  transaction_id: number;
  product_id: number | null;
  product_name: string;
  price: number;
  qty: number;
  subtotal: number;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  total: number;
  payment_method: PaymentMethod | null;
  category: string | null;
  note: string | null;
  cashier_id: string | null;
  cashier_name: string | null;
  customer_id: number | null;
  cash_received: number | null;
  change_amount: number;
  deposit_used: number;
  debt_added: number;
  debt_paid: number;
  deposit_added: number;
  created_at: string;
  transaction_items?: TransactionItem[];
  customers?: { name: string } | { name: string }[] | null;
}

export interface Debt {
  id: number;
  direction: DebtDirection;
  party_name: string;
  description: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: "open" | "paid";
  created_at: string;
  debt_payments?: DebtPayment[];
}

export interface DebtPayment {
  id: number;
  debt_id: number;
  amount: number;
  note: string | null;
  paid_at: string;
}

export interface CartItem {
  product: Product;
  qty: number;
}
