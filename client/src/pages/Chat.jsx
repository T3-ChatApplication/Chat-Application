import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';
import ConversationList from '../components/ConversationList.jsx';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';

// Step 6: send and receive messages live.
// Messages are not stored yet, so they disappear on refresh until the next steps.
export default function Chat() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  // Conversation list
  useEffect(() => {
    api.users().then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, []);

  // Socket connection
  useEffect(() => {
    const socket = connectSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onError = (err) => setError(`Connection problem: ${err.message}`);

    if (socket.connected) setConnected(true);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  // Append new messages that belong to the open conversation
  useEffect(() => {
    const socket = connectSocket();
    const onNew = (msg) => {
      if (!active) return;
      const belongs = msg.sender === active.id || msg.receiver === active.id;
      if (!belongs) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    socket.on('message:new', onNew);
    return () => socket.off('message:new', onNew);
  }, [active]);

  const openConversation = useCallback((other) => {
    setActive(other);
    setMessages([]);
    setError('');
  }, []);

  function sendMessage(text) {
    setError('');
    connectSocket().emit('message:send', { to: active.id, text }, (res) => {
      if (!res?.ok) setError(res?.error || 'Could not send message');
    });
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <strong>{user.username}</strong>
            <div className={`status ${connected ? 'online' : 'offline'}`}>
              {connected ? 'Connected' : 'Connecting...'}
            </div>
          </div>
          <button className="link" onClick={logout}>
            Log out
          </button>
        </div>
        <ConversationList users={users} activeId={active?.id} onSelect={openConversation} />
      </aside>

      <main className="chat-main">
        {active ? (
          <>
            <header className="chat-header">{active.username}</header>
            {error && <div className="error">{error}</div>}
            <MessageList messages={messages} currentUserId={user.id} />
            <MessageInput onSend={sendMessage} disabled={!connected} />
          </>
        ) : (
          <div className="center-screen muted">Select a user to start chatting</div>
        )}
      </main>
    </div>
  );
}
