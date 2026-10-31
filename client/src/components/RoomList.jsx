import { useState } from 'react';

// Sidebar section: rooms the user belongs to, a create form, and rooms they can join
export default function RoomList({ rooms, activeId, onSelect, onCreate, onJoin }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const joined = rooms.filter((r) => r.isMember);
  const others = rooms.filter((r) => !r.isMember);

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(trimmed);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rooms">
      <h3 className="section-title">Rooms</h3>

      <form className="room-form" onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New room name"
          maxLength={40}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          Create
        </button>
      </form>
      {error && <div className="error small">{error}</div>}

      <ul className="conversation-list">
        {joined.map((r) => (
          <li key={r.id}>
            <button
              className={`conversation ${r.id === activeId ? 'active' : ''}`}
              onClick={() => onSelect(r)}
            >
              <span className="avatar room">#</span>
              <span>{r.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {joined.length === 0 && <p className="muted pad-sm">You have not joined any rooms yet.</p>}

      {others.length > 0 && (
        <>
          <h4 className="section-subtitle">Open rooms</h4>
          <ul className="conversation-list">
            {others.map((r) => (
              <li key={r.id} className="room-row">
                <span>
                  #{r.name} <span className="muted">({r.memberCount})</span>
                </span>
                <button className="small" onClick={() => onJoin(r)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
