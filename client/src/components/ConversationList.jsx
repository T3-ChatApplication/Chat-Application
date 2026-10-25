export default function ConversationList({ users, activeId, onSelect }) {
  if (users.length === 0) {
    return <p className="muted pad">No other users yet. Register a second account to start chatting.</p>;
  }

  return (
    <ul className="conversation-list">
      {users.map((u) => (
        <li key={u.id}>
          <button
            className={`conversation ${u.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(u)}
          >
            <span className="avatar">{u.username[0].toUpperCase()}</span>
            <span>{u.username}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
