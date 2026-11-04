"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/error";
import { formatDate } from "@/lib/format";
import type { Profile, Role } from "@/lib/types";

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (active) setCurrentId(user?.id ?? null);

        if (user) {
          const { data: me } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          if (active) setIsOwner(me?.role === "owner");
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, role, created_at")
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (active) setProfiles((data ?? []) as Profile[]);
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Gagal memuat pengguna."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function changeRole(profile: Profile, role: Role) {
    setError(null);
    setSavingId(profile.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", profile.id);
      if (error) throw error;
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal mengubah role."));
    } finally {
      setSavingId(null);
    }
  }

  if (!isOwner && !loading) {
    return (
      <div className="card card-pad">
        <h1 className="text-lg font-semibold text-slate-900">Pengguna</h1>
        <p className="mt-1 text-sm text-slate-500">
          Halaman ini hanya dapat diakses oleh owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Pengguna
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Kelola akses owner dan kasir.
        </p>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Owner dapat mengakses semua menu. Kasir hanya dapat membuka Dashboard,
        Kasir, dan Transaksi. Pengguna baru otomatis terdaftar sebagai kasir.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Terdaftar</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const isSelf = profile.id === currentId;
                return (
                  <tr key={profile.id} className="hover:bg-slate-50/60">
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          {profile.role === "owner" ? (
                            <ShieldCheck className="h-4 w-4 text-amber-600" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </span>
                        <span className="font-medium text-slate-800">
                          {profile.full_name || "-"}
                          {isSelf && (
                            <span className="ml-2 badge bg-slate-100 text-slate-500">
                              Anda
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="text-sm text-slate-500">
                      {profile.email ?? "-"}
                    </td>
                    <td className="text-sm text-slate-500">
                      {profile.created_at ? formatDate(profile.created_at) : "-"}
                    </td>
                    <td>
                      {isSelf ? (
                        <span className="badge bg-amber-100 text-amber-700">
                          {profile.role === "owner" ? "Owner" : "Kasir"}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={profile.role}
                            disabled={savingId === profile.id}
                            onChange={(e) =>
                              changeRole(profile, e.target.value as Role)
                            }
                            className="input max-w-[9rem] py-1.5 text-sm"
                          >
                            <option value="cashier">Kasir</option>
                            <option value="owner">Owner</option>
                          </select>
                          {savingId === profile.id && (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
