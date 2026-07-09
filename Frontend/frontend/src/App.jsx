import { useState } from "react";
import ChatWindow from "./components/ChatWindow";
import LoginScreen from "./components/LoginScreen";
import DocumentUpload from "./components/DocumentUpload";

export default function App() {
  const [user, setUser] = useState(() => {
    const username = localStorage.getItem("learnmate_username");
    const token = localStorage.getItem("learnmate_token");
    const role = localStorage.getItem("learnmate_role");

    return username && token ? { username, token, role } : null;
  });

  const [view, setView] = useState("chat"); // "chat" | "upload"

  function handleLogout() {
    localStorage.removeItem("learnmate_token");
    localStorage.removeItem("learnmate_username");
    localStorage.removeItem("learnmate_role");
    setUser(null);
    setView("chat");
  }

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="h-screen w-screen">
      {user ? (
        view === "upload" && isAdmin ? (
          <div className="relative h-full w-full">
            <button
              onClick={() => setView("chat")}
              className="absolute right-4 top-4 z-10 rounded border border-amber px-3 py-1 font-mono text-xs uppercase text-amber hover:bg-amber hover:text-ink"
            >
              back to chat
            </button>
            <DocumentUpload token={user.token} />
          </div>
        ) : (
          <ChatWindow
  currentUser={user.username}
  currentRole={user.role}
  onLogout={handleLogout}
  isAdmin={isAdmin}
  onOpenUpload={() => setView("upload")}
/>
        )
      ) : (
        <LoginScreen
          onAuthenticated={(result) => {
            localStorage.setItem("learnmate_token", result.token);
            localStorage.setItem("learnmate_username", result.username);
            localStorage.setItem("learnmate_role", result.role);

            setUser({
              username: result.username,
              token: result.token,
              role: result.role,
            });
          }}
        />
      )}
    </div>
  );
}