const qrcode = require("qrcode-terminal");

async function main() {
  const port = process.env.EXPO_PORT ?? "8081";
  const response = await fetch(`http://127.0.0.1:${port}/_expo/link?platform=ios`, {
    redirect: "manual"
  });
  const url = response.headers.get("location");

  if (!url) {
    throw new Error("Expo tunnel URL not found. Start mobile-tunnel first.");
  }

  console.log(url);
  qrcode.generate(url, { small: true }, (qr) => console.log(qr));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
