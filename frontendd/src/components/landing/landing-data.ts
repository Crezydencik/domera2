import {
  FiBell,
  FiCheckCircle,
  FiCloud,
  FiCreditCard,
  FiDatabase,
  FiFileText,
  FiHome,
  FiLock,
  FiMessageCircle,
  FiPieChart,
  FiShield,
  FiTool,
  FiUsers,
  FiZap,
} from "react-icons/fi";

export const navItems = [
  { key: "features", href: "#features" },
  { key: "platform", href: "#platform" },
  { key: "solutions", href: "#solutions" },
  // { key: "pricing", href: "#pricing" },
  { key: "faq", href: "#faq" },
];

export const heroBenefits = [
  "cloud",
  "billing",
  // "payment",
  "access",
  "storage",
  "install",
];

export const featureItems = [
  {
    icon: FiHome,
    key: "properties",
    accent: "text-blue-600 bg-blue-50 ring-blue-100",
  },
  {
    icon: FiZap,
    key: "meters",
    accent: "text-amber-600 bg-amber-50 ring-amber-100",
  },
  {
    icon: FiCreditCard,
    key: "payments",
    accent: "text-emerald-600 bg-emerald-50 ring-emerald-100",
  },
  {
    icon: FiFileText,
    key: "documents",
    accent: "text-violet-600 bg-violet-50 ring-violet-100",
  },
  {
    icon: FiMessageCircle,
    key: "communication",
    accent: "text-rose-600 bg-rose-50 ring-rose-100",
  },
  {
    icon: FiShield,
    key: "security",
    accent: "text-slate-700 bg-slate-100 ring-slate-200",
  },
];

export const platformStats = [
  { value: "98.2%", key: "collection" },
  { value: "3x", key: "processing" },
  { value: "24/7", key: "access" },
  { value: "0", key: "installs" },
];

export const workflowItems = [
  {
    icon: FiDatabase,
    key: "import",
  },
  {
    icon: FiBell,
    key: "automate",
  },
  {
    icon: FiPieChart,
    key: "control",
  },
];

export const solutionItems = [
  {
    icon: FiUsers,
    key: "companies",
  },
  {
    icon: FiTool,
    key: "teams",
  },
  {
    icon: FiCheckCircle,
    key: "residents",
  },
];

export const pricingPlans = [
  {
    key: "start",
    price: "€49",
    featureKeys: ["houses", "residents", "documents"],
  },
  {
    key: "growth",
    price: "€129",
    featureKeys: ["houses", "reminders", "analytics"],
    featured: true,
  },
  {
    key: "network",
    priceKey: "customPrice",
    featureKeys: ["unlimited", "api", "support"],
  },
];

export const faqItems = [
  "install",
  "multiple",
  "documents",
  "residents",
];

export const trustItems = [
  { icon: FiCloud, key: "cloud" },
  { icon: FiLock, key: "security" },
  { icon: FiCheckCircle, key: "processes" },
];
