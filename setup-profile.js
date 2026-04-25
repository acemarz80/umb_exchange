let selectedAvatar = "avatar1.png";

function selectAvatar(img) {
    document.querySelectorAll(".avatar-option").forEach(a => a.classList.remove("selected"));
    img.classList.add("selected");
    selectedAvatar = img.dataset.avatar;
}

async function saveProfile() {
    const usernameInput = document.getElementById("username").value.trim();
    const email = localStorage.getItem("userEmail");

    const finalUsername = usernameInput || email;

    const res = await fetch("/saveProfileSetup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: email,
            username: finalUsername,
            avatar: selectedAvatar
        })
    });

    const data = await res.json();

    if (data.success) {
        localStorage.setItem("username", finalUsername);
        localStorage.setItem("avatar", selectedAvatar);
        window.location.href = "mainpage.html";
    }
}