require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const path = require("path");
const { Resend } = require("resend");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// =======================
// DATABASE (POSTGRES - RENDER)
// =======================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// =======================
// RESEND EMAIL
// =======================
const resend = new Resend(process.env.RESEND_API_KEY);

// =======================
// MIDDLEWARE
// =======================
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// MULTER CONFIG
// =======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) =>
        cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// =======================
// TEMP STORAGE
// =======================
const verificationCodes = {};
const loginAttempts = {};
const verifyAttempts = {};

// =======================
// LOGIN (SEND CODE)
// =======================
app.post("/login", async (req, res) => {
    const email = req.body.email.trim().toLowerCase();

    if (loginAttempts[email]?.lastRequest) {
        const diff = Date.now() - loginAttempts[email].lastRequest;
        if (diff < 30000) {
            return res.json({ success: false, message: "Please wait before requesting another code." });
        }
    }

    loginAttempts[email] = { lastRequest: Date.now() };

    if (!email.endsWith("@umb.edu")) {
        return res.json({ success: false, message: "Only UMB emails allowed" });
    }

    const code = Math.floor(100000 + Math.random() * 900000);
    verificationCodes[email] = code;

    setTimeout(() => {
        delete verificationCodes[email];
        delete loginAttempts[email];
        delete verifyAttempts[email];
    }, 10 * 60 * 1000);

    try {
        await resend.emails.send({
            from: "UMB Exchange <onboarding@resend.dev>",
            to: email,
            subject: "Your UMB Exchange Verification Code",
            html: `<h2>Your code: ${code}</h2>`,
            text: `Your verification code is: ${code}`
        });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// =======================
// VERIFY CODE (POSTGRES FIXED)
// =======================
app.post("/verify-code", async (req, res) => {
    const email = req.body.email.trim().toLowerCase();
    const code = req.body.code;

    verifyAttempts[email] = (verifyAttempts[email] || 0) + 1;
    if (verifyAttempts[email] > 5) {
        return res.json({ success: false, message: "Too many attempts" });
    }

    if (!verificationCodes[email]) {
        return res.json({ success: false, message: "Code expired or not found" });
    }

    if (verificationCodes[email] != code) {
        return res.json({ success: false, message: "Invalid code" });
    }

    delete verificationCodes[email];
    delete verifyAttempts[email];

    try {
        await db.query(
            "INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
            [email]
        );

        const result = await db.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false });
        }

        res.json({
            success: true,
            user_id: result.rows[0].id,
            email
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
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

    const image = req.file ? req.file.filename : null;

    if (!seller_email || !seller_id) {
        return res.json({ success: false });
    }

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
        let sql = "SELECT * FROM listings";
        let params = [];

        if (course) {
            sql += " WHERE course_code = $1";
            params.push(course);
        }

        sql += " ORDER BY created_at DESC";

        const result = await db.query(sql, params);
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
        await db.query(
            "DELETE FROM listings WHERE id = $1 AND seller_email = $2",
            [id, seller_email]
        );

        io.emit("newListing");
        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// =======================
// SOCKET.IO
// =======================
io.on("connection", (socket) => {
    socket.on("joinRoom", (room) => socket.join(room));

    socket.on("sendMessage", async (data) => {
        try {
            await db.query(
                `INSERT INTO messages 
                (sender_id, receiver_id, message, listing_id, course_code, book_title)
                VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    data.sender_id,
                    data.receiver_id,
                    data.message,
                    data.listing_id || null,
                    data.course_code || null,
                    data.book_title || null
                ]
            );

            io.to(data.room).emit("receiveMessage", {
                ...data,
                timestamp: new Date().toISOString()
            });

        } catch (err) {
            console.error(err);
        }
    });
});

// =======================
// START SERVER
// =======================
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
