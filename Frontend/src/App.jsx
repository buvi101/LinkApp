import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import "./App.css";

const SERVER_URL = "http://localhost:3000";


function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [notifications, setNotifications] = useState({}); // unread counts

  // Play notification sound
  const playNotification = () => {
    const audio = new Audio("/notify.mp3");
    audio.play().catch(() => {});
  };

  // Load chats for selected user
  useEffect(() => {
    if (selectedUser) {
      const savedChats = localStorage.getItem(`chat_${user}_${selectedUser}`);
      if (savedChats) {
        setChat(JSON.parse(savedChats));
      } else {
        setChat([]);
      }
    }
  }, [selectedUser, user]);

  // Socket connection
  useEffect(() => {
    if (token) {
      const s = io(SERVER_URL, { auth: { token } });

      s.on("online_users", (users) => {
        setOnlineUsers(users.filter((u) => u !== user));
      });

      s.on("receive_private_message", (msg) => {
        const key = `chat_${user}_${msg.from}`;
        const saved = JSON.parse(localStorage.getItem(key) || "[]");
        const updated = [...saved, msg];
        localStorage.setItem(key, JSON.stringify(updated));

        if (msg.from === selectedUser) {
          setChat(updated);
        } else {
          setNotifications((prev) => ({
            ...prev,
            [msg.from]: (prev[msg.from] || 0) + 1,
          }));
          playNotification();
        }
      });

      setSocket(s);
      return () => s.disconnect();
    }
  }, [token, user, selectedUser]);

  // Signup
  const signup = async () => {
    if (!form.username || !form.email || !form.password)
      return alert("Please fill all fields");
    try {
      await axios.post(`${SERVER_URL}/signup`, form);
      alert("Signup successful! Please login.");
      setIsLogin(true);
    } catch (err) {
      alert(err.response?.data?.message || "Signup failed");
    }
  };

  // Login
  const login = async () => {
    try {
      const res = await axios.post(`${SERVER_URL}/login`, {
        email: form.email,
        password: form.password,
      });
      localStorage.setItem("token", res.data.token);
      setToken(res.data.token);
      setUser(res.data.username);
    } catch (err) {
      alert(err.response?.data?.message || "Login failed");
    }
  };

  // Logout
  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setChat([]);
    setOnlineUsers([]);
    setNotifications({});
  };

  // Send message
  const sendPrivateMessage = () => {
    if (!selectedUser) return alert("Select a user to chat with!");
    if (message.trim() === "") return;

    const msgObj = { from: user, text: message };
    socket.emit("send_private_message", { to: selectedUser, text: message });

    const key = `chat_${user}_${selectedUser}`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    const updated = [...saved, msgObj];
    localStorage.setItem(key, JSON.stringify(updated));
    setChat(updated);
    setMessage("");
  };

  // Select user → load chat + clear notifications
  const selectUser = (u) => {
    setSelectedUser(u);
    const key = `chat_${user}_${u}`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    setChat(saved);
    setNotifications((prev) => {
      const updated = { ...prev };
      delete updated[u];
      return updated;
    });
  };

  // ===== Login / Signup UI =====
  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h2>{isLogin ? "Login" : "Signup"}</h2>

          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button onClick={isLogin ? login : signup}>
            {isLogin ? "Login" : "Signup"}
          </button>

          <p onClick={() => setIsLogin(!isLogin)} className="toggle-link">
            {isLogin
              ? "Don't have an account? Signup"
              : "Already have an account? Login"}
          </p>
        </div>
      </div>
    );
  }

  // ===== Chat UI =====
  return (
    <div className={`chat-container ${selectedUser ? "mobile-chat" : ""}`}>
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>LinkApp</h1>
          <button onClick={logout}>Logout</button>
        </div>
        <input className="search" placeholder="Search or start new chat" />
        <div className="Online-users-container">
          <div className="Online-indicator"></div>
          <p>Online users</p>
        </div>
        <div className="user-list">
          {onlineUsers.map((u) => (
            <div
              key={u}
              className={`user-item ${
                selectedUser === u ? "active-user" : ""
              }`}
              onClick={() => selectUser(u)}
            >
              <span>{u}</span>
              {notifications[u] && (
                <span className="notif-badge">{notifications[u]}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className="chat-window">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div className="chat-header-left">
                <button className="back-btn" onClick={() => setSelectedUser("")}>
                  ←
                </button>
                <div className="user-info">
                  <h3>{selectedUser}</h3>
                  <p className="user-status">Online</p>
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={() => {
                  if (selectedUser) {
                    localStorage.removeItem(`chat_${user}_${selectedUser}`);
                    setChat([]);
                    setNotifications((prev) => {
                      const updated = { ...prev };
                      delete updated[selectedUser];
                      return updated;
                    });
                    alert(`Chat with ${selectedUser} deleted!`);
                  }
                }}
              >
                Delete
              </button>
            </div>

            <div className="chat-body">
              {chat.map((msg, i) => (
                <div
                  key={i}
                  className={`chat-message ${
                    msg.from === user ? "sent" : "received"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            <div className="chat-input">
              <input
                type="text"
                placeholder="Type a message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button onClick={sendPrivateMessage}>Send</button>
            </div>
          </>
        ) : (
          <div className="no-chat">Select a user to start chatting</div>
        )}
      </div>
    </div>
  );
}

export default App;
