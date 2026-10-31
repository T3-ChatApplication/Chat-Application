import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';

// Shown in the header of an open room: its members and a Leave button
export default function RoomInfo({ roomId, onLeave }) {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      api
        .room(roomId)
        .then((d) => {
          if (!cancelled) setMembers(d.room.members);
        })
        .catch(() => {});

    load();

    // Someone joined or left: refresh the member list
    const socket = connectSocket();
    const onUpdated = (evt) => {
      if (evt?.roomId === roomId) load();
    };
    socket.on('room:updated', onUpdated);

    return () => {
      cancelled = true;
      socket.off('room:updated', onUpdated);
    };
  }, [roomId]);

  return (
    <div className="room-info">
      <div className="room-members">
        <span className="muted">
          {members.length} member{members.length === 1 ? '' : 's'}:
        </span>
        {members.map((m) => (
          <span key={m.id} className="member">
            {m.username}
          </span>
        ))}
      </div>
      <button className="link" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}
