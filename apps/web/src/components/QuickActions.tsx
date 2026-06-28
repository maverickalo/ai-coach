const actions = [
  { label: "Done", message: "I finished today's workout. Help me log it." },
  {
    label: "Need substitute",
    message: "I need a substitute for an exercise."
  },
  {
    label: "Wrist hurts",
    message: "My wrist hurts today. What should I change?"
  },
  {
    label: "Only 30 min",
    message: "I only have 30 minutes today. Can you shorten the workout?"
  },
  {
    label: "Explain exercise",
    message: "Can you explain one of today's exercises?"
  },
  {
    label: "Skip exercise",
    message: "I want to skip an exercise. Help me decide."
  }
];

export function QuickActions({
  onSelect,
  disabled
}: {
  onSelect: (message: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="quick-actions" aria-label="Quick messages">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onSelect(action.message)}
          disabled={disabled}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
