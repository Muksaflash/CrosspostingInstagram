
import { auth } from "@/auth";
import Dashboard from "@/components/Dashboard";
import { getSocialNetworks } from "@/app/actions";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const initialNetworks = await getSocialNetworks();

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
         <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Instagram Automation</h1>
              <p className="text-gray-500">Welcome, {session.user.name || session.user.email}</p>
            </div>
            {/* Add more header actions like Settings/Logout here */}
         </header>
         
         <Dashboard initialNetworks={initialNetworks} />
      </div>
    </main>
  );
}
