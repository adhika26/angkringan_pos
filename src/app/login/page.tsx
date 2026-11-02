"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  Store,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });

        if (error) throw error;

        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
        } else {
          setInfo(
            "Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk kembali.",
          );
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan, coba lagi.";
      setError(translateError(message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:w-[45%] lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">Angkringan POS</p>
            <p className="text-sm text-slate-400">Kasir & pembukuan UMKM</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Catat penjualan, pantau untung, kelola hutang dalam satu tempat.
          </h1>
          <ul className="space-y-3 text-slate-300">
            {[
              "Kasir cepat dengan keranjang dan pembayaran tunai/QRIS",
              "Pemasukan & pengeluaran tercatat otomatis",
              "Laporan harian, bulanan, dan grafik penjualan",
              "Kelola utang supplier dan piutang pelanggan",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          Dibuat untuk angkringan, warung, dan UMKM Indonesia.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-900">
                Angkringan POS
              </p>
              <p className="text-sm text-slate-500">Kasir & pembukuan UMKM</p>
            </div>
          </div>

          <div className="card card-pad sm:p-8">
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === "register"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Daftar
              </button>
            </div>

            {!configured && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Supabase belum dikonfigurasi. Salin{" "}
                <code className="font-mono text-xs">.env.example</code> menjadi{" "}
                <code className="font-mono text-xs">.env.local</code> lalu isi
                URL dan anon key.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label htmlFor="fullName" className="label">
                    Nama lengkap
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="fullName"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nama Anda"
                      className="input pl-10"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="input pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Kata sandi
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="input pl-10"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {info}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !configured}
                className="btn-primary w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {mode === "login" ? "Masuk ke aplikasi" : "Buat akun"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
              Pengguna pertama yang mendaftar otomatis menjadi{" "}
              <span className="font-semibold text-slate-700">Owner</span>.
              Pengguna berikutnya menjadi kasir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function translateError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Email atau kata sandi salah.";
  }
  if (lower.includes("already registered")) {
    return "Email ini sudah terdaftar. Silakan masuk.";
  }
  if (lower.includes("password should be at least")) {
    return "Kata sandi minimal 6 karakter.";
  }
  if (lower.includes("unable to validate email")) {
    return "Format email tidak valid.";
  }
  if (lower.includes("email not confirmed")) {
    return "Email belum dikonfirmasi. Cek kotak masuk Anda.";
  }
  return message;
}
