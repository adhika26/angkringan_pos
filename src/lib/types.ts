export type Role = "owner" | "cashier";
export type PaymentMethod = "cash" | "qris" | "transfer" | "ewallet";
export type TransactionType = "sale" | "income" | "expense";
export type DebtDirection = "payable" | "receivable";

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
  created_at: string;
  transaction_items?: TransactionItem[];
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
