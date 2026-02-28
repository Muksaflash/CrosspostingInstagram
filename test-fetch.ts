import { getInstagramPostByShortcode } from "./src/lib/instagram.js";

async function run() {
  const rapidApiKey = "a5540b9e3amsh037c0ff736afabdp13ee5ajsn981e3c178da3";
  try {
    const post = await getInstagramPostByShortcode("DU6RVgliIxy", rapidApiKey);
    console.log("SUCCESSFULLY PARSED POST:");
    console.log(JSON.stringify(post, null, 2));
  } catch (e: any) {
    console.error("Fetch failed:", e.message);
  }
}

run();
