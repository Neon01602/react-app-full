require("dotenv").config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const mysql = require("mysql2/promise");
const { simpleParser } = require("mailparser");

const region = process.env.AWS_REGION || "eu-north-1";
const queueUrl = process.env.MAIL_INBOUND_QUEUE_URL;
const bucket = process.env.MAIL_INBOUND_BUCKET;
if (!queueUrl || !bucket) throw new Error("Set MAIL_INBOUND_QUEUE_URL and MAIL_INBOUND_BUCKET.");

const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 3
});

async function bodyToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function handleS3Record(record) {
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const raw = await s3.send(new GetObjectCommand({ Bucket: record.s3.bucket.name, Key: key }));
  const mail = await simpleParser(await bodyToBuffer(raw.Body));
  const recipients = (mail.to?.value || []).map(x => String(x.address || "").toLowerCase());
  if (!recipients.length) return;
  const placeholders = recipients.map(() => "?").join(",");
  const [users] = await pool.execute(
    `SELECT id,luma_email FROM users WHERE LOWER(luma_email) IN (${placeholders})`, recipients
  );
  for (const user of users) {
    await pool.execute(
      "INSERT INTO mail_messages (user_id,direction,folder,from_address,to_json,cc_json,subject,text_body,html_body,raw_s3_key,status,received_at) VALUES (?,'inbound','inbox',?,?,?,?,?,?,?,'received',NOW())",
      [user.id, String(mail.from?.value?.[0]?.address || "unknown").toLowerCase(),
       JSON.stringify(recipients), JSON.stringify((mail.cc?.value || []).map(x => x.address)),
       String(mail.subject || "").slice(0,998), mail.text || null,
       typeof mail.html === "string" ? mail.html : null, key]
    );
  }
}

async function processMessage(message) {
  const event = JSON.parse(message.Body);
  if (event.Event === "s3:TestEvent") return;
  for (const record of event.Records || []) {
    if (record.eventSource === "aws:s3") await handleS3Record(record);
  }
}
async function main() {
  console.log("Luma inbound mail worker started.");
  while (true) {
    const batch = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl, MaxNumberOfMessages: 5, WaitTimeSeconds: 20, VisibilityTimeout: 120
    }));
    for (const message of batch.Messages || []) {
      try {
        await processMessage(message);
        await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
      } catch (e) { console.error("Inbound message failed; SQS will retry:", e); }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
