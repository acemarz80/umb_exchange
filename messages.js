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

function createRoom(userA = sender_id, userB = receiver_id, listingId = listing_id) {
    if (!userA || !userB) return null;

    let base =
        userA < userB
            ? `room_${userA}_${userB}`
            : `room_${userB}_${userA}`;

    return listingId ? `${base}_listing_${listingId}` : `${base}_general`;
}

function renderMessage(msg) {
    const div = document.createElement("div");
    const isMe = Number(msg.sender_id) === sender_id;

    div.className = isMe ? "me" : "other";

    div.innerHTML = `
        <strong>${isMe ? "You" : "Them"}:</strong> ${msg.message}
        <small>${new Date(msg.timestamp).toLocaleString()}</small>
    `;

    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
}

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

async function getReceiverEmail(id) {
    try {
        const res = await fetch(`/getUser/${id}`);
        const data = await res.json();

        if (data.success && data.user.email) {
            return data.user.email;
        }
    } catch (err) {
        console.error("GET USER ERROR:", err);
    }

    return `User ${id}`;
}

async function openConversation(convo) {
    receiver_id = Number(convo.other_user_id);
    listing_id = convo.listing_id ? Number(convo.listing_id) : null;
    course_code = convo.course_code || null;
    book_title = convo.book_title || null;

    room = createRoom();

    socket.emit("joinRoom", room);

    chatLabel.textContent = `Chat with ${convo.other_user_email || "Student"}`;
    chatContext.textContent =
        course_code && book_title
            ? `${course_code} • ${book_title}`
            : course_code || book_title || "General conversation";

    await loadMessages();
}

function renderConversation(convo) {
    const div = document.createElement("div");
    div.className = "conversation-item";

    div.innerHTML = `
        <strong>${convo.other_user_email || "Student"}</strong>
        <div class="conversation-context">
            ${convo.course_code || ""} ${convo.book_title ? "• " + convo.book_title : ""}
        </div>
        <div class="conversation-preview">
            ${convo.last_message || "Start the conversation"}
        </div>
    `;

    div.addEventListener("click", () => {
        document.querySelectorAll(".conversation-item").forEach(item => {
            item.classList.remove("active");
        });

        div.classList.add("active");
        openConversation(convo);
    });

    conversationList.appendChild(div);

    return div;
}

async function loadConversations() {
    const res = await fetch(`/getConversations?user_id=${sender_id}`);
    const conversations = await res.json();

    conversationList.innerHTML = "";

    conversations.forEach(renderConversation);

    // If user came from Contact Student button
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
            const receiverEmail = await getReceiverEmail(receiver_id);

            const newConvo = {
                other_user_id: receiver_id,
                other_user_email: receiverEmail,
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

input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});