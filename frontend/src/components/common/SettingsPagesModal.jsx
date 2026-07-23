import { useState } from "react";
import { C } from "../../constants/data";

const pages = [
  {
    key: "privacy",
    title: "Privacy Policy",
    subtitle: "Data handling and user privacy",
    body: [
      "Movora is a fitness and gym management application that helps users track workouts, nutrition, body progress, and membership activity. We collect information that is necessary to create and manage user accounts, deliver app functionality, support gym operations, and provide customer assistance.",
      "The personal information we may collect includes your name, email address, phone number, account credentials, workout and nutrition data, body metrics, membership-related records, and communications with our support team.",
      "We use this information to provide the core services of the application, maintain secure account access, send important notifications, process membership-related activity, and improve the overall user experience.",
      "We do not sell, rent, or share your personal data for unrelated commercial purposes. Information may be processed by trusted service providers that help us host the app, manage authentication, send communications, and maintain backend services. These providers are required to protect your information in accordance with applicable privacy obligations.",
      "You may request access, correction, or deletion of your personal data by contacting us at movoragym848@gmail.com. We will review and respond to such requests in accordance with applicable law and platform requirements.",
      "By using Movora, you acknowledge that your data may be stored securely on servers and processed for the purposes described in this policy."
    ]
  },
  {
    key: "terms",
    title: "Terms & Conditions",
    subtitle: "Rules and responsibilities",
    body: [
      "By using Movora, you agree to use the application lawfully, responsibly, and in accordance with these terms.",
      "You are responsible for the accuracy of the information you provide, including your profile details, contact information, health-related data, and membership information.",
      "Movora provides fitness tracking, nutrition-related tools, and gym management features for informational and convenience purposes. The application does not replace professional medical, nutritional, or fitness advice, and users should consult qualified professionals where appropriate.",
      "You agree not to misuse the application, attempt unauthorized access, share harmful or offensive content, or interfere with the operation of the service.",
      "We reserve the right to suspend, restrict, or terminate access to the app if these terms are violated or if the service is used in a manner that compromises security, legality, or user experience.",
      "These terms may be updated from time to time to reflect changes in services, legal requirements, or platform policies."
    ]
  },
  {
    key: "support",
    title: "Support & Contact",
    subtitle: "Customer assistance",
    body: [
      "If you have questions about your account, memberships, subscriptions, login access, payments, or app features, please contact us using the details below.",
      "For technical support, please include your registered email address, phone number, a brief description of the issue, and any relevant screenshots if available.",
      "We aim to respond as quickly as possible and help resolve account, access, or service-related concerns.",
      "Email: movoragym848@gmail.com",
      "Support is available for account help, feature questions, membership concerns, and general service assistance.",
      "Request Account and Data Deletion: To request deletion of your Movora account and associated personal data, email movoragym848@gmail.com from your registered email address. Include your account name and registered phone number so we can verify and process your request.",
      "We will process verified deletion requests within 30 days. Account profile information, contact details, fitness data, membership data, and other personal data associated with the account will be deleted unless retention is required by law. Payment and invoice records may be retained for the legally required period."
    ]
  }
];

export default function SettingsPagesModal({ onClose }) {
  const [activePage, setActivePage] = useState("privacy");
  const page = pages.find(item => item.key === activePage) || pages[0];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", zIndex: 1200 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 620, maxHeight: "86vh", overflow: "hidden", background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, boxShadow: "0 20px 60px rgba(15,23,42,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ color: C.dark, fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>Settings</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Policies, support, and account help</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 24, cursor: "pointer" }} aria-label="Close settings">✕</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 20px 12px" }}>
          {pages.map(item => (
            <button
              key={item.key}
              onClick={() => setActivePage(item.key)}
              style={{
                border: `1px solid ${activePage === item.key ? C.primary : C.border}`,
                background: activePage === item.key ? `${C.primary}12` : "transparent",
                color: activePage === item.key ? C.primary : C.dark,
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'Barlow', sans-serif"
              }}
            >
              {item.title}
            </button>
          ))}
        </div>

        <div style={{ padding: "8px 20px 22px", overflowY: "auto", maxHeight: "calc(86vh - 160px)" }}>
          <div style={{ color: C.primary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{page.subtitle}</div>
          <h3 style={{ color: C.dark, margin: "0 0 10px", fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif" }}>{page.title}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, color: C.dark, fontSize: 14, lineHeight: 1.7 }}>
            {page.body.map((text, index) => (
              <p key={`${page.key}-${index}`} style={{ margin: 0 }}>{text}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
