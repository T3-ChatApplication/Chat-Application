import { useEffect, useRef, useState } from 'react';

// How long after the last key press we tell the other side "stopped typing"
const STOP_AFTER_MS = 2000;

// onTypingChange(true | false) is called when the user starts and stops typing
export default function MessageInput({ onSend, disabled, onTypingChange }) {
  const [text, setText] = useState('');
  const typing = useRef(false);
  const stopTimer = useRef(null);
  const notify = useRef(onTypingChange);
  notify.current = onTypingChange;

  function setTyping(value) {
    if (typing.current === value) return;
    typing.current = value;
    notify.current?.(value);
  }

  function stopTyping() {
    clearTimeout(stopTimer.current);
    setTyping(false);
  }

  // If this input goes away mid-sentence (another chat was opened), say we stopped.
  // The parent gives each conversation its own input (key), so this reaches the right chat.
  useEffect(
    () => () => {
      clearTimeout(stopTimer.current);
      if (typing.current) {
        typing.current = false;
        notify.current?.(false);
      }
    },
    []
  );

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
    if (!value) {
      stopTyping();
      return;
    }
    setTyping(true);
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, STOP_AFTER_MS);
  }

  function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    stopTyping();
    onSend(trimmed);
    setText('');
  }

  return (
    <form className="message-input" onSubmit={submit}>
      <input
        value={text}
        onChange={handleChange}
        placeholder="Type a message..."
        maxLength={2000}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}
