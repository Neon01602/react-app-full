require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
const multer = require("multer");
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("Set JWT_SECRET in backend/.env to a random value of at least 32 characters.");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 10, queueLimit: 0, enableKeepAlive: true
});
const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
const bucket = process.env.S3_BUCKET;
const imageTypes = {
  "image/jpeg": { ext: "jpg", contentType: "image/jpeg" },
  "image/png": { ext: "png", contentType: "image/png" },
  "image/webp": { ext: "webp", contentType: "image/webp" }
};
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = Boolean(imageTypes[file.mimetype]);
    cb(ok ? null : new Error("Only JPG, PNG, and WEBP images are allowed."), ok);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const cookieOptions = { httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" };
function createToken(user) { return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" }); }
function authRequired(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ message: "Please log in." });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch {
    res.clearCookie("session", { ...cookieOptions, maxAge: undefined });
    return res.status(401).json({ message: "Session expired. Please log in again." });
  }
}

async function saveProfileImage(userId, file) {
  if (!file) return null;
  if (!bucket) throw new Error("S3 storage is not configured. Set S3_BUCKET before uploading a profile picture.");
  const type = imageTypes[file.mimetype];
  if (!type) throw new Error("Only JPG, PNG, and WEBP images are allowed.");
  const key = "profile-images/" + userId + "/" + Date.now() + "-" + require("crypto").randomUUID() + "." + type.ext;
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: file.buffer, ContentType: type.contentType
  }));
  return key;
}

async function profileFor(userId) {
  const [rows] = await pool.execute("SELECT id, name, email, phone, bio, profile_image_key, created_at FROM users WHERE id = ?", [userId]);
  if (!rows.length) return null;
  const u = rows[0];
  const imageUrl = u.profile_image_key && bucket
    ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: u.profile_image_key }), { expiresIn: 900 })
    : null;
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, bio: u.bio,
    created_at: u.created_at, profile_image_url: imageUrl
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", storage: bucket ? "configured" : "not_configured" });
  } catch (e) {
    console.error("Database health check failed:", e.message);
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

// CREATE: multipart registration optionally includes an "avatar" file.
// The S3 object key is saved in RDS; the private bucket is never made public.
app.post("/api/register", (req, res) => {
  upload.single("avatar")(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ message: uploadError.message || "Invalid image upload." });
    let createdUserId = null;
    let uploadedKey = null;
    try {
      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Name must be between 2 and 80 characters." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ message: "Enter a valid email address." });
      if (password.length < 8 || password.length > 72) return res.status(400).json({ message: "Password must be at least 8 characters." });
      if (req.file && !bucket) return res.status(503).json({ message: "Profile photo uploads require S3. Configure S3_BUCKET and the EC2 IAM role first." });
      const [existing] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
      if (existing.length) return res.status(409).json({ message: "An account with this email already exists." });
      const hash = await bcrypt.hash(password, 12);
      const [result] = await pool.execute(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name, email, hash]
      );
      createdUserId = result.insertId;
      if (req.file) {
        uploadedKey = await saveProfileImage(createdUserId, req.file);
        await pool.execute("UPDATE users SET profile_image_key = ? WHERE id = ?", [uploadedKey, createdUserId]);
      }
      const user = { id: createdUserId, name, email };
      res.cookie("session", createToken(user), cookieOptions);
      res.status(201).json({ message: "Account created successfully.", user: await profileFor(createdUserId) });
    } catch (e) {
      if (uploadedKey && bucket) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: uploadedKey })).catch(() => {});
      if (createdUserId) await pool.execute("DELETE FROM users WHERE id = ?", [createdUserId]).catch(() => {});
      if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "An account with this email already exists." });
      console.error("Registration error:", e);
      res.status(500).json({ message: e.message && e.message.startsWith("S3 storage") ? e.message : "Could not create account. Please try again." });
    }
  });
});

