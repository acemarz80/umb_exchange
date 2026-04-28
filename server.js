require("dotenv").config();

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const { Pool } = require("pg");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*"
    }
});

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
// CLOUDINARY / MULTER
// =======================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "umb-exchange",
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
    }
});

const upload = multer({ storage });

// =======================
// HEALTH CHECK
// =======================
app.get("/health", async (req, res) => {
    try {
        await db.query("SELECT 1");
        res.json({ success: true, message: "Server and database connected" });
    } catch (err) {
        console.error("HEALTH CHECK ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

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
// CREATE USER IF NOT EXISTS
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
        console.error("CREATE USER ERROR:", err);
        res.json({ success: false, error: err.message });
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
        console.error("2FA GENERATE ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// =======================
// VERIFY 2FA LOGIN
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

        if (!user.auth_secret) {
            return res.json({ success: false, message: "No 2FA setup" });
        }

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
            username: user.username || user.email,
            avatar: user.avatar || "default-avatar.png"
        });
    } catch (err) {
        console.error("VERIFY 2FA ERROR:", err);
        res.json({ success: false, error: err.message });
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
            [
                username || email,
                avatar || "default-avatar.png",
                email
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("SAVE PROFILE ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// =======================
// GET USER FOR MESSAGING
// =======================
app.get("/getUser/:id", async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, email, username, avatar FROM users WHERE id = $1",
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                ...user,
                username: user.username || user.email,
                avatar: user.avatar || "default-avatar.png"
            }
        });
    } catch (err) {
        console.error("GET USER ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// =======================
// GET USER BY ID PUBLIC PROFILE
// =======================
app.get("/getUserById", async (req, res) => {
    const { id } = req.query;

    try {
        const result = await db.query(
            "SELECT id, email, username, avatar FROM users WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.json({});
        }

        const user = result.rows[0];

        res.json({
            ...user,
            username: user.username || user.email,
            avatar: user.avatar || "default-avatar.png"
        });
    } catch (err) {
        console.error("GET USER BY ID ERROR:", err);
        res.json({});
    }
});

// =======================
// GET LISTINGS BY USER PUBLIC PROFILE
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
        console.error("GET LISTINGS BY USER ERROR:", err);
        res.json([]);
    }
});

// =======================
// CREATE LISTING
// =======================
app.post("/createListing", upload.single("image"), async (req, res) => {
    const {
        course_code,
        title,
        edition,
        price,
        book_condition,
        rating,
        description,
        seller_email,
        seller_id
    } = req.body;

    const image = req.file ? req.file.path : null;

    try {
        await db.query(
            `INSERT INTO listings
            (course_code, title, edition, price, book_condition, rating, description, seller_email, seller_id, image)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                course_code,
                title,
                edition || null,
                price,
                book_condition,
                rating || null,
                description || null,
                seller_email,
                seller_id,
                image
            ]
        );

        io.emit("newListing");

        res.json({ success: true });
    } catch (err) {
        console.error("CREATE LISTING ERROR:", err);
        res.json({ success: false, error: err.message });
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
            LEFT JOIN users ON listings.seller_id = users.id
        `;

        const params = [];

        if (course) {
            sql += " WHERE listings.course_code = $1";
            params.push(course);
        }

        sql += " ORDER BY listings.created_at DESC";

        const result = await db.query(sql, params);

        const cleaned = result.rows.map(item => ({
            ...item,
            username: item.username || item.seller_email,
            avatar: item.avatar || "default-avatar.png"
        }));

        res.json(cleaned);
    } catch (err) {
        console.error("GET LISTINGS ERROR:", err);
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
        console.error("MY LISTINGS ERROR:", err);
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
        console.error("DELETE LISTING ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// =======================
// GET MESSAGES (CHAT HISTORY)
// =======================
app.get("/getMessages", async (req, res) => {
    const { sender_id, receiver_id, listing_id } = req.query;

    try {
        let sql = `
            SELECT *
            FROM messages
            WHERE (
                (sender_id = $1 AND receiver_id = $2)
                OR
                (sender_id = $2 AND receiver_id = $1)
            )
        `;

        const params = [sender_id, receiver_id];

        if (listing_id) {
            sql += " AND listing_id = $3";
            params.push(listing_id);
        }

        sql += " ORDER BY timestamp ASC";

        const result = await db.query(sql, params);

        res.json(result.rows);
    } catch (err) {
        console.error("GET MESSAGES ERROR:", err);
        res.json([]);
    }
});

// =======================
// GET CONVERSATIONS (INBOX)
// =======================
app.get("/getConversations", async (req, res) => {
    const userId = req.query.user_id;

    try {
        const result = await db.query(
            `
            WITH user_messages AS (
                SELECT
                    m.*,
                    CASE
                        WHEN m.sender_id = $1 THEN m.receiver_id
                        ELSE m.sender_id
                    END AS other_user_id
                FROM messages m
                WHERE m.sender_id = $1 OR m.receiver_id = $1
            ),
            latest AS (
                SELECT DISTINCT ON (other_user_id, COALESCE(listing_id, 0))
                    other_user_id,
                    listing_id,
                    course_code,
                    book_title,
                    message AS last_message,
                    timestamp AS last_timestamp
                FROM user_messages
                ORDER BY other_user_id, COALESCE(listing_id, 0), timestamp DESC
            )
            SELECT
                latest.*,
                users.email AS other_user_email,
                users.username AS other_user_username,
                users.avatar AS other_user_avatar
            FROM latest
            JOIN users ON users.id = latest.other_user_id
            ORDER BY latest.last_timestamp DESC
            `,
            [userId]
        );

        const cleaned = result.rows.map(c => ({
            ...c,
            other_user_username: c.other_user_username || c.other_user_email,
            other_user_avatar: c.other_user_avatar || "default-avatar.png"
        }));

        res.json(cleaned);
    } catch (err) {
        console.error("GET CONVERSATIONS ERROR:", err);
        res.json([]);
    }
});
// =======================
// SOCKET.IO MESSAGING
// =======================
io.on("connection", (socket) => {
    console.log("SOCKET CONNECTED:", socket.id);

    // join chat room
    socket.on("joinRoom", (room) => {
        if (!room) return;
        socket.join(room);
    });

    // send message
    socket.on("sendMessage", async (data) => {
        const {
            sender_id,
            receiver_id,
            message,
            room,
            listing_id,
            course_code,
            book_title
        } = data;

        try {
            if (!sender_id || !receiver_id || !message) return;

            const result = await db.query(
                `INSERT INTO messages
                (sender_id, receiver_id, message, listing_id, course_code, book_title)
                VALUES ($1,$2,$3,$4,$5,$6)
                RETURNING *`,
                [
                    sender_id,
                    receiver_id,
                    message,
                    listing_id || null,
                    course_code || null,
                    book_title || null
                ]
            );

            if (room) {
                io.to(room).emit("receiveMessage", result.rows[0]);
            }

        } catch (err) {
            console.error("SOCKET MESSAGE ERROR:", err);
        }
    });

    socket.on("disconnect", () => {
        console.log("SOCKET DISCONNECTED:", socket.id);
    });
});

// =======================
// START SERVER
// =======================
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});