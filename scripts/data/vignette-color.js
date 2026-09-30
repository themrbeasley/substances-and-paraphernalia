const SCOPE = "substances-and-paraphernalia";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function resolveVignetteColor(actor) {
  const value = actor?.flags?.[SCOPE]?.vignetteColor;
  if (typeof value !== "string") return null;
  return HEX_COLOR.test(value) ? value : null;
}

// A withdrawal AE lights the vignette only while it applies. `active` is false
// for disabled effects and for V14-expired ones (`duration.expired` suppresses
// an effect without disabling it when expiryAction is "update").
export function isLiveWithdrawalEffect(effect) {
  return /withdraw/i.test(effect?.name ?? "") && effect?.active === true;
}