// CREATE SESSION
app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase(), password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
    const [rows] = await pool.execute("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ message: "Invalid email or password." });
    const u = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    res.cookie("session", createToken(u), cookieOptions);
    res.json({ message: "Logged in successfully.", user: await profileFor(u.id) });
  } catch (e) { console.error("Login error:", e); res.status(500).json({ message: "Server error. Please try again." }); }
});

// READ: profile ID comes only from the verified session.
app.get("/api/me", authRequired, async (req, res) => {
  try {
    const user = await profileFor(req.user.id);
    if (!user) return res.status(404).json({ message: "Account not found." });
    res.json({ user });
  } catch (e) { console.error("Profile error:", e); res.status(500).json({ message: "Could not load profile." }); }
});

// UPDATE: only the signed-in user's own profile can be changed.
app.put("/api/me", authRequired, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim(), email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim(), bio = String(req.body.bio || "").trim();
    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Name must be between 2 and 80 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ message: "Enter a valid email address." });
    if (phone.length > 25) return res.status(400).json({ message: "Phone number is too long." });
    if (bio.length > 500) return res.status(400).json({ message: "Bio must be 500 characters or fewer." });
    await pool.execute("UPDATE users SET name = ?, email = ?, phone = ?, bio = ? WHERE id = ?", [name, email, phone || null, bio || null, req.user.id]);
    const user = await profileFor(req.user.id);
    if (!user) return res.status(404).json({ message: "Account not found." });
    res.json({ message: "Profile updated successfully.", user });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "That email address is already in use." });
    console.error("Profile update error:", e);
    res.status(500).json({ message: "Could not update profile." });
  }
});

// Upload/replace profile image in private S3; store only the stable object key in RDS.
app.post("/api/me/avatar", authRequired, (req, res) => {
  if (!bucket) return res.status(503).json({ message: "S3 storage is not configured yet." });
  upload.single("avatar")(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ message: uploadError.message || "Invalid image upload." });
    if (!req.file) return res.status(400).json({ message: "Choose an image first." });
    let newKey = null;
    try {
      const [rows] = await pool.execute("SELECT profile_image_key FROM users WHERE id = ?", [req.user.id]);
      if (!rows.length) return res.status(404).json({ message: "Account not found." });
      newKey = await saveProfileImage(req.user.id, req.file);
      await pool.execute("UPDATE users SET profile_image_key = ? WHERE id = ?", [newKey, req.user.id]);
      if (rows[0].profile_image_key) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: rows[0].profile_image_key })).catch(e => console.error("Old avatar cleanup failed:", e.message));
      }
      res.json({ message: "Profile picture uploaded.", user: await profileFor(req.user.id) });
    } catch (e) {
      if (newKey) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: newKey })).catch(() => {});
      console.error("S3 upload error:", e);
      res.status(500).json({ message: "Could not upload profile picture." });
    }
  });
});

// DELETE: only the logged-in user's account and associated image.
app.delete("/api/me", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT profile_image_key FROM users WHERE id = ?", [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: "Account not found." });
    await pool.execute("DELETE FROM users WHERE id = ?", [req.user.id]);
    if (bucket && rows[0].profile_image_key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: rows[0].profile_image_key })).catch(e => console.error("S3 cleanup failed:", e.message));
    }
    res.clearCookie("session", { ...cookieOptions, maxAge: undefined });
    res.json({ message: "Your account has been deleted." });
  } catch (e) {
    console.error("Account deletion error:", e);
    res.status(500).json({ message: "Could not delete account." });
  }
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie("session", { ...cookieOptions, maxAge: undefined });
  res.json({ message: "Logged out successfully." });
});

// Luma Mail API: authenticated mailbox and SES sending routes.
require("./mail")(app, { pool, authRequired });

const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(frontendDist, "index.html"), e => {
    if (e) res.status(404).send("Frontend build not found. Run npm run build from the project root.");
  });
});
app.use((e, _req, res, _next) => {
  console.error("Unhandled request error:", e);
  res.status(500).json({ message: "Unexpected server error." });
});
app.listen(PORT, () => console.log("Backend running on http://localhost:" + PORT));
