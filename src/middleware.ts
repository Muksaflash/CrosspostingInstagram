
import { auth } from "@/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnDashboard = req.nextUrl.pathname.startsWith("/")
  const isOnLogin = req.nextUrl.pathname.startsWith("/login")

  if (isOnDashboard && !isOnLogin && !isLoggedIn) {
      if (req.nextUrl.pathname.startsWith("/api/auth")) {
          return null // Allow auth routes
      }
      return Response.redirect(new URL("/login", req.nextUrl))
  }

  if (isOnLogin && isLoggedIn) {
    return Response.redirect(new URL("/", req.nextUrl))
  }

  return null
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
