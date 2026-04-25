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

// =======================
// MULTER
// =======================
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "umb-exchange",
        allowed_formats: ["jpg", "png", "jpeg"]
    }
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
            "SELECT id, email, auth_secret, username, avatar FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, message: "User not found" });
        }

        const user = result.rows[0];

        const cleanToken = token ? token.replace(/\s/g, "") : "";

        const verified = speakeasy.totp.verify({
            secret: user.auth_secret,
            encoding: "base32",
            token: cleanToken,
            window: 2
        });

        if (!verified) {
            return res.json({ success: false, message: "Invalid code" });
        }

        res.json({
            success: true,
            email: user.email,
            user_id: user.id,
            username: user.username,
            avatar: user.avatar
        });

    } catch (err) {
        console.error(err);
        return res.json({ success: false });
    }
});

// =======================
// SAVE PROFILE SETUP
// =======================
app.post("/saveProfileSetup", async (req, res) => {
    const { email, username, avatar } = req.body;

    try {
        await db.query(
            "UPDATE users SET username = $1, avatar = $2 WHERE email = $3",
            [username, avatar, email]
        );

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// =======================
// 🔥 NEW: GET USER BY ID (PUBLIC PROFILE)
// =======================
app.get("/getUserById", async (req, res) => {
    const { id } = req.query;

    try {
        const result = await db.query(
            "SELECT id, email, username, avatar FROM users WHERE id = $1",
            [id]
        );

        res.json(result.rows[0] || {});

    } catch (err) {
        console.error(err);
        res.json({});
    }
});

// =======================
// 🔥 NEW: GET LISTINGS BY USER (PUBLIC PROFILE)
// =======================
app.get("/getListingsByUser", async (req, res) => {
    const { user_id } = req.query;

    try {
        const result = await db.query(
            "SELECT * FROM listings WHERE seller_id = $1 ORDER BY created_at DESC",
            [user_id]
        );

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// =======================
// CREATE LISTING
// =======================
app.post("/createListing", upload.single("image"), async (req, res) => {
    const {
        course_code, title, edition, price,
        book_condition, rating, description,
        seller_email, seller_id
    } = req.body;

    const image = req.file ? req.file.path : null;

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
// GET LISTINGS
// =======================
app.get("/getListings", async (req, res) => {
    const course = req.query.course;

    try {
        let sql = `
            SELECT 
                listings.*,
                users.username,
                users.avatar
            FROM listings
            JOIN users ON listings.seller_id = users.id
        `;

        let params = [];

        if (course) {
            sql += " WHERE listings.course_code = $1";
            params.push(course);
        }

        sql += " ORDER BY listings.created_at DESC";

        const result = await db.query(sql, params);

        res.json(result.rows);

    } catch (err) {
        console.error("❌ GET LISTINGS ERROR:", err);
        res.json([]);
    }
});

// =======================
// MY LISTINGS
// =======================
app.get("/myListings", async (req, res) => {
    const userId = req.query.user_id;

    try {
        const result = await db.query(
            "SELECT * FROM listings WHERE seller_id = $1 ORDER BY created_at DESC",
            [userId]
        );

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// =======================
// DELETE LISTING
// =======================
app.post("/deleteListing", async (req, res) => {
    const { id, seller_email } = req.body;

    try {
        const result = await db.query(
            "DELETE FROM listings WHERE id = $1 AND seller_email = $2 RETURNING *",
            [id, seller_email]
        );

        if (result.rowCount === 0) {
            return res.json({ success: false });
        }

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