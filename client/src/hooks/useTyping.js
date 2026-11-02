import { useEffect, useRef, useState } from 'react';
import { connectSocket } from '../socket.js';

// If a "stopped typing" event is lost, hide the indicator after this long anyway
const EXPIRE_MS = 4000;

// Ids of the people currently typing in the open conversation
export default function useTyping(active) {
  const [typingIds, setTypingIds] = useState([]);
  const timers = useRef(new Map());

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      setTypingIds([]);
    };

    clearAll(); // a different conversation was opened: start empty
    if (!active) return undefined;

    const socket = connectSocket();

    const remove = (id) => {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      setTypingIds((prev) => prev.filter((x) => x !== id));
    };

    const onTyping = ({ from, room, isTyping }) => {
      const belongs = active.type === 'room' ? room === active.id : !room && from === active.id;
      if (!belongs) return;

      if (!isTyping) {
        remove(from);
        return;
      }
      clearTimeout(timers.current.get(from));
      timers.current.set(from, setTimeout(() => remove(from), EXPIRE_MS));
      setTypingIds((prev) => (prev.includes(from) ? prev : [...prev, from]));
    };

    socket.on('typing', onTyping);
    return () => {
      socket.off('typing', onTyping);
      clearAll();
    };
  }, [active]);

  return typingIds;
}
