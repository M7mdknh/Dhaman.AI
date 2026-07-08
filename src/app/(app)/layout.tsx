import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getSession } from "@/lib/auth/session";

/**
 * Protected shell. The middleware already gates these routes; this check is
 * defense in depth (and provides the session to the UI).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar role={session.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar session={session} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 md:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
