const SCOPE = "substances-and-paraphernalia";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function resolveVignetteColor(actor) {
  const value = actor?.flags?.[SCOPE]?.vignetteColor;
  if (typeof value !== "string") return null;
  return HEX_COLOR.test(value) ? value : null;
}
