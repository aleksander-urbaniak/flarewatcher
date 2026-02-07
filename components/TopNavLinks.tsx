"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/zones", label: "Zone management" },
  { href: "/config", label: "Settings" },
  { href: "/alerting", label: "Alerting" },
  { href: "/logs", label: "Logs" },
];

export default function TopNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="topnav">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(link.href));
        return (
          <a
            key={link.href}
            href={link.href}
            className={`topnav-link${active ? " active" : ""}`}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
