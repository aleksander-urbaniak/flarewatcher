"use client";

export default function ToggleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`table-toggle ${enabled ? "on" : "off"}`}
    >
      <span />
    </button>
  );
}
