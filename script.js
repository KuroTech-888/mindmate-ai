const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");
const crisisAlert = document.getElementById("crisisAlert");

let conversationHistory = [];
const currentSessionId = "session_" + Math.random().toString(36).substr(2, 9);

function addMessage(sender, text) {
  const div = document.createElement("div");
  div.className = sender === "user" ? "flex gap-3 justify-end" : "flex gap-3";

  const bubbleStr =
    sender === "user"
      ? `<div class="bg-teal-500 text-white rounded-2xl rounded-tr-none px-4 py-2 shadow-sm max-w-[80%]">${text}</div>`
      : `<div class="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white text-sm shrink-0">🌱</div>
             <div class="bg-white/80 backdrop-blur-sm border border-sky-100 text-gray-700 rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">${text}</div>`;

  div.innerHTML = bubbleStr;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  addMessage("user", text);
  userInput.value = "";

  const userMsg = { role: "user", content: text };
  conversationHistory.push(userMsg);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversationHistory,
        sessionId: currentSessionId,
        userMessage: text,
      }),
    });

    const data = await response.json();
    addMessage("assistant", data.reply);
    conversationHistory.push({ role: "assistant", content: data.reply });

    if (
      data.assessment &&
      (data.assessment.requiresEmergency ||
        data.assessment.severity === "Severe")
    ) {
      crisisAlert.classList.remove("hidden");
    }
  } catch (err) {
    addMessage(
      "assistant",
      "ขออภัยครับ เหมือนสัญญาณการเชื่อมต่อจะมีปัญหาเล็กน้อย",
    );
  }
});
