export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function roleLabel(role) {
  return (
    {
      TOP: "Top",
      JUNGLE: "Jungla",
      MID: "Mid",
      ADC: "ADC",
      SUPPORT: "Support",
    }[role] ?? role
  );
}

export function roleShort(role) {
  return (
    {
      TOP: "TOP",
      JUNGLE: "JGL",
      MID: "MID",
      ADC: "ADC",
      SUPPORT: "SUP",
    }[role] ?? role
  );
}

export function sideLabel(side) {
  return side === "BLUE" ? "Azul" : "Rojo";
}

export function damageLabel(damage) {
  return (
    {
      PHYSICAL: "AD",
      MAGIC: "AP",
      MIXED: "Mixto",
    }[damage] ?? damage
  );
}

export function roleBadge(role, extra = "") {
  return `<span class="role-badge ${extra}" title="${roleLabel(role)}">${roleShort(role)}</span>`;
}

export function championAvatar(champion, className = "") {
  const src = `assets/champions/${encodeURIComponent(champion.image ?? "")}`;
  const initials = escapeHtml((champion.name ?? "?").slice(0, 2).toUpperCase());
  return `<span class="champion-avatar ${className}" data-champion-avatar>
    <img src="${src}" alt="" loading="lazy" />
    <span class="champion-avatar-fallback" hidden>${initials}</span>
  </span>`;
}

export function comfortMeter(comfort) {
  const value = Math.max(1, Math.min(5, Number(comfort) || 1));
  const pips = Array.from({ length: 5 }, (_, index) => {
    return `<span class="comfort-pip ${index < value ? "is-on" : ""}"></span>`;
  }).join("");
  return `<span class="comfort-meter" role="img" title="Comfort ${value}/5" aria-label="Comfort ${value} de 5">${pips}</span>`;
}

export function tierClass(tier) {
  return `tier-${String(tier ?? "D").toLowerCase()}`;
}

export function scoreWidth(score) {
  return `${Math.max(0, Math.min(100, Number(score) || 0))}%`;
}

export function formatScore(score) {
  return Number(score ?? 0).toFixed(1);
}

export function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function needsLabel(need) {
  return need?.label ?? need?.id ?? "";
}

export function initials(name) {
  return String(name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
