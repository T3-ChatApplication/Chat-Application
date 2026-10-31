import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';
import ConversationList from '../components/ConversationList.jsx';
import RoomList from '../components/RoomList.jsx';
import RoomInfo from '../components/RoomInfo.jsx';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';

export default function Chat() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  // The open conversation: { type: 'user' | 'room', id, name }
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const loadRooms = useCallback(() => {
    api.rooms().then((d) => setRooms(d.rooms)).catch((e) => setError(e.message));
  }, []);

  // Conversation list and rooms
  useEffect(() => {
    api.users().then((d) => setUsers(d.users)).catch((e) => setError(e.message));
    loadRooms();
  }, [loadRooms]);

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

  // A room was created, joined or left by someone: refresh the list
  useEffect(() => {
    const socket = connectSocket();
    socket.on('room:updated', loadRooms);
    return () => socket.off('room:updated', loadRooms);
  }, [loadRooms]);

  // Append new messages that belong to the open conversation
  useEffect(() => {
    const socket = connectSocket();
    const onNew = (msg) => {
      if (!active) return;
      const belongs =
        active.type === 'room'
          ? msg.room === active.id
          : !msg.room && (msg.sender === active.id || msg.receiver === active.id);
      if (!belongs) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    socket.on('message:new', onNew);
    return () => socket.off('message:new', onNew);
  }, [active]);

  // Open a conversation (a user or a room) and load its stored history
  const openConversation = useCallback(async (conversation) => {
    setActive(conversation);
    setMessages([]);
    setError('');
    try {
      const data =
        conversation.type === 'room'
          ? await api.roomHistory(conversation.id)
          : await api.history(conversation.id);
      setMessages(data.messages);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const selectUser = (u) => openConversation({ type: 'user', id: u.id, name: u.username });
  const selectRoom = (r) => openConversation({ type: 'room', id: r.id, name: r.name });

  async function createRoom(name) {
    const data = await api.createRoom(name); // errors are shown under the create form
    loadRooms();
    selectRoom(data.room);
  }

  async function joinRoom(room) {
    try {
      await api.joinRoom(room.id);
      loadRooms();
      selectRoom(room);
    } catch (e) {
      setError(e.message);
    }
  }

  async function leaveRoom() {
    try {
      await api.leaveRoom(active.id);
      setActive(null);
      loadRooms();
    } catch (e) {
      setError(e.message);
    }
  }

  // id -> username, so group messages can show who wrote them
  const names = { [user.id]: user.username };
  users.forEach((u) => {
    names[u.id] = u.username;
  });

  function sendMessage(text) {
    setError('');
    const payload = active.type === 'room' ? { room: active.id, text } : { to: active.id, text };
    connectSocket().emit('message:send', payload, (res) => {
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
        <ConversationList
          users={users}
          activeId={active?.type === 'user' ? active.id : null}
          onSelect={selectUser}
        />
        <RoomList
          rooms={rooms}
          activeId={active?.type === 'room' ? active.id : null}
          onSelect={selectRoom}
          onCreate={createRoom}
          onJoin={joinRoom}
        />
      </aside>

      <main className="chat-main">
        {active ? (
          <>
            <header className="chat-header">
              <span>{active.type === 'room' ? `# ${active.name}` : active.name}</span>
              {active.type === 'room' && <RoomInfo roomId={active.id} onLeave={leaveRoom} />}
            </header>
            {error && <div className="error">{error}</div>}
            <MessageList
              messages={messages}
              currentUserId={user.id}
              names={names}
              showSender={active.type === 'room'}
            />
            <MessageInput onSend={sendMessage} disabled={!connected} />
          </>
        ) : (
          <div className="center-screen muted">Select a user or a room to start chatting</div>
        )}
      </main>
    </div>
  );
}
