require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const path = require("path");
const { Pool } = require("pg");

const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// =======================
// DATABASE
// =======================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// =======================
// MIDDLEWARE
// =======================
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// MULTER
// =======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) =>
        cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// =======================
// ENSURE USER EXISTS
// =======================
async function ensureUser(email) {
    await db.query(
        "INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
        [email]
    );
}

// =======================
// CREATE USER
// =======================
app.post("/createUserIfNotExists", async (req, res) => {
    const { email } = req.body;

    try {
        await ensureUser(email);

        const result = await db.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        res.json({
            success: true,
            user_id: result.rows[0].id
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// =======================
// GENERATE 2FA QR
// =======================
app.post("/generate-2fa", async (req, res) => {
    const { email } = req.body;

    try {
        await ensureUser(email);

        const result = await db.query(
            "SELECT auth_secret FROM users WHERE email = $1",
            [email]
        );

        let secret;

        if (!result.rows[0]?.auth_secret) {
            secret = speakeasy.generateSecret({
                name: `UMB Exchange (${email})`
            });

            await db.query(
                "UPDATE users SET auth_secret = $1 WHERE email = $2",
                [secret.base32, email]
            );
        } else {
            secret = { base32: result.rows[0].auth_secret };
        }

        const otpauth = speakeasy.otpauthURL({
            secret: secret.base32,
            label: email,
            issuer: "UMB Exchange",
            encoding: "base32"
        });

        const qr = await QRCode.toDataURL(otpauth);

        res.json({ success: true, qr });

    } catch (err) {
        console.error("2FA ERROR:", err);
        res.json({ success: false });
    }
});

// =======================
// VERIFY 2FA
// =======================
app.post("/verify-2fa", async (req, res) => {
    const { email, token } = req.body;

    try {
        const result = await db.query(
            "SELECT id, auth_secret FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            console.log("❌ USER NOT FOUND:", email);
            return res.json({ success: false, message: "User not found" });
        }

        const user = result.rows[0];

        if (!user.auth_secret) {
            console.log("❌ NO AUTH SECRET FOR USER:", email);
            return res.json({ success: false, message: "No 2FA setup" });
        }

        // Clean token (IMPORTANT)
        const cleanToken = token ? token.replace(/\s/g, "") : "";

        // DEBUG LOGS
        console.log("====================================");
        console.log("EMAIL:", email);
        console.log("TOKEN RAW:", token);
        console.log("TOKEN CLEAN:", cleanToken);
        console.log("TOKEN LENGTH:", cleanToken.length);
        console.log("DB SECRET EXISTS:", !!user.auth_secret);
        console.log("====================================");

        const verified = speakeasy.totp.verify({
            secret: user.auth_secret,
            encoding: "base32",
            token: cleanToken,
            window: 2
        });

        console.log("VERIFICATION RESULT:", verified);

        if (!verified) {
            return res.json({ success: false, message: "Invalid code" });
        }

        console.log("✅ 2FA SUCCESS:", email);

        return res.json({
            success: true,
            user_id: user.id,
            email
        });

    } catch (err) {
        console.error("❌ 2FA VERIFY ERROR:", err);
        return res.json({ success: false });
    }
});
// =======================
// LISTINGS (UNCHANGED)
// =======================
app.post("/createListing", upload.single("image"), async (req, res) => {
    const {
        course_code, title, edition, price,
        book_condition, rating, description,
        seller_email, seller_id
    } = req.body;

    const image = req.file ? req.file.filename : null;

    try {
        await db.query(
            `INSERT INTO listings
            (course_code, title, edition, price, book_condition, rating, description, seller_email, seller_id, image)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                course_code, title, edition || null, price,
                book_condition, rating || null, description || null,
                seller_email, seller_id, image
            ]
        );

        io.emit("newListing");
        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// =======================
// START SERVER
// =======================
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});