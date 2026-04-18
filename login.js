let emailGlobal = "";

// =======================
// EMAIL SUBMIT
// =======================
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();

    if (!email.endsWith("@umb.edu")) {
        document.getElementById("message").innerText = "Only UMB students can login.";
        return;
    }

    emailGlobal = email;

    await fetch("/createUserIfNotExists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
    });

    const res = await fetch("/generate-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (data.success) {
        showQR(data.qr);
    } else {
        document.getElementById("message").innerText = "QR error.";
    }
});

// =======================
// SHOW QR
// =======================
function showQR(qr) {
    document.getElementById("loginForm").style.display = "none";

    const div = document.createElement("div");
    div.id = "authSection";

    div.innerHTML = `
        <p>Scan with Microsoft Authenticator</p>
        <img src="${qr}" width="200">

        <input id="token" type="text" placeholder="6-digit code">

        <button onclick="verifyToken()">Verify</button>

        <p id="message"></p>
    `;

    document.querySelector(".login-container").appendChild(div);

    setTimeout(() => {
        document.getElementById("token").focus();
    }, 100);
}

// =======================
// VERIFY
// =======================
async function verifyToken() {
    const input = document.getElementById("token");
    const token = input ? input.value.trim() : "";

    console.log("TOKEN:", token);

    if (!token) {
        document.getElementById("message").innerText =
            "Please enter the code from Microsoft Authenticator.";
        return;
    }

    const res = await fetch("/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailGlobal, token })
    });

    const data = await res.json();

    if (data.success) {
        localStorage.setItem("userEmail", data.email);
        localStorage.setItem("userId", data.user_id);
        window.location.href = "mainpage.html";
    } else {
        document.getElementById("message").innerText = data.message;
    }
}