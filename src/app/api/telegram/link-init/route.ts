import { NextRequest, NextResponse } from "next/server";
import { firestore } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { validateTelegramData } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData } = body;
    
    if (!initData) {
      return NextResponse.json({ error: "Missing initData" }, { status: 400 });
    }
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("Missing TELEGRAM_BOT_TOKEN in env");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const isValid = await validateTelegramData(initData, botToken);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid Telegram data" }, { status: 401 });
    }

    // Extract user info
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get("user");
    
    if (!userStr) {
      return NextResponse.json({ error: "No user found in initData" }, { status: 400 });
    }
    
    const tgUser = JSON.parse(userStr);
    const telegramId = tgUser.id.toString();

    // Generate link token
    const token = uuidv4();
    
    // Save to Firestore with a TTL (e.g. 15 minutes)
    // We store the exact time so we can validate it later 
    await firestore.collection("telegramLinkTokens").doc(token).set({
      telegramId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 mins
    });
    
    // We assume the app is hosted on standard HTTP(S) setup where req.nextUrl points back to us
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`;
    const targetUrl = new URL(`/tg-link?token=${token}`, baseUrl).toString();

    return NextResponse.json({ url: targetUrl });
  } catch (error) {
    console.error("Link init error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
