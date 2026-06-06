export function Avatar({ name, gender, size = 32 }: { name: string; gender: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0] || "").join("");
  const f = gender === "أنثى";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: f ? "#FBEAF0" : "#E1F5EE",
      color: f ? "#72243E" : "#085041",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 500, flexShrink: 0
    }}>
      {initials}
    </div>
  );
}
