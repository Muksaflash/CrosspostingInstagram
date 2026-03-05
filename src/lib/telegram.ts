/**
 * Validate Telegram initData via HMAC SHA-256 using Web Crypto API for Edge compatibility
 *
 * Logic follows Telegram's authentication requirements:
 * 1. Calculate Secret Key: HMAC_SHA256(botToken, "WebAppData")
 * 2. Sort all parameters alphabetically (excluding 'hash')
 * 3. Create data-check-string (key=value joined by \n)
 * 4. Calculate final hash: HMAC_SHA256(dataCheckString, SecretKey)
 */
export async function validateTelegramData(initData: string, botToken: string): Promise<boolean> {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");

    if (!hash) return false;

    // Remove hash from the string to check
    urlParams.delete("hash");

    // Sort keys alphabetically
    const keys = Array.from(urlParams.keys()).sort();

    // Compile data-check-string
    const dataCheckString = keys
      .map(key => `${key}=${urlParams.get(key)}`)
      .join("\n");

    const encoder = new TextEncoder();

    // Create Secret Key: HMAC_SHA256(botToken, "WebAppData")
    const secretKeyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const secretKeyBuffer = await crypto.subtle.sign(
      "HMAC",
      secretKeyMaterial,
      encoder.encode(botToken)
    );

    // Calculate final hash
    const finalKeyMaterial = await crypto.subtle.importKey(
      "raw",
      secretKeyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const calculatedHashBuffer = await crypto.subtle.sign(
      "HMAC",
      finalKeyMaterial,
      encoder.encode(dataCheckString)
    );

    // Convert ArrayBuffer to Hex String
    const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return calculatedHash === hash;
  } catch (error) {
    console.error("Error validating Telegram data:", error);
    return false;
  }
}
