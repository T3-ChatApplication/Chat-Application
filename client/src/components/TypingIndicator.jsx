// ids: user ids typing right now, names: { [userId]: username }
// Always renders a line of fixed height, so the chat does not jump when someone starts typing.
export default function TypingIndicator({ ids, names }) {
  const who = ids.map((id) => names[id] || 'Someone');

  let text = '';
  if (who.length === 1) text = `${who[0]} is typing...`;
  else if (who.length === 2) text = `${who[0]} and ${who[1]} are typing...`;
  else if (who.length > 2) text = 'Several people are typing...';

  return (
    <div className="typing" aria-live="polite">
      {text}
    </div>
  );
}
