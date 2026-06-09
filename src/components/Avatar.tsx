function Avatar({ gender, size = 32 }: { name?: string; gender: string; size?: number }) {
  const f = gender === "أنثى";
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ borderRadius: "50%", flexShrink: 0, overflow: "hidden" }}>
      <use href={f ? "#avf" : "#avm"} />
    </svg>
  );
}

export { Avatar };
