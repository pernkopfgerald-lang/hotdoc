import { AlertTriangle } from "lucide-react";

export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--red-tint)",
        color: "var(--red)",
        fontSize: 13,
        border: "1px solid var(--red-border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <AlertTriangle size={14} /> {msg}
    </div>
  );
}
