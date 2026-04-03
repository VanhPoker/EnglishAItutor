(function () {
  "use strict";

  const MODE_DESCRIPTIONS = {
    conversation:
      "Practice natural English conversation. Type anything and get friendly corrections and tips!",
    grammar:
      "Paste or type any English text and get detailed grammar corrections with explanations.",
    vocabulary:
      "Enter a word to learn its meaning, usage, and synonyms — or ask about any vocabulary topic.",
  };

  const WELCOME_MESSAGES = {
    conversation:
      "👋 Hello! I'm your English AI Tutor. Let's practice conversation — just say anything!",
    grammar:
      "✏️ Grammar Check mode. Paste your text below and I'll correct it with detailed explanations.",
    vocabulary:
      "📚 Vocabulary mode. Enter any word or phrase and I'll help you learn it thoroughly!",
  };

  let currentMode = "conversation";

  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const clearBtn = document.getElementById("clear-btn");
  const modeDescription = document.getElementById("mode-description");
  const tabs = document.querySelectorAll(".tab");

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      if (mode === currentMode) return;

      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      currentMode = mode;
      modeDescription.textContent = MODE_DESCRIPTIONS[mode];
      clearChat(false);
      appendMessage("assistant", WELCOME_MESSAGES[mode]);
    });
  });

  // Send on button click
  sendBtn.addEventListener("click", sendMessage);

  // Send on Enter (Shift+Enter for newline)
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Clear button
  clearBtn.addEventListener("click", () => {
    clearChat(true);
    appendMessage("assistant", WELCOME_MESSAGES[currentMode]);
  });

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    userInput.value = "";
    sendBtn.disabled = true;

    const typingEl = appendTypingIndicator();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode: currentMode }),
      });
      const data = await res.json();
      typingEl.remove();

      if (data.error) {
        appendMessage("assistant", "⚠️ Error: " + data.error);
      } else {
        appendMessage("assistant", data.response);
      }
    } catch {
      typingEl.remove();
      appendMessage("assistant", "⚠️ Network error. Please try again.");
    } finally {
      sendBtn.disabled = false;
      userInput.focus();
    }
  }

  function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = formatText(text);

    msgDiv.appendChild(bubble);
    chatMessages.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
  }

  function appendTypingIndicator() {
    const msgDiv = document.createElement("div");
    msgDiv.className = "message assistant typing-indicator";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML =
      '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';

    msgDiv.appendChild(bubble);
    chatMessages.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
  }

  function clearChat(callServer) {
    chatMessages.innerHTML = "";
    if (callServer) {
      fetch("/api/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: currentMode }),
      }).catch(() => {});
    }
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Format text: apply basic markdown before HTML-escaping free text,
  // then render only the safe tags we inserted.
  function formatText(text) {
    // Escape a plain string segment (no HTML allowed)
    function esc(s) {
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    // Split on **bold** and *italic* patterns, escape plain segments,
    // wrap matched groups in safe tags.
    let result = "";
    const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/gs;
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      result += esc(text.slice(last, match.index));
      if (match[1] !== undefined) {
        result += "<strong>" + esc(match[1]) + "</strong>";
      } else {
        result += "<em>" + esc(match[2]) + "</em>";
      }
      last = pattern.lastIndex;
    }
    result += esc(text.slice(last));

    return result.replace(/\n/g, "<br>");
  }
})();
