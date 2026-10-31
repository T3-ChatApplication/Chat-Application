
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
  const [rooms, setRooms] = useState([]);

  const [active, setActive] = useState(null);
  const [activeRoom, setActiveRoom] = useState(null);

  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);

  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);

  // Load users for direct messaging.
  useEffect(() => {
    let cancelled = false;

    api.users()
      .then((data) => {
        if (!cancelled) {
          setUsers(data.users || []);
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

  // Load all available group rooms.
  const loadRooms = useCallback(async () => {
    try {
      const data = await api.rooms();
      setRooms(data.rooms || []);
    } catch (err) {
      setError(err.message || 'Could not load rooms');
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Track Socket.IO connection status.
  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

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

  // Load private conversation history.
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

  // Receive messages for the currently open private conversation.
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

  // Open a private conversation.
  const openConversation = useCallback((other) => {
    setActive(other);
    setActiveRoom(null);
    setMessages([]);
    setError('');
  }, []);

  // Create a new group room.
  async function createGroupRoom(event) {
    event.preventDefault();

    const trimmedName = roomName.trim();

    if (!trimmedName) {
      setError('Please enter a room name');
      return;
    }

    setRoomLoading(true);
    setError('');

    try {
      const data = await api.createRoom(trimmedName);

      setRoomName('');
      setActive(null);
      setActiveRoom(data.room);
      setMessages([]);

      await loadRooms();
    } catch (err) {
      setError(err.message || 'Could not create room');
    } finally {
      setRoomLoading(false);
    }
  }

  // Join an existing room.
  async function joinGroupRoom(roomId) {
    setRoomLoading(true);
    setError('');

    try {
      const data = await api.joinRoom(roomId);

      setActive(null);
      setActiveRoom(data.room);
      setMessages([]);

      await loadRooms();
    } catch (err) {
      setError(err.message || 'Could not join room');
    } finally {
      setRoomLoading(false);
    }
  }

  // Leave a room.
  async function leaveGroupRoom(roomId) {
    setRoomLoading(true);
    setError('');

    try {
      await api.leaveRoom(roomId);

      if (activeRoom?.id === roomId) {
        setActiveRoom(null);
      }

      await loadRooms();
    } catch (err) {
      setError(err.message || 'Could not leave room');
    } finally {
      setRoomLoading(false);
    }
  }

  // Send a private message.
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

        {/* Direct messages */}
        <section className="direct-messages-section">
          <h3>Direct Messages</h3>

          <ConversationList
            users={users}
            activeId={active?.id}
            onSelect={openConversation}
          />
        </section>

        {/* Group rooms */}
        <section className="rooms-section">
          <h3>Group Rooms</h3>

          <form onSubmit={createGroupRoom} className="room-create-form">
            <input
              type="text"
              placeholder="Enter room name"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              maxLength={40}
              disabled={roomLoading}
            />

            <button type="submit" disabled={roomLoading || !roomName.trim()}>
              {roomLoading ? 'Please wait...' : 'Create Room'}
            </button>
          </form>

          <div className="room-list">
            {rooms.length === 0 ? (
              <p className="muted">No rooms available yet.</p>
            ) : (
              rooms.map((room) => (
                <div className="room-item" key={room.id}>
                  <div className="room-info">
                    <strong>{room.name}</strong>
                    <small>
                      {room.members.length} member
                      {room.members.length !== 1 ? 's' : ''}
                    </small>
                  </div>

                  {room.isMember ? (
                    <button
                      type="button"
                      className="link"
                      disabled={roomLoading}
                      onClick={() => leaveGroupRoom(room.id)}
                    >
                      Leave
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => joinGroupRoom(room.id)}
                      disabled={roomLoading}
                    >
                      Join
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </aside>

      {/* Main chat area */}
      <main className="chat-main">
        {error && <div className="error">{error}</div>}

        {active ? (
          <>
            <header className="chat-header">
              {active.username}
            </header>

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
        ) : activeRoom ? (
          <>
            <header className="chat-header">
              Group Room: {activeRoom.name}
            </header>

            <div className="center-screen muted">
              <h2>{activeRoom.name}</h2>

              <p>
                You have joined this room successfully.
              </p>

              <p>
                Members: {activeRoom.members.length}
              </p>

              <p>
                Group messaging will be connected in the next stage.
              </p>
            </div>
          </>
        ) : (
          <div className="center-screen muted">
            Select a user to start chatting or create/join a group room.
          </div>
        )}
      </main>
    </div>
  );
}
