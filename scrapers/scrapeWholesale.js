require("dotenv").config();
const connectToDatabase = require("../config/db");
const { scrapeWholesaleAndStore } = require("./wholesaleScraper");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    args[key] = val;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const query = String(args.q || args.query || "").trim();
  if (!query) {
    throw new Error('Missing required --q "your search term"');
  }

  const maxPerPlatform = Number(args.max || 20);
  const platforms = String(args.platforms || "Daraz,Telemart,MadeInChina,Alibaba")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const headful = !!args.headful;
  const chromePath = typeof args.chrome === "string" ? args.chrome : undefined;
  const userDataDir = typeof args.userDataDir === "string" ? args.userDataDir : undefined;

  await connectToDatabase();
  const result = await scrapeWholesaleAndStore({ query, platforms, maxPerPlatform, headful, chromePath, userDataDir });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
