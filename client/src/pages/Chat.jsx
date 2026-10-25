import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { connectSocket } from '../socket.js';

// Step 4: layout shell with a live connection indicator.
// The conversation list and messages are added in the next steps.
export default function Chat() {
  const { user, logout } = useAuth();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

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
      </aside>

      <main className="chat-main">
        {error && <div className="error">{error}</div>}
        <div className="center-screen muted">Real-time connection ready. Conversations come next.</div>
      </main>
    </div>
  );
}
