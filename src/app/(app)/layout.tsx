import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient().catch(() => null);

  if (!supabase) {
    redirect("/login");
  }

  let user = null;
  let profile: Profile | null = null;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", user.id)
        .single();
      profile = (data as Profile | null) ?? null;
    }
  } catch {
    redirect("/login");
  }

  if (!user) {
    redirect("/login");
  }

  const safeProfile: Profile = profile ?? {
    id: user.id,
    email: user.email ?? null,
    full_name: user.email ?? null,
    role: "cashier",
  };

  return <AppShell profile={safeProfile}>{children}</AppShell>;
}
