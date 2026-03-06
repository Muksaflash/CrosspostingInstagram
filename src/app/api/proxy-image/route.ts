import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing URL", { status: 400 });
  }

  // Security: Only allow proxying from known CDN domains to prevent SSRF
  const ALLOWED_DOMAINS = ["cdninstagram.com", "fbcdn.net", "res.cloudinary.com"];

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    const isAllowed = ALLOWED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith("." + domain)
    );

    if (!isAllowed) {
      console.warn(`Blocked proxy attempt to unauthorized domain: ${hostname}`);
      return new NextResponse("Forbidden", { status: 403 });
    }
  } catch (error) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        // Many CDNs block requests without an accept header or standard user agent
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      // Bypass standard referrer checks
      referrerPolicy: "no-referrer"
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400", // Cache for 1 day
      },
    });
  } catch (error: any) {
    console.error("Image Proxy Error:", error);
    return new NextResponse("Error fetching image", { status: 500 });
  }
}
