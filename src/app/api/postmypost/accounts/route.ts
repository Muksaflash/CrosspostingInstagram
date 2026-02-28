import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserSettings } from "@/app/actions";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const settings = await getUserSettings();
    const token = settings?.POSTMYPOST_TOKEN;
    const projectId = settings?.POSTMYPOST_PROJECT_ID;

    if (!token || !projectId) {
      return new NextResponse(
        "PostMyPost Token or Project ID not configured in settings",
        { status: 400 }
      );
    }

    const res = await fetch(`https://api.postmypost.io/v4.1/accounts?project_id=${projectId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
       const errBody = await res.text();
       throw new Error(`PostMyPost API Error: ${res.status} ${errBody}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("PostMyPost Fetch Error:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
