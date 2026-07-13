import { useState } from "react";
import ChatWindow from "./components/ChatWindow";
import LoginScreen from "./components/LoginScreen";
import DocumentUpload from "./components/DocumentUpload";
import Sidebar from "./components/Sidebar";

export default function App() {
  const [user, setUser] = useState(() => {
    const username = localStorage.getItem("learnmate_username");
    const token = localStorage.getItem("learnmate_token");
    const role = localStorage.getItem("learnmate_role");

    return username && token ? { username, token, role } : null;
  });

  const [view, setView] = useState("chat"); // "chat" | "upload"
  const [sessionId, setSessionId] = useState(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  function handleLogout() {
    localStorage.removeItem("learnmate_token");
    localStorage.removeItem("learnmate_username");
    localStorage.removeItem("learnmate_role");
    setUser(null);
    setView("chat");
    setSessionId(null);
  }

  function handleSessionCreated(newSessionId) {
    setSessionId(newSessionId);
    setSidebarRefreshKey((k) => k + 1); // makes the new session show up in the sidebar right away
  }

  function handleNewChat() {
    setSessionId(null);
    setView("chat");
  }

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="h-screen w-screen">
      {user ? (
        <div className="flex h-full w-full">
          <Sidebar
            activeSessionId={sessionId}
            refreshKey={sidebarRefreshKey}
            onSelectSession={(id) => {
              setSessionId(id);
              setView("chat");
            }}
            onNewChat={handleNewChat}
          />

          <div className="relative flex-1">
            {view === "upload" && isAdmin ? (
              <div className="relative h-full w-full">
                <button
                  onClick={() => setView("chat")}
                  className="absolute right-4 top-4 z-10 rounded border border-[#FF6B4A] px-3 py-1 font-mono text-xs uppercase text-[#FF8F6B] transition-colors hover:bg-[#FF6B4A] hover:text-[#0A0916]"
                >
                  back to chat
                </button>
               <DocumentUpload
    token={user.token}
    apiBase={`${import.meta.env.VITE_API_BASE_URL}/api/documents`}
/>
              </div>
            ) : (
              <ChatWindow
                currentUser={user.username}
                currentRole={user.role}
                onLogout={handleLogout}
                isAdmin={isAdmin}
                onOpenUpload={() => setView("upload")}
                sessionId={sessionId}
                onSessionCreated={handleSessionCreated}
                onNewChat={handleNewChat}
              />
            )}
          </div>
        </div>
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