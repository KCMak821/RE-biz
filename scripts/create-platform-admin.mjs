import { stdin, stdout } from "node:process";

import bcrypt from "bcryptjs";
import { MongoClient, ServerApiVersion } from "mongodb";

/**
 * Creates a platform administrator: the people who run RE-Biz, as opposed to
 * the customers who use it. These accounts live in `platformAdmins`, belong to
 * no company, and never appear in customer-facing data.
 *
 * The password is typed at the terminal rather than passed as an argument, so
 * it stays out of the shell history and out of the process list.
 */

const [email, name] = process.argv.slice(2);
const uri = process.env.MONGODB_URI;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!email || !name) fail('Usage: npm run admin:create -- admin@example.com "Their Name"');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not a valid email address.`);
if (!uri) fail("MONGODB_URI is not set. Add it to .env.local, or pass it in the environment.");

const INTERRUPT = String.fromCharCode(3);
const END_OF_TRANSMISSION = String.fromCharCode(4);
const DELETE = String.fromCharCode(127);

/**
 * Reads one line with the terminal's echo turned off, so the password never
 * appears on screen or in a scrollback buffer. Raw mode hands over one chunk at
 * a time, which may hold several characters when the value is pasted.
 */
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        // Enter, or Ctrl+D, ends the entry.
        if (character === "\n" || character === "\r" || character === END_OF_TRANSMISSION) return finish();
        if (character === INTERRUPT) {
          stdin.setRawMode(false);
          stdout.write("\n已取消。\n");
          process.exit(130);
        }
        if (character === DELETE || character === "\b") value = value.slice(0, -1);
        // Anything below space is a control character, not part of a password.
        else if (character >= " ") value += character;
      }
    };

    stdin.on("data", onData);
  });
}

/** Non-interactive fallback so the script can be exercised by automation. */
async function readPipedLines() {
  let data = "";
  for await (const chunk of stdin) data += chunk;
  return data.split(/\r?\n/);
}

const normalizedEmail = email.trim().toLowerCase();
console.log(`建立平台管理者：${normalizedEmail}`);

let password;
let confirmation;
if (stdin.isTTY) {
  password = await askHidden("密碼：");
  confirmation = await askHidden("再輸入一次：");
} else {
  const [first, second] = await readPipedLines();
  password = first ?? "";
  confirmation = second || first || "";
}

if (password.length < 12) {
  fail("密碼至少需要 12 個字元。平台後台可以看到所有公司的資料，請用夠長的密碼。");
}
if (password !== confirmation) fail("兩次輸入的密碼不一致，沒有建立任何帳號。");

const client = new MongoClient(uri, {
  appName: "receipt-issuer-admin-bootstrap",
  serverApi: { deprecationErrors: true, strict: true, version: ServerApiVersion.v1 },
});

try {
  await client.connect();
  const database = client.db(process.env.MONGODB_DB || "receipt_issuer");
  const admins = database.collection("platformAdmins");
  const sessions = database.collection("platformAdminSessions");
  await Promise.all([
    admins.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ adminId: 1 }),
  ]);

  await admins.insertOne({
    createdAt: new Date(),
    email: normalizedEmail,
    name: name.trim(),
    passwordHash: await bcrypt.hash(password, 12),
    status: "active",
  });
  console.log(`✓ 已建立平台管理者 ${normalizedEmail}。請到 /admin/login 登入。`);
} catch (error) {
  if (error && error.code === 11000) fail(`${normalizedEmail} 已經是平台管理者了。`);
  fail(error instanceof Error ? error.message : "無法建立平台管理者。");
} finally {
  await client.close();
}
