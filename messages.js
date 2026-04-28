const socket = io();

const sender_id = Number(localStorage.getItem("userId"));

if (!sender_id) {
    alert("You must log in first");
    window.location.href = "login.html";
}

const urlParams = new URLSearchParams(window.location.search);

let receiver_id = Number(urlParams.get("receiver_id")) || null;
let listing_id = Number(urlParams.get("listing_id")) || null;
let course_code = urlParams.get("course") || null;
let book_title = urlParams.get("title") || null;

let room = null;

const conversationList = document.getElementById("conversation-list");
const messagesBox = document.getElementById("messages-box");
const input = document.getElementById("message-input");
const chatLabel = document.getElementById("chat-label");
const chatContext = document.getElementById("chat-context");

// =======================
// ROOM
// =======================
function createRoom(userA = sender_id, userB = receiver_id, listingId = listing_id) {
    if (!userA || !userB) return null;

    let base =
        userA < userB
            ? `room_${userA}_${userB}`
            : `room_${userB}_${userA}`;

    return listingId ? `${base}_listing_${listingId}` : `${base}_general`;
}

// =======================
// MESSAGE RENDER
// =======================
function renderMessage(msg) {
    const div = document.createElement("div");
    const isMe = Number(msg.sender_id) === sender_id;

    div.className = isMe ? "me" : "other";

    div.innerHTML = `
        <strong>${isMe ? "You" : (msg.sender_username || msg.sender_email || "User")}:</strong>
        ${msg.message}
        <small>${new Date(msg.timestamp).toLocaleString()}</small>
    `;

    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
}

// =======================
// LOAD MESSAGES
// =======================
async function loadMessages() {
    if (!receiver_id) return;

    let url = `/getMessages?sender_id=${sender_id}&receiver_id=${receiver_id}`;

    if (listing_id) {
        url += `&listing_id=${listing_id}`;
    }

    const res = await fetch(url);
    const messages = await res.json();

    messagesBox.innerHTML = "";

    if (messages.length === 0) {
        messagesBox.innerHTML = `
            <div class="empty-chat">
                Start the conversation about this textbook.
            </div>
        `;
    } else {
        messages.forEach(renderMessage);
    }
}

// =======================
// GET USER (FALLBACK)
// =======================
async function getReceiverUser(id) {
    try {
        const res = await fetch(`/getUser/${id}`);
        const data = await res.json();

        if (data.success && data.user) {
            return data.user;
        }
    } catch (err) {
        console.error("GET USER ERROR:", err);
    }

    return {
        id,
        username: `User ${id}`,
        email: "",
        avatar: "default-avatar.png"
    };
}

// =======================
// OPEN CONVERSATION
// =======================
async function openConversation(convo) {
    receiver_id = Number(convo.other_user_id);
    listing_id = convo.listing_id ? Number(convo.listing_id) : null;
    course_code = convo.course_code || null;
    book_title = convo.book_title || null;

    room = createRoom();
    socket.emit("joinRoom", room);

    const displayName =
        convo.other_user_username ||
        convo.other_user_email ||
        "Student";

    const avatar =
        convo.other_user_avatar ||
        "default-avatar.png";

    chatLabel.innerHTML = `
        <img src="${avatar}" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:8px;">
        ${displayName}
    `;

    chatContext.textContent =
        course_code && book_title
            ? `${course_code} • ${book_title}`
            : course_code || book_title || "General conversation";

    // ✅ SHOW CHAT UI
    document.getElementById("empty-state").style.display = "none";
    document.getElementById("messages-box").style.display = "block";
    document.getElementById("input-container").style.display = "flex";

    await loadMessages();
}

// =======================
// CONVERSATION RENDER
// =======================
function renderConversation(convo) {
    const div = document.createElement("div");
    div.className = "conversation-item";

    const name =
        convo.other_user_username ||
        convo.other_user_email ||
        "Student";

    const avatar =
        convo.other_user_avatar ||
        "default-avatar.png";

    div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <img src="${avatar}" style="width:38px;height:38px;border-radius:50%;">
            <div>
                <strong>${name}</strong>
                <div class="conversation-context">
                    ${convo.course_code || ""} ${convo.book_title ? "• " + convo.book_title : ""}
                </div>
                <div class="conversation-preview">
                    ${convo.last_message || "Start the conversation"}
                </div>
            </div>
        </div>
    `;

    div.addEventListener("click", async () => {
        document.querySelectorAll(".conversation-item").forEach(item => {
            item.classList.remove("active");
        });

        div.classList.add("active");

        if (!convo || !convo.other_user_id) {
            console.error("Invalid conversation object:", convo);
            return;
        }

        await openConversation(convo);
    });

    // ✅ FIX: actually add to DOM
    conversationList.appendChild(div);
    return div;
}

// =======================
// LOAD CONVERSATIONS
// =======================
async function loadConversations() {
    const res = await fetch(`/getConversations?user_id=${sender_id}`);
    const conversations = await res.json();

    conversationList.innerHTML = "";

    conversations.forEach(renderConversation);

    if (receiver_id) {
        const existing = conversations.find(convo =>
            Number(convo.other_user_id) === receiver_id &&
            Number(convo.listing_id || 0) === Number(listing_id || 0)
        );

        if (existing) {
            const items = document.querySelectorAll(".conversation-item");
            const index = conversations.indexOf(existing);
            items[index]?.classList.add("active");
            openConversation(existing);
        } else {
            const user = await getReceiverUser(receiver_id);

            const newConvo = {
                other_user_id: receiver_id,
                other_user_username: user.username,
                other_user_email: user.email,
                other_user_avatar: user.avatar,
                listing_id,
                course_code,
                book_title,
                last_message: "Start the conversation"
            };

            const div = renderConversation(newConvo);
            div.classList.add("active");
            openConversation(newConvo);
        }
    } else if (conversations.length === 0) {
        conversationList.innerHTML = "<p>No conversations yet.</p>";
    }
}

// =======================
// SEND MESSAGE
// =======================
function sendMessage() {
    const message = input.value.trim();

    if (!receiver_id) {
        alert("Select a conversation first.");
        return;
    }

    if (!message) return;

    if (!room) {
        room = createRoom();
        socket.emit("joinRoom", room);
    }

    socket.emit("sendMessage", {
        sender_id,
        receiver_id,
        message,
        room,
        listing_id,
        course_code,
        book_title
    });

    input.value = "";
}

// =======================
// SOCKET EVENTS
// =======================
socket.on("connect", () => {
    loadConversations();
});

socket.on("receiveMessage", (msg) => {
    const incomingRoom = createRoom(
        Number(msg.sender_id),
        Number(msg.receiver_id),
        msg.listing_id
    );

    if (incomingRoom === room) {
        const empty = document.querySelector(".empty-chat");
        if (empty) messagesBox.innerHTML = "";

        renderMessage(msg);
    }

    loadConversations();
});

// =======================
// ENTER KEY
// =======================
if (input) {
    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });
}