export default function VerifiedBadge({ accountType }) {
  if (accountType !== "gym_owner") return null;
  return <span className="social-verified-badge" role="img" aria-label="Verified gym owner" title="Verified gym owner">✓</span>;
}
