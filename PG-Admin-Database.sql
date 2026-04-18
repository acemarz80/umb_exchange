-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE users ADD COLUMN auth_secret TEXT;

-- =========================
-- LISTINGS
-- =========================
CREATE TABLE listings (
    id SERIAL PRIMARY KEY,
    course_code TEXT NOT NULL,
    title TEXT NOT NULL,
    edition TEXT,
    price NUMERIC(10,2) NOT NULL,
    book_condition TEXT NOT NULL,
    rating INT,
    description TEXT,
    seller_email TEXT NOT NULL,
    seller_id INT,
    image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),

    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =========================
-- MESSAGES
-- =========================
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    message TEXT NOT NULL,
    listing_id INT,
    course_code TEXT,
    book_title TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
);

-- =========================
-- TEST USERS
-- =========================
INSERT INTO users (username, email) VALUES
('student1', 'student1@umb.edu'),
('student2', 'student2@umb.edu'),
('student3', 'student3@umb.edu');

-- =========================
-- TEST LISTINGS
-- =========================
INSERT INTO listings
(course_code, title, edition, price, book_condition, rating, description, seller_email, seller_id)
VALUES
('CS105', 'Computer Concepts Textbook', '5th Edition', 35.00, 'Like New', 4, 'Clean copy with minimal highlighting.', 'student1@umb.edu', 1),
('CS105', 'Intro to Computing Workbook', '2nd Edition', 20.00, 'Used', 3, 'Some wear but still usable.', 'student2@umb.edu', 2),
('IT240', 'Web Fluency Textbook', '3rd Edition', 40.00, 'Good', 5, 'Very helpful for the class.', 'student3@umb.edu', 3),
('IT285L', 'Ethics in Computing', '1st Edition', 25.00, 'Used', 4, 'Good condition overall.', 'student1@umb.edu', 1);

-- =========================
-- TEST MESSAGES
-- =========================
INSERT INTO messages
(sender_id, receiver_id, message, listing_id, course_code, book_title)
VALUES
(2, 1, 'Hey, is this CS105 book still available?', 1, 'CS105', 'Computer Concepts Textbook'),
(1, 2, 'Yes, it is still available.', 1, 'CS105', 'Computer Concepts Textbook'),
(3, 1, 'Would you take $20 for Ethics in Computing?', 4, 'IT285L', 'Ethics in Computing'),
(1, 3, 'I can do $22.', 4, 'IT285L', 'Ethics in Computing');

SELECT * FROM users;
SELECT * FROM listings;
SELECT * FROM messages;