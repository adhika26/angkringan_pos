"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  ShoppingCart,
  Store,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "Kasir", icon: ShoppingCart },
  { href: "/transactions", label: "Transaksi", icon: ReceiptText },
  { href: "/reports", label: "Laporan", icon: BarChart3, ownerOnly: true },
  { href: "/debts", label: "Hutang & Piutang", icon: HandCoins, ownerOnly: true },
  { href: "/products", label: "Produk", icon: Package, ownerOnly: true },
  { href: "/users", label: "Pengguna", icon: Users, ownerOnly: true },
];

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email || "?";
  return source.slice(0, 2).toUpperCase();
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-emerald-50 text-emerald-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${active ? "text-emerald-600" : "text-slate-400"}`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBox({
  profile,
  isOwner,
  onLogout,
}: {
  profile: Profile;
  isOwner: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
        {initials(profile.full_name, profile.email)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {profile.full_name || profile.email}
        </p>
        <span
          className={`badge mt-0.5 ${
            isOwner ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
          }`}
        >
          {isOwner ? "Owner" : "Kasir"}
        </span>
      </div>
      <button
        type="button"
        onClick={onLogout}
        title="Keluar"
        className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isOwner = profile.role === "owner";
  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);
  const quickItems = items.slice(0, 3);

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900">
              Angkringan POS
            </p>
            <p className="text-xs text-slate-500">Kasir & pembukuan</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks items={items} pathname={pathname} />
        </div>
        <div className="border-t border-slate-100 p-3">
          <UserBox profile={profile} isOwner={isOwner} onLogout={handleLogout} />
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight text-slate-900">
              Angkringan POS
            </p>
            <p className="text-[11px] leading-tight text-slate-500">
              {profile.full_name || profile.email}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <UtensilsCrossed className="h-5 w-5" />
                </div>
                <p className="text-sm font-bold text-slate-900">Angkringan POS</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks
                items={items}
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
            <div className="border-t border-slate-100 p-3">
              <UserBox profile={profile} isOwner={isOwner} onLogout={handleLogout} />
            </div>
          </div>
        </div>
      )}

      {/* Konten */}
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-3">
          {quickItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-emerald-600" : "text-slate-500"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
