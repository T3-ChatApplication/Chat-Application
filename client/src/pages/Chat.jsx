
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';
import ConversationList from '../components/ConversationList.jsx';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';

export default function Chat() {
  const { user, logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load the list of users.
  useEffect(() => {
    let cancelled = false;

    api.users()
      .then((data) => {
        if (!cancelled) {
          setUsers(data.users);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Could not load users');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Track the Socket.IO connection status.
  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => {
      setConnected(true);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onError = (err) => {
      setConnected(false);
      setError(`Connection problem: ${err.message}`);
    };

    if (socket.connected) {
      setConnected(true);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  // Load saved messages whenever a conversation is opened.
  useEffect(() => {
    if (!active) {
      setMessages([]);
      setLoadingHistory(false);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setMessages([]);
      setError('');
      setLoadingHistory(true);

      try {
        // api.history includes the saved authentication token.
        const data = await api.history(active.id);

        if (!cancelled) {
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load chat history');
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [active]);

  // Receive new messages for the currently open conversation.
  useEffect(() => {
    const socket = connectSocket();

    const onNew = (msg) => {
      if (!active) return;

      const belongsToConversation =
        (msg.sender === user.id && msg.receiver === active.id) ||
        (msg.sender === active.id && msg.receiver === user.id);

      if (!belongsToConversation) return;

      setMessages((previous) => {
        if (previous.some((item) => item.id === msg.id)) {
          return previous;
        }

        return [...previous, msg].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
        );
      });
    };

    socket.on('message:new', onNew);

    return () => {
      socket.off('message:new', onNew);
    };
  }, [active, user.id]);

  // Open a conversation with the selected user.
  const openConversation = useCallback((other) => {
    setActive(other);
    setMessages([]);
    setError('');
  }, []);

  // Send a message through Socket.IO.
  function sendMessage(text) {
    if (!active) {
      setError('Select a conversation first');
      return;
    }

    if (!connected) {
      setError('Not connected. Please wait and try again.');
      return;
    }

    setError('');

    connectSocket().emit(
      'message:send',
      { to: active.id, text },
      (response) => {
        if (!response?.ok) {
          setError(response?.error || 'Could not send message');
        }
      }
    );
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

        <ConversationList
          users={users}
          activeId={active?.id}
          onSelect={openConversation}
        />
      </aside>

      <main className="chat-main">
        {active ? (
          <>
            <header className="chat-header">
              {active.username}
            </header>

            {error && <div className="error">{error}</div>}

            {loadingHistory && (
              <div className="center-screen muted">
                Loading chat history...
              </div>
            )}

            {!loadingHistory && messages.length === 0 && !error && (
              <div className="center-screen muted">
                No messages yet. Start the conversation!
              </div>
            )}

            <MessageList
              messages={messages}
              currentUserId={user.id}
            />

            <MessageInput
              onSend={sendMessage}
              disabled={!connected}
            />
          </>
        ) : (
          <div className="center-screen muted">
            Select a user to start chatting
          </div>
        )}
      </main>
    </div>
  );
}
