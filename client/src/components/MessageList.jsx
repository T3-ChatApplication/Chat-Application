import { useEffect, useRef } from 'react';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// names: { [userId]: username }. In a room (showSender) each incoming message shows who wrote it.
export default function MessageList({ messages, currentUserId, names = {}, showSender = false }) {
  const endRef = useRef(null);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return <div className="messages empty muted">No messages yet. Say hello!</div>;
  }

  return (
    <div className="messages">
      {messages.map((m) => {
        const mine = m.sender === currentUserId;
        return (
          <div key={m.id} className={`bubble ${mine ? 'mine' : 'theirs'}`}>
            {showSender && !mine && <div className="sender">{names[m.sender] || 'Unknown user'}</div>}
            <div className="text">{m.text}</div>
            <div className="time">{formatTime(m.createdAt)}</div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
