import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';
import ConversationList from '../components/ConversationList.jsx';

// Step 5: pick another user to open a one-to-one conversation.
// Sending and receiving messages is added in the next step.
export default function Chat() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(null);
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

  const openConversation = useCallback((other) => {
    setActive(other);
    setError('');
  }, []);

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
            <div className="messages empty muted">Messages will appear here in the next step.</div>
          </>
        ) : (
          <div className="center-screen muted">Select a user to start chatting</div>
        )}
      </main>
    </div>
  );
}
