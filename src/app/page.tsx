
import { auth } from "@/auth";
import Dashboard from "@/components/Dashboard";
import { getSocialNetworks, getLastPost } from "@/app/actions";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";

export default async function Home() {
  const session = await auth();
  if (!session?.user && process.env.NODE_ENV !== "development") redirect("/login");

  const initialNetworks = await getSocialNetworks();
  const initialPost = await getLastPost();

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <PageHeader userName={session?.user?.name || session?.user?.email || "Test User"} />
        <Dashboard initialNetworks={initialNetworks} initialPost={initialPost} />
      </div>
    </main>
  );
}
