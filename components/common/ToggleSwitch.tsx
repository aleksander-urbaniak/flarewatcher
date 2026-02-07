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
      className={`toggle-switch ${enabled ? "on" : "off"}`}
      aria-pressed={enabled}
    />
  );
}
