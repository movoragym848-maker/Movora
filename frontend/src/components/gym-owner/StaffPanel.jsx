import { useEffect, useState } from "react";
import { addGymStaff, deleteGymStaff, getGymMembers, getGymStaff } from "../../services/api";

const C = {
  card: "#FFFFFF",
  border: "#E5E7EB",
  primary: "#3B82F6",
  dark: "#1F2937",
  muted: "#6B7280",
  surface: "#F9FAFB",
  red: "#EF4444",
};

const emptyForm = { name: "", email: "", phone: "", role: "Trainer" };
const emptyAssignment = { memberId: "", role: "Trainer" };

function initials(name) {
  return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function StaffPanel() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [staffMode, setStaffMode] = useState("choice");
  const [members, setMembers] = useState([]);
  const [assignment, setAssignment] = useState(emptyAssignment);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadStaff = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getGymStaff();
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Unable to load staff.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStaff(); }, []);

  useEffect(() => {
    getGymMembers()
      .then(data => setMembers(Array.isArray(data) ? data : []))
      .catch(() => setMembers([]));
  }, []);

  const updateField = event => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const created = await addGymStaff(form);
      setStaff(current => [created, ...current]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Unable to add staff member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const created = await addGymStaff(assignment);
      setStaff(current => [created, ...current]);
      setAssignment(emptyAssignment);
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Unable to assign staff member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async member => {
    if (!window.confirm(`Remove ${member.name} from your staff?`)) return;
    setError("");
    try {
      await deleteGymStaff(member.id);
      setStaff(current => current.filter(item => item.id !== member.id));
    } catch (err) {
      setError(err.message || "Unable to remove staff member.");
    }
  };

  const filteredStaff = staff.filter(member =>
    `${member.name} ${member.role} ${member.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ color: C.dark, margin: "0 0 4px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800 }}>Staff</h1>
          <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>Manage the people who keep your gym moving.</p>
        </div>
        <button type="button" onClick={() => { setShowForm(true); setStaffMode("choice"); setError(""); }} style={{ border: 0, borderRadius: 10, background: C.primary, color: "#fff", padding: "11px 15px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Add Staff
        </button>
      </div>

      {error && <div role="alert" style={{ marginBottom: 16, padding: "11px 13px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>{error}</div>}

      {showForm && staffMode === "choice" && <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: C.dark, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 21 }}>Add Staff</h2>
          <button type="button" onClick={() => setShowForm(false)} aria-label="Close add staff options" style={{ border: 0, background: "none", color: C.muted, fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <button type="button" onClick={() => setStaffMode("assign")} style={{ border: `1px solid ${C.primary}`, borderRadius: 10, background: "#EFF6FF", color: C.primary, padding: 16, fontWeight: 700, cursor: "pointer" }}>Assign from Members</button>
          <button type="button" onClick={() => setStaffMode("custom")} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, color: C.dark, padding: 16, fontWeight: 700, cursor: "pointer" }}>Add Custom Staff</button>
        </div>
      </div>}

      {showForm && staffMode === "assign" && <form onSubmit={handleAssign} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: C.dark, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 21 }}>Assign Member as Staff</h2>
          <button type="button" onClick={() => setShowForm(false)} aria-label="Close assign staff form" style={{ border: 0, background: "none", color: C.muted, fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: C.dark, fontSize: 12, fontWeight: 700 }}>
          Select member
          <select value={assignment.memberId} onChange={event => setAssignment(current => ({ ...current, memberId: event.target.value }))} required style={{ width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 8, color: C.dark, background: C.surface, font: "inherit", fontWeight: 500 }}>
            <option value="">Choose a member</option>
            {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name} · {member.phone}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: C.dark, fontSize: 12, fontWeight: 700 }}>
          Role
          <select value={assignment.role} onChange={event => setAssignment(current => ({ ...current, role: event.target.value }))} style={{ width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 8, color: C.dark, background: C.surface, font: "inherit", fontWeight: 500 }}>
            <option>Trainer</option><option>Front Desk</option><option>Manager</option><option>Cleaner</option><option>Other</option>
          </select>
        </label>
        <button type="submit" disabled={submitting || members.length === 0} style={{ marginTop: 16, width: "100%", border: 0, borderRadius: 9, background: C.dark, color: "#fff", padding: 12, fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>{submitting ? "Assigning..." : "Assign Staff Member"}</button>
        {members.length === 0 && <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 12 }}>No gym members are available to assign.</p>}
      </form>}

      {showForm && staffMode === "custom" && <form onSubmit={handleSubmit} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: C.dark, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 21 }}>New Staff Member</h2>
          <button type="button" onClick={() => setShowForm(false)} aria-label="Close add staff form" style={{ border: 0, background: "none", color: C.muted, fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[["name", "Full name", "text"], ["email", "Email address", "email"], ["phone", "Phone number", "tel"]].map(([name, label, type]) => (
            <label key={name} style={{ display: "flex", flexDirection: "column", gap: 6, color: C.dark, fontSize: 12, fontWeight: 700 }}>
              {label}
              <input name={name} type={type} value={form[name]} onChange={updateField} required placeholder={label} maxLength={name === "phone" ? 10 : undefined} inputMode={name === "phone" ? "numeric" : undefined} pattern={name === "phone" ? "[6-9][0-9]{9}" : undefined} title={name === "phone" ? "Enter a 10-digit Indian phone number starting with 6-9." : undefined} style={{ width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 8, color: C.dark, background: C.surface, font: "inherit", fontWeight: 500 }} />
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 6, color: C.dark, fontSize: 12, fontWeight: 700 }}>
            Role
            <select name="role" value={form.role} onChange={updateField} style={{ width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 8, color: C.dark, background: C.surface, font: "inherit", fontWeight: 500 }}>
              <option>Trainer</option><option>Front Desk</option><option>Manager</option><option>Cleaner</option><option>Other</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={submitting} style={{ marginTop: 16, width: "100%", border: 0, borderRadius: 9, background: C.dark, color: "#fff", padding: 12, fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>{submitting ? "Adding..." : "Save Staff Member"}</button>
      </form>}

      {staff.length > 0 && <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff by name, role, or email" aria-label="Search staff" style={{ width: "100%", padding: "12px 13px", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16, background: C.card, color: C.dark, fontSize: 14 }} />}

      {loading ? <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading staff...</div> : filteredStaff.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "44px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>✦</div>
          <h2 style={{ margin: "0 0 6px", color: C.dark, fontFamily: "'Barlow Condensed', sans-serif" }}>{staff.length ? "No staff match that search" : "Build your team"}</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>{staff.length ? "Try a different name or role." : "Add trainers, front desk staff, and managers in one place."}</p>
        </div>
      ) : <div style={{ display: "grid", gap: 12 }}>
        {filteredStaff.map(member => <article key={member.id} style={{ display: "flex", alignItems: "center", gap: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 15 }}>
          <div aria-hidden="true" style={{ flexShrink: 0, width: 46, height: 46, borderRadius: "50%", display: "grid", placeItems: "center", background: "#DBEAFE", color: C.primary, fontWeight: 800 }}>{initials(member.name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, color: C.dark, fontSize: 16, fontWeight: 700 }}>{member.name}</h2>
            <div style={{ marginTop: 3, color: C.primary, fontSize: 12, fontWeight: 700 }}>{member.role}</div>
            <div style={{ marginTop: 5, color: C.muted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.email}</div>
          </div>
          <a href={`https://wa.me/91${String(member.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label={`Message ${member.name} on WhatsApp`} title={`Message ${member.name} on WhatsApp`} style={{ flexShrink: 0, width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: "50%", background: "#DCFCE7", color: "#15803D", textDecoration: "none" }}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
              <path d="M12 2a9.8 9.8 0 0 0-8.5 14.7L2 22l5.5-1.4A9.8 9.8 0 1 0 12 2Zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-3.3.8.9-3.2-.2-.3A8 8 0 1 1 12 19.8Zm4.4-5.9c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1s-.5.7-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.6c-.1-.2 0-.3.1-.4l.4-.5.2-.4c.1-.2 0-.3 0-.5l-.6-1.5c-.2-.4-.3-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 3.9 3.5.5.2.9.3 1.2.4.5.2 1 .1 1.4.1.4-.1 1.2-.5 1.3-1 .2-.5.2-.9.1-1 0-.2-.2-.2-.4-.3Z" />
            </svg>
          </a>
          <a href={`tel:${member.phone}`} aria-label={`Call ${member.name}`} title={`Call ${member.name}`} style={{ flexShrink: 0, width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: "50%", background: "#DCFCE7", color: "#15803D", textDecoration: "none", fontSize: 18 }}>☎</a>
          <button type="button" onClick={() => handleDelete(member)} aria-label={`Delete ${member.name}`} title="Delete staff member" style={{ flexShrink: 0, width: 38, height: 38, border: 0, borderRadius: "50%", background: "#FEF2F2", color: C.red, cursor: "pointer", fontSize: 17 }}>⌫</button>
        </article>)}
      </div>}
    </div>
  );
}