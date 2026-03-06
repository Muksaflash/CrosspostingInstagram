
import { signIn } from "@/auth"
 
export default function SignIn() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white dark:bg-zinc-900 p-6 shadow-md">
        <h1 className="text-center text-2xl font-bold dark:text-white">Welcome Back</h1>
        <p className="text-center text-gray-500 dark:text-zinc-400">Sign in to access your dashboard</p>
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/" })
          }}
        >
          <button 
            type="submit"
            className="w-full rounded-md bg-black dark:bg-white px-4 py-2 text-white dark:text-black transition hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  )
}
