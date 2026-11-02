import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';
import usePresence from '../hooks/usePresence.js';
import ConversationList from '../components/ConversationList.jsx';
import RoomList from '../components/RoomList.jsx';
import RoomInfo from '../components/RoomInfo.jsx';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';
import ConnectionBanner from '../components/ConnectionBanner.jsx';
import { mergeMessages } from '../utils/messages.js';

const fetchHistory = (conversation) =>
  conversation.type === 'room' ? api.roomHistory(conversation.id) : api.history(conversation.id);

const STATUS_LABEL = {
  connected: 'Connected',
  connecting: 'Connecting...',
  reconnecting: 'Reconnecting...',
};

export default function Chat() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  // The open conversation: { type: 'user' | 'room', id, name }
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  // 'connecting' (first connect) | 'connected' | 'reconnecting' (lost it, retrying)
  const [connection, setConnection] = useState('connecting');
  const connected = connection === 'connected';
  const [error, setError] = useState('');
  const [offlineNotice, setOfflineNotice] = useState('');
  const online = usePresence();
  const usersRef = useRef(users);
  usersRef.current = users;
  const activeRef = useRef(active);
  activeRef.current = active;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const loadUsers = useCallback(() => {
    api.users().then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, []);

  const loadRooms = useCallback(() => {
    api.rooms().then((d) => setRooms(d.rooms)).catch((e) => setError(e.message));
  }, []);

  // Conversation list and rooms
  useEffect(() => {
    loadUsers();
    loadRooms();
  }, [loadUsers, loadRooms]);

  // Someone we have not seen before came online (a new account): refresh the user list
  useEffect(() => {
    const socket = connectSocket();
    const onUpdate = ({ userId }) => {
      if (userId !== user.id && !usersRef.current.some((u) => u.id === userId)) loadUsers();
    };
    socket.on('presence:update', onUpdate);
    return () => socket.off('presence:update', onUpdate);
  }, [user.id, loadUsers]);

  // After a dropped connection: reload lists and fetch the messages missed while away
  const resync = useCallback(async () => {
    loadUsers();
    loadRooms();
    const current = activeRef.current;
    if (!current) return;
    try {
      const data = await fetchHistory(current);
      // Ignore the result if the user opened another conversation meanwhile
      if (activeRef.current !== current) return;
      setMessages((prev) => mergeMessages(prev, data.messages));
    } catch {
      // Still offline or the token expired: the next reconnect tries again
    }
  }, [loadUsers, loadRooms]);

  // Socket connection state
  useEffect(() => {
    const socket = connectSocket();
    let hasConnected = socket.connected;

    const onConnect = () => {
      setConnection('connected');
      setError('');
      if (hasConnected) resync(); // this is a reconnection, not the first connect
      hasConnected = true;
    };
    const onDisconnect = (reason) => {
      setConnection('reconnecting');
      // The server closed the connection itself: Socket.IO does not retry in that case
      if (reason === 'io server disconnect') socket.connect();
    };
    const onError = (err) => {
      if (err.message === 'Authentication failed') {
        logoutRef.current(); // the saved token is invalid or expired
      } else {
        setConnection((c) => (c === 'connected' ? 'reconnecting' : c));
      }
    };

    if (socket.connected) setConnection('connected');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, [resync]);

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

  // Handle messages queued while offline and delivery notifications
  useEffect(() => {
    const socket = connectSocket();

    const onOffline = ({ messages: offlineList }) => {
      if (!Array.isArray(offlineList) || offlineList.length === 0) return;
      setOfflineNotice(
        `Delivered ${offlineList.length} message${offlineList.length === 1 ? '' : 's'} received while offline.`
      );

      const current = activeRef.current;
      if (current) {
        const relevant = offlineList.filter((msg) =>
          current.type === 'room'
            ? msg.room === current.id
            : !msg.room && (msg.sender === current.id || msg.receiver === current.id)
        );
        if (relevant.length > 0) {
          setMessages((prev) => mergeMessages(prev, relevant));
        }
      }
    };

    const onDelivered = ({ messageIds }) => {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;
      const idsSet = new Set(messageIds);
      setMessages((prev) =>
        prev.map((m) => (idsSet.has(m.id) ? { ...m, delivered: true, status: 'delivered' } : m))
      );
    };

    socket.on('message:offline', onOffline);
    socket.on('message:delivered', onDelivered);

    return () => {
      socket.off('message:offline', onOffline);
      socket.off('message:delivered', onDelivered);
    };
  }, []);

  // Open a conversation (a user or a room) and load its stored history
  const openConversation = useCallback(async (conversation) => {
    setActive(conversation);
    setMessages([]);
    setError('');
    try {
      const data = await fetchHistory(conversation);
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
    // timeout(): if no confirmation comes back in 8 seconds the user is told, instead of waiting forever
    connectSocket()
      .timeout(8000)
      .emit('message:send', payload, (err, res) => {
        if (err) {
          setError('The message was not confirmed. Check your connection and try again.');
          return;
        }
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
              {STATUS_LABEL[connection]}
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
          onlineIds={online}
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
        <ConnectionBanner status={connection} />
        {offlineNotice && (
          <div className="banner offline" role="status">
            <span>{offlineNotice}</span>
            <button className="link" onClick={() => setOfflineNotice('')} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {active ? (
          <>
            <header className="chat-header">
              <span>
                {active.type === 'room' ? `# ${active.name}` : active.name}
                {active.type === 'user' && (
                  <span className={`presence ${online.has(active.id) ? 'online' : ''}`}>
                    {online.has(active.id) ? 'Online' : 'Offline'}
                  </span>
                )}
              </span>
              {active.type === 'room' && (
                <RoomInfo roomId={active.id} onLeave={leaveRoom} onlineIds={online} />
              )}
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
